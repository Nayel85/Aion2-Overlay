//! Other players: their cards and combat power, your target, the enemies in view (an arena's other team), PvP kills and fights.
//! Methods of `Tracker` (mod.rs), called from its `frame` as the messages come.

use super::*;

impl Tracker {
    /// A player card read: kept, its combat power through `steady_cp`. An enemy in view it names
    /// gets the numbers on the list.
    pub(super) fn player_card(&mut self, ts: i64, card: p::PlayerCard) {
        let entry = self.card_mut((card.name.clone(), card.server));
        entry.level = card.level;
        entry.gear_score = card.gear_score;
        entry.class = p::roster_class(card.class).or(entry.class);
        steady_cp(entry, card.combat_power);
        let shown = self.enemies.values().any(|e| e.name == card.name && e.server == Some(card.server));
        if shown {
            self.enemies_changed(ts);
        }
        self.refresh_selected(ts);
    }

    /// Write the cards when some changed and a minute has passed since the last write.
    pub(super) fn save_cards(&mut self, ts: i64) {
        if !self.cards_dirty || ts - self.cards_saved_ms < CARDS_SAVE_EVERY_MS {
            return;
        }
        self.cards_dirty = false;
        self.cards_saved_ms = ts;
        let Some(path) = self.path.as_ref().map(|p| p.with_file_name(CARDS_FILE)) else { return };
        let list: Vec<SavedCard> = self
            .cards
            .iter()
            .filter(|(_, c)| c.cp.is_some() || c.level > 0 || c.class.is_some())
            .map(|((name, server), c)| SavedCard { name: name.clone(), server: *server, level: c.level, gear_score: c.gear_score, class: c.class.map(str::to_string), cp: c.cp })
            .collect();
        if let Err(e) = serde_json::to_string(&list).map_err(|e| e.to_string()).and_then(|s| std::fs::write(&path, s).map_err(|e| e.to_string())) {
            tracing::warn!("could not save the player cards: {e}");
        }
    }

    /// A player's card to update, made if new. Past `MAX_CARDS` the one updated longest ago makes
    /// room: a crowd (a city, a siege) never stops new players' cards being kept.
    pub(super) fn card_mut(&mut self, key: (String, u16)) -> &mut Card {
        self.card_tick += 1;
        self.cards_dirty = true;
        if !self.cards.contains_key(&key) && self.cards.len() >= MAX_CARDS {
            if let Some(oldest) = self.cards.iter().min_by_key(|(_, c)| c.touched).map(|(k, _)| k.clone()) {
                self.cards.remove(&oldest);
            }
        }
        let tick = self.card_tick;
        let card = self.cards.entry(key).or_default();
        card.touched = tick;
        card
    }

    /// The combat power a player's spawn gives, onto their card. True when the shown value changed.
    pub(super) fn spawn_combat_power(&mut self, player: &p::Player) -> bool {
        let (Some(cp), Some(server)) = (player.combat_power, player.server) else { return false };
        let card = self.card_mut((player.name.clone(), server));
        if card.class.is_none() {
            card.class = player.class.and_then(p::roster_class);
        }
        let before = card.cp;
        steady_cp(card, cp);
        card.cp != before
    }

    /// A player you targeted: their sheet. It goes on their card (the Enemies overlay shows it), and
    /// to the app as your target.
    pub(super) fn target_info(&mut self, ts: i64, t: p::TargetInfo, raw: &[u8]) {
        if !CP_RANGE.contains(&t.combat_power) && ts - self.target_unread > 60_000 {
            self.target_unread = ts;
            let tail: String = raw.iter().rev().take(64).rev().map(|b| format!("{b:02x}")).collect();
            tracing::warn!("target info: no combat power read for {} ({}): tail {tail}", t.name, t.combat_power);
        }
        let card = self.card_mut((t.name.clone(), t.server));
        card.level = t.level;
        card.gear_score = t.gear_score;
        card.class = p::roster_class(t.class);
        steady_cp(card, t.combat_power);
        let cp = card.cp;
        let class = card.class;
        let enemy = matches!((p::server_faction(t.server), self.my_faction()), (Some(theirs), Some(mine)) if theirs != mine);
        (self.emit)(json!({
            "type": "target", "ts": ts, "name": t.name, "server": t.server, "level": t.level,
            "gearScore": t.gear_score, "combatPower": cp, "className": class, "legion": t.legion, "enemy": enemy,
        }));
        if self.enemies.values().any(|e| e.name == t.name && e.server == Some(t.server)) {
            self.enemies_changed(ts);
        }
    }

    /// The selected player's sheet again, after their card learned something.
    pub(super) fn refresh_selected(&mut self, ts: i64) {
        if let Some(entity) = self.selected_entity {
            self.selected(ts, entity);
        }
    }

