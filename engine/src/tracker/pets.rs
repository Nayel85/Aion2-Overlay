//! The pet collection: souls picked up, pets levelled and unlocked, crystals, the login's sync.
//! Methods of `Tracker` (mod.rs), called from its `frame` as the messages come.

use super::*;

impl Tracker {
    pub(super) fn session(&self, pet: u32) -> u32 {
        let name = self.store.current.clone().unwrap_or_default();
        self.sessions.get(&name).and_then(|s| s.get(&pet)).copied().unwrap_or(0)
    }

    /// Entering the world sends the whole collection: the server's numbers for every pet.
    pub(super) fn sync(&mut self, ts: i64, coll: &p::Collection) {
        let levels: HashMap<u32, u32> = coll.levels.iter().copied().collect();
        let souls: HashMap<u32, u32> = coll.souls.iter().copied().collect();
        let mut corrected = Vec::new();
        let mut ids: Vec<u32> = levels.keys().chain(souls.keys()).copied().collect();
        ids.sort_unstable();
        ids.dedup();
        for id in ids {
            let name = self.store.name(id).map(str::to_string);
            let pet = self.store.pets_mut().entry(id).or_default();
            let now = souls.get(&id).copied().unwrap_or(0);
            if pet.souls != now && (pet.souls > 0 || name.is_some()) {
                corrected.push(json!({ "id": id, "name": name, "before": pet.souls, "after": now }));
            }
            pet.souls = now;
            if let Some(&level) = levels.get(&id) {
                pet.level = Some(level);
                pet.level_estimated = false;
            }
        }
        self.save();
        tracing::info!("login sync: {} pets, {} souls", souls.len(), souls.values().sum::<u32>());
        (self.emit)(json!({
            "type": "sync", "ts": ts, "pets": souls.len(), "souls": souls.values().sum::<u32>(),
            "corrected": corrected, "collection": self.snapshot(),
        }));
    }

    pub(super) fn souls(&mut self, ts: i64, list: &[(u32, u32)]) {
        // The kill just before (its credit comes ~0.3 s before the souls) names
        // the pet's monster; only when the souls are one pet's, so two pets
        // never take each other's monster.
        let kill = self.recent.iter().filter(|(t, _)| (0..=NAME_WINDOW_MS).contains(&(ts - t))).max_by_key(|(t, _)| *t);
        let kill_name = match (list.len(), kill) {
            (1, Some((_, mob))) => self.mob_code.get(mob).and_then(|code| self.npc_name(*code)),
            _ => None,
        };
        // Whoever was credited with the kill just before is (most often) you.
        let credited = self.credits.iter().filter(|(t, _, _)| (0..=NAME_WINDOW_MS).contains(&(ts - t))).max_by_key(|(t, _, _)| *t);
        if let Some((_, _, owner)) = credited {
            *self.self_votes.entry(*owner).or_default() += 1;
        }
        let name = self.store.current.clone().unwrap_or_default();
        for &(id, amount) in list {
            let pet = self.store.pets_mut().entry(id).or_default();
            pet.souls += amount;
            // Past its level's need the pet goes up a level, and the game takes
            // that level's cost from its count: the souls past it stay (24 + 5 at
            // a cost of 25 leaves 4, A2Tools pet-souls 0.5.4, 2026-11-05).
            let was = match pet.level {
                Some(level) => level,
                None => {
                    pet.level_estimated = true;
                    0
                }
            };
            let mut level = was;
            while level < MAX_LEVEL && pet.souls >= LEVEL_NEED[level as usize] {
                pet.souls -= LEVEL_NEED[level as usize];
                level += 1;
            }
            pet.level = Some(level);
            let levelled = level > was;
            if let Some(kill_name) = &kill_name {
                self.store.vote(id, kill_name, 1);
            }
            *self.sessions.entry(name.clone()).or_default().entry(id).or_default() += amount;
            (self.emit)(json!({ "type": "soul", "ts": ts, "amount": amount, "pet": self.view(id), "levelUp": levelled }));
        }
        self.save();
    }

    /// The game says a pet reached a level. Already there from its souls: the
    /// souls picked up since stay. Behind: it takes the level, and the game
    /// takes the cost of each level skipped from its souls (Karnif: 25 -> 0,
    /// 29 -> 4).
    pub(super) fn level_up(&mut self, id: u32, level: u32) {
        let pet = self.store.pets_mut().entry(id).or_default();
        let was = pet.level.unwrap_or(0);
        if was >= level {
            pet.level_estimated = false;
            return;
        }
        let cost: u32 = LEVEL_NEED[was as usize..level as usize].iter().sum();
        pet.level = Some(level);
        pet.level_estimated = false;
        pet.souls = pet.souls.saturating_sub(cost);
        self.save();
        tracing::info!("level up: pet {id} is Lv{level} (from the game)");
        (self.emit)(json!({ "type": "pet", "pet": self.view(id) }));
    }

