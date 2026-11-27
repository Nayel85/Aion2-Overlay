//! Monsters: who they are on (the aggro, a boss's target) and the hits between them and you.
//! Methods of `Tracker` (mod.rs), called from its `frame` as the messages come.

use super::*;

impl Tracker {
    /// A monster on someone (its target, its cast, its hit): kept for the aggro list, and when it is a boss
    /// on a player (you, your party, anyone in view), told for the party frames (`bossTarget`: on a
    /// change, or again after 3 s).
    pub(super) fn monster_on(&mut self, ts: i64, monster: u32, target: u32) {
        if monster == target || !self.mob_code.contains_key(&monster) {
            return;
        }
        self.aggro.hit(monster as i32, target as i32, 0, ts);
        let boss = self.storage.is_boss(monster as i32) || self.mob_code.get(&monster).is_some_and(|&c| self.npcs.is_boss(c as i32));
        if boss && (Some(target) == self.me() || self.players.contains_key(&target)) {
            let changed = self.boss_target.is_none_or(|(b, t, at)| b != monster || t != target || ts - at > 3_000);
            if changed {
                self.boss_target = Some((monster, target, ts));
                (self.emit)(json!({ "type": "bossTarget", "ts": ts, "boss": monster, "target": target }));
            }
        }
        self.aggro_tick(ts);
    }

    /// A monster on no one any more (dead, gone, or letting go): the boss the party frames show is off.
    pub(super) fn monster_off(&mut self, ts: i64, monster: u32) {
        if self.boss_target.is_some_and(|(b, _, _)| b == monster) {
            self.boss_target = None;
            (self.emit)(json!({ "type": "bossTarget", "ts": ts, "boss": monster, "target": null }));
        }
    }

    /// The monsters on you now (aggro.rs), told when the list changes: `{"type": "aggro", "mobs": [...]}`.
    /// Asked as soon as anything changes it (a hit, a cast, a target, a death), and twice a second by
    /// the sidecar for those that leave you without a word (`AGGRO_MS` of silence).
    pub fn aggro_tick(&mut self, now: i64) {
        let Some(you) = self.me() else { return };
        let (codes, npcs, storage) = (&self.mob_code, &self.npcs, &self.storage);
        let mobs = self.aggro.on(you as i32, now, |entity| {
            let code = *codes.get(&(entity as u32))?;
            let name = npcs.get_npc_name(code as i32);
            let boss = storage.is_boss(entity) || npcs.is_boss(code as i32);
            Some((Some(code as i32), if name.is_empty() { format!("#{code}") } else { name }, boss))
        });
        let told: Vec<(i32, i64)> = mobs.iter().map(|m| (m.entity, m.since)).collect();
        if told != self.aggro_told {
            self.aggro_told = told;
            (self.emit)(json!({ "type": "aggro", "ts": now, "mobs": mobs }));
        }
    }

    /// The hits in a `04 38`: a player's skill says their class, and those between you and another
    /// player are kept (`pvp`).
    pub(super) fn damage(&mut self, ts: i64, frame: &[u8]) {
        let me = self.me();
        // A monster's hit on anyone: who it is on (aggro.rs); a monster known by its spawn.
        if let Some((target, monster)) = damage::monster_hit(frame) {
            self.monster_on(ts, monster, target);
        }
        // Nobody in view: no player's hit to read.
        if self.players.is_empty() && me.is_none() {
            return;
        }
        let storage = self.storage.clone();
        for h in damage::hits(frame, |v| storage.is_plausible_entity_id(v)) {
            // You on a monster: it turns on you (unless it is on someone else already).
            if Some(h.actor) == me && self.mob_code.contains_key(&h.target) {
                self.aggro.engaged(h.target as i32, h.actor as i32, ts);
                self.aggro_tick(ts);
            }
            if self.players.is_empty() {
                continue;
            }
            if self.players.contains_key(&h.actor) || Some(h.actor) == me {
                if let Some(class) = pvp::skill_class(h.skill) {
                    let before = self.classes.insert(h.actor, class);
                    if let Some(said) = before.filter(|&b| b != class) {
                        let name = self.players.get(&h.actor).map_or("you", |p| p.name.as_str());
                        tracing::warn!("class check: {name}'s spawn record says {said}, their skills say {class}");
                    }
                    if before != Some(class) {
                        self.class_learnt(ts, h.actor);
                    }
                }
            }
            // A hit of a player on another, you or not: a fight's, should it end in a kill.
            let player = |e: u32| Some(e) == me || self.players.contains_key(&e);
            if h.actor == h.target || !player(h.actor) || !player(h.target) {
                continue;
            }
            let has = |s: SpecialDamage| h.specials.contains(&s);
            self.pvp_hits.push(pvp::Hit {
                ts,
                actor: h.actor,
                target: h.target,
                skill: h.skill,
                damage: h.damage,
                crit: h.crit,
                dot: false,
                back: has(SpecialDamage::Back),
                perfect: has(SpecialDamage::Perfect),
                double: has(SpecialDamage::Double),
                parry: has(SpecialDamage::Parry),
                multi: u32::try_from(h.multi_hit_count).unwrap_or(0),
            });
        }
    }
}