    /// You selected an entity (`35 38`): when it is a player we know, their sheet goes to the app at
    /// once, with what is known of them (spawn, card, legion, skills seen); an unknown value is null,
    /// never a 0. Anything else clears the last one.
    pub(super) fn selected(&mut self, ts: i64, entity: u32) {
        self.selected_entity = None;
        let known = self
            .players
            .get(&entity)
            .map(|p| (p.name.clone(), p.server, p.legion.clone(), p.class.and_then(p::roster_class), p.pvp, p.open_pvp))
            .or_else(|| self.named.get(&entity).map(|(n, s, l)| (n.clone(), Some(*s), l.clone(), None, false, false)));
        let Some((name, server, legion, spawn_class, pvp, open_pvp)) = known else {
            (self.emit)(json!({ "type": "targetClear", "ts": ts }));
            return;
        };
        self.selected_entity = Some(entity);
        let card = server.and_then(|s| self.cards.get(&(name.clone(), s)));
        let class = card.and_then(|c| c.class).or(spawn_class).or_else(|| self.classes.get(&entity).copied());
        let enemy = matches!((server.and_then(p::server_faction), self.my_faction()), (Some(theirs), Some(mine)) if theirs != mine);
        let legion = legion.or_else(|| self.legions.get(&entity).cloned());
        (self.emit)(json!({
            "type": "target", "ts": ts, "entity": entity, "name": name, "server": server,
            "level": card.map(|c| c.level).filter(|&l| l > 0), "gearScore": card.map(|c| c.gear_score).filter(|&g| g > 0),
            "combatPower": card.and_then(|c| c.cp), "className": class, "legion": legion, "enemy": enemy,
            "pvp": pvp, "openPvp": open_pvp,
        }));
    }

    /// A player's class, newly read from their skills: the enemies' list shows it. Where their
    /// card says another (its class number, `p::roster_class`), the log says so: that table is
    /// A2Tools' from 14 players, and this is how the rest of it gets checked.
    pub(super) fn class_learnt(&mut self, ts: i64, entity: u32) {
        if let Some(player) = self.players.get(&entity) {
            let card = player.server.and_then(|s| self.cards.get(&(player.name.clone(), s))).and_then(|c| c.class);
            let skills = self.classes.get(&entity).copied();
            if let (Some(card), Some(skills)) = (card, skills) {
                if card != skills {
                    tracing::warn!("class check: {}'s card says {card}, their skills say {skills}", player.name);
                }
            }
        }
        if self.enemies.contains_key(&entity) {
            self.enemies_changed(ts);
        }
    }