    /// A pet is yours now (a chest's, `09 90`), at `level`, with the souls it
    /// already had. Before, it showed as not had until the next login.
    pub(super) fn pet_unlocked(&mut self, id: u32, level: u32) {
        let pet = self.store.pets_mut().entry(id).or_default();
        if pet.level.is_some_and(|was| was >= level) {
            pet.level_estimated = false;
            return;
        }
        pet.level = Some(level);
        pet.level_estimated = false;
        self.save();
        tracing::info!("pet unlocked: pet {id} at Lv{level}");
        (self.emit)(json!({ "type": "pet", "pet": self.view(id) }));
    }

    pub(super) fn maxed(&self, id: u32) -> bool {
        self.store.pets().and_then(|p| p.get(&id)).and_then(|p| p.level).unwrap_or(0) >= MAX_LEVEL
    }

    /// Genus crystals, from a monster whose pet is maxed. The message names no
    /// pet, so it is the pet of a monster killed just before (yours if it is
    /// known which player you are), of the crystal's genus. Among those:
    /// - a pet already at Lv3 is it: the nearest such kill;
    /// - else, if they are all one pet's monsters, that pet is at Lv3 in game
    ///   whatever was saved (souls missed): it is corrected and credited;
    /// - else no one: two pets that could both be it.
    pub(super) fn crystal(&mut self, ts: i64, crystal: &p::Crystal) {
        let genus = p::crystal_genus(crystal.genus);
        let credited: Vec<(i64, u32, u32)> =
            self.credits.iter().filter(|(t, _, _)| (0..=NAME_WINDOW_MS).contains(&(ts - t))).map(|&(t, m, o)| (ts - t, m, o)).collect();
        let me = self.me();
        let mine: Vec<_> = credited.iter().filter(|c| Some(c.2) == me).copied().collect();
        let kills = if mine.is_empty() { credited } else { mine };
        // (ms before, monster code, pet) for each kill whose monster drops a pet of this genus.
        let mut candidates: Vec<(i64, u32, u32)> = kills
            .iter()
            .filter_map(|&(ago, mob, _)| {
                let code = *self.mob_code.get(&mob)?;
                let pet = *self.pets.droppers.get(&code)?;
                let pet_genus = self.pets.genus.get(&pet).map(String::as_str);
                (genus.is_none() || pet_genus.is_none() || pet_genus == genus).then_some((ago, code, pet))
            })
            // A pet the game said is below Lv3 (login sync, its level up) still gets souls, not
            // crystals: it is not this crystal's, however near its monster died.
            .filter(|&(_, _, pet)| {
                let known = self.store.pets().and_then(|p| p.get(&pet)).filter(|p| p.level.is_some() && !p.level_estimated);
                known.is_none_or(|p| p.level >= Some(MAX_LEVEL))
            })
            .collect();
        candidates.sort();
        let maxed: Vec<_> = candidates.iter().filter(|c| self.maxed(c.2)).copied().collect();
        let (pick, corrected) = if let Some(&first) = maxed.first() {
            (Some(first), false)
        } else if !candidates.is_empty() && candidates.iter().all(|c| c.2 == candidates[0].2) {
            (Some(candidates[0]), true)
        } else {
            (None, false)
        };
        let raw = crystal.raw.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(" ");
        let mut event = json!({
            "type": "crystal", "ts": ts, "amount": crystal.amount, "genus": genus,
            "npc": pick.map(|p| p.1), "raw": raw, "pet": null, "levelCorrected": false, "kills": [],
        });
        match pick {
            Some((_, code, id)) => {
                let name = self.npc_name(code);
                let pet = self.store.pets_mut().entry(id).or_default();
                if corrected {
                    pet.level = Some(MAX_LEVEL);
                    pet.souls = 0;
                    pet.level_estimated = false;
                    event["levelCorrected"] = json!(true);
                }
                pet.crystals += crystal.amount;
                if let Some(name) = name {
                    self.store.vote(id, &name, 1);
                }
                self.save();
                event["pet"] = self.view(id);
            }
            None => {
                // What was considered, to see in the log why it went to no one.
                event["kills"] = Value::Array(
                    kills
                        .iter()
                        .map(|&(ago, mob, _)| {
                            let code = self.mob_code.get(&mob).copied();
                            json!({
                                "npc": code, "name": code.and_then(|c| self.npc_name(c)),
                                "pet": code.and_then(|c| self.pets.droppers.get(&c)), "ago": ago as f64 / 1000.0,
                            })
                        })
                        .collect(),
                );
            }
        }
        (self.emit)(event);
    }
}