    /// A player's class: their card's, else the one their skills say.
    pub(super) fn class_of(&self, entity: Option<u32>, name: &str, server: Option<u16>) -> Option<&'static str> {
        let card = server.and_then(|s| self.cards.get(&(name.to_string(), s))).and_then(|c| c.class);
        card.or_else(|| entity.and_then(|e| self.classes.get(&e).copied()))
    }

    /// A player's combat power, as their card shows it.
    pub(super) fn combat_power_of(&self, name: &str, server: Option<u16>) -> Option<u32> {
        server.and_then(|s| self.cards.get(&(name.to_string(), s))).and_then(|c| c.cp)
    }

    /// A saved PvP fight, by id.
    pub fn pvp_fight(&self, id: &str) -> Option<pvp::Fight> {
        self.pvp_fights.get(id).cloned()
    }

    /// One side of a PvP fight: what is known of that player.
    pub(super) fn pvp_side(&self, entity: u32, name: &str, server: Option<u16>, legion: Option<String>) -> pvp::Side {
        let card = server.and_then(|s| self.cards.get(&(name.to_string(), s)));
        pvp::Side {
            entity,
            name: name.to_string(),
            server,
            class_name: card.and_then(|c| c.class).or_else(|| self.classes.get(&entity).copied()).map(str::to_string),
            combat_power: card.and_then(|c| c.cp),
            legion,
        }
    }

    /// A kill you took part in: the fight with that player, saved from your hits on each other.
    /// Your kill, your death, or someone else's kill of a player you were fighting (an assist: the
    /// fight with the victim). None when you two exchanged no hits (a kill you only saw).
    pub(super) fn save_pvp_fight(&mut self, ts: i64, credit: &p::KillCredit, mine: bool, died: bool, my_legion: Option<String>, my_server: Option<u16>) -> Option<String> {
        let me = self.me()?;
        let my_name = self.store.current.clone()?;
        let opponent = if died { credit.killer } else { credit.victim };
        if opponent == me {
            return None;
        }
        // A fight you took part in: hits between you two. Then all of it: everyone's on either of you, and yours and theirs on anyone.
        if self.pvp_hits.between(me, opponent, ts).is_empty() {
            return None;
        }
        // Everyone's hits on either of you, and yours and theirs on anyone: your own log in it too.
        let hits = self.pvp_hits.around_any(&[me, opponent], ts);
        let them = if died {
            self.pvp_side(opponent, &credit.name, Some(credit.server), credit.legion.clone().or_else(|| self.legions.get(&opponent).cloned()))
        } else {
            let v = self.players.get(&opponent)?.clone();
            self.pvp_side(opponent, &v.name, v.server, v.legion.or_else(|| self.legions.get(&opponent).cloned()))
        };
        let me_side = self.pvp_side(me, &my_name, my_server, my_legion);
        let id = format!("pvp-{ts}-{opponent}");
        let outcome = if died { "death" } else if mine { "kill" } else { "assist" };
        let mut others: Vec<u32> = hits.iter().flat_map(|h| [h.actor, h.target]).filter(|&e| e != me && e != opponent).collect();
        others.sort_unstable();
        others.dedup();
        let others: Vec<pvp::Side> = others
            .into_iter()
            .filter_map(|e| {
                let p = self.players.get(&e)?.clone();
                Some(self.pvp_side(e, &p.name, p.server, p.legion.or_else(|| self.legions.get(&e).cloned())))
            })
            .collect();
        let mut fight = pvp::fight(id.clone(), ts, outcome, me_side, them, &hits);
        fight.others = others;
        if outcome == "assist" {
            fight.killer = Some(credit.name.clone());
        }
        tracing::info!("pvp fight saved: {} vs {} ({}, {} hits, {} other players)", fight.me.name, fight.opponent.name, fight.outcome, hits.len(), fight.others.len());
        self.pvp_fights.add(fight);
        Some(id)
    }

    /// The players of the other faction in view, by entity.
    pub fn enemy_ids(&self) -> HashSet<u32> {
        self.enemies.keys().copied().collect()
    }

    /// Your faction, from the server of the character playing.
    pub(super) fn my_faction(&self) -> Option<u8> {
        let name = self.store.current.as_ref()?;
        self.store.characters.get(name)?.server.and_then(p::server_faction)
    }

    pub(super) fn enemies_changed(&self, ts: i64) {
        let mut list: Vec<&p::Player> = self.enemies.values().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        let players: Vec<Value> =
            list.iter()
                .map(|e| {
                    let card = e.server.and_then(|s| self.cards.get(&(e.name.clone(), s)));
                    let position = self.enemy_places.get(&e.entity).map(|&(x, y)| [x.round() as i64, (-y).round() as i64]);
                    json!({
                        "position": position,
                        "entity": e.entity, "name": e.name, "server": e.server, "legion": e.legion, "pvp": e.pvp, "openPvp": e.open_pvp,
                        "level": card.map(|c| c.level).filter(|&l| l > 0), "gearScore": card.map(|c| c.gear_score).filter(|&g| g > 0), "combatPower": card.and_then(|c| c.cp),
                        "className": card.and_then(|c| c.class).or_else(|| self.classes.get(&e.entity).copied()),
                    })
                })
                .collect();
        (self.emit)(json!({ "type": "enemies", "ts": ts, "players": players }));
    }

    /// An enemy seen standing at game (x, y): their pin on the map moves (once a second at most).
    pub(super) fn enemy_moved(&mut self, ts: i64, entity: u32, x: f32, y: f32) {
        if !self.enemies.contains_key(&entity) {
            return;
        }
        self.enemy_places.insert(entity, (x, y));
        if ts - self.enemies_moved_ms >= ENEMY_MOVE_EVERY_MS {
            self.enemies_moved_ms = ts;
            self.enemies_changed(ts);
        }
    }

    pub(super) fn clear_enemies(&mut self, ts: i64) {
        self.enemy_places.clear();
        if !self.enemies.is_empty() {
            self.enemies.clear();
            self.enemies_changed(ts);
        }
    }

    /// An arena's teams, its players in their order (yours, then the other, as many each): the other one
    /// your enemies, those in view already told again.
    pub(super) fn arena_teams(&mut self, ts: i64, players: &[String]) {
        let half = players.len() / 2;
        let Some(me) = self.store.current.clone() else { return };
        if half == 0 || players.len() % 2 != 0 {
            return;
        }
        let (first, second) = players.split_at(half);
        let (mates, foes) = if first.contains(&me) { (first, second) } else if second.contains(&me) { (second, first) } else { return };
        self.arena_foes = foes.iter().cloned().collect();
        tracing::info!("arena: enemies {:?}", foes);
        (self.emit)(json!({ "type": "arenaTeams", "ts": ts, "mates": mates, "foes": foes }));
        self.enemies = self.players.iter().filter(|(_, p)| self.arena_foes.contains(&p.name)).map(|(e, p)| (*e, p.clone())).collect();
        self.enemies_changed(ts);
    }

    pub(super) fn kill_credit(&mut self, ts: i64, credit: &p::KillCredit) {
        if self.mob_code.contains_key(&credit.victim) {
            self.push_recent(ts, credit.victim);
            self.credits.push_back((ts, credit.victim, credit.killer));
            if self.credits.len() > 32 {
                self.credits.pop_front();
            }
        }
        // Your kills (anyone's until it is known which player you are): fighting is going on.
        let me = self.me();
        if (me.is_none() || me == Some(credit.killer)) && ts - self.last_combat >= COMBAT_EVERY_MS {
            self.last_combat = ts;
            (self.emit)(json!({ "type": "combat", "ts": ts }));
        }
        if (1000..=9999).contains(&credit.server) && self.named.len() < 2000 {
            self.named.insert(credit.killer, (credit.name.clone(), credit.server, credit.legion.clone()));
        }
        if credit.player_victim && (1000..=9999).contains(&credit.server) {
            self.pvp_kill(ts, credit);
            // Dead: not a threat until they come back (a new `45 36` lists them again).
            if self.enemies.remove(&credit.victim).is_some() {
                self.enemies_changed(ts);
            }
        }
    }

    /// Your legion, kept with the character playing (the kill feed's "my legion").
    pub(super) fn my_legion(&mut self, name: &str) {
        let Some(me) = self.store.current.clone() else { return };
        let entry = self.store.characters.entry(me).or_default();
        if entry.legion.as_deref() != Some(name) {
            entry.legion = Some(name.to_string());
            self.save();
        }
    }

    /// A player killed a player around you (the killing blow): passed on once,
    /// with the victim if they were in view, and whether it was you or your legion.
    pub(super) fn pvp_kill(&mut self, ts: i64, credit: &p::KillCredit) {
        let key = (credit.victim, credit.killer);
        if self.pvp_seen.get(&key).is_some_and(|&at| ts - at < PVP_REPEAT_MS) {
            return;
        }
        self.pvp_seen.retain(|_, at| ts - *at < 2 * PVP_REPEAT_MS);
        self.pvp_seen.insert(key, ts);
        let me = self.store.current.clone();
        let mine_entry = me.as_ref().and_then(|m| self.store.characters.get(m)).cloned().unwrap_or_default();
        if me.as_deref() == Some(credit.name.as_str()) {
            if let Some(legion) = &credit.legion {
                self.my_legion(legion);
            }
        }
        let my_legion = me.as_ref().and_then(|m| self.store.characters.get(m)?.legion.clone());
        let died = self.self_entity.is_some() && Some(credit.victim) == self.self_entity;
        let victim = if died {
            Some(json!({ "name": me, "server": mine_entry.server, "guild": my_legion }))
        } else {
            self.players.get(&credit.victim).map(|v| {
                json!({ "name": v.name, "server": v.server, "guild": v.legion.clone().or_else(|| self.legions.get(&credit.victim).cloned()) })
            })
        };
        let killer_legion = credit.legion.clone().or_else(|| self.legions.get(&credit.killer).cloned());
        // Legion names are per server: one of the same name elsewhere is another legion.
        let ours = |legion: Option<&str>, server: Option<u64>| {
            my_legion.is_some()
                && legion == my_legion.as_deref()
                && (server.is_none() || mine_entry.server.is_none() || server == mine_entry.server.map(u64::from))
        };
        let legion = ours(killer_legion.as_deref(), Some(credit.server as u64))
            || victim.as_ref().is_some_and(|v| ours(v["guild"].as_str(), v["server"].as_u64()));
        let mine = me.as_deref() == Some(credit.name.as_str()) && mine_entry.server.is_none_or(|s| s == credit.server);
        let fight = self.save_pvp_fight(ts, credit, mine, died, my_legion.clone(), mine_entry.server);
        let victim = victim.map(|mut v| {
            let server = v["server"].as_u64().and_then(|s| u16::try_from(s).ok());
            let class = v["name"].as_str().and_then(|n| self.class_of(Some(credit.victim), n, server));
            v["className"] = json!(class);
            v["combatPower"] = json!(v["name"].as_str().and_then(|n| self.combat_power_of(n, server)));
            v
        });
        (self.emit)(json!({
            "type": "pvpKill", "ts": ts, "fight": fight,
            "killer": {
                "name": credit.name, "server": credit.server, "guild": killer_legion,
                "className": self.class_of(Some(credit.killer), &credit.name, Some(credit.server)),
                "combatPower": self.combat_power_of(&credit.name, Some(credit.server)),
            },
            "victim": victim,
            "mine": mine,
            "died": died,
            "legion": legion,
        }));
    }
}
