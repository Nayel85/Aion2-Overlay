//! The monsters on you: those whose last hit was on you, lately (`AGGRO_MS`), and that are still alive.
//! The tracker reads every `04 38` (tracker/damage.rs `monster_hit`: the meter's parser keeps no monster's
//! hit): each monster's last target and when; a monster you hit is on you too until it hits someone else.
//! The sidecar asks for the list twice a second; the app is told when it changes (`aggro`).

use std::collections::HashMap;

/// A monster that has not hit you for this long has left you (or stands there, out of reach).
pub const AGGRO_MS: i64 = 6_000;

#[derive(Debug, Clone, Copy, PartialEq)]
struct Hold {
    target: i32,
    /// When it turned on its target, and last hit it.
    since: i64,
    last: i64,
    /// What it dealt its target since it turned on it.
    damage: i64,
}

/// One monster on you.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnYou {
    pub entity: i32,
    pub code: Option<i32>,
    pub name: String,
    pub boss: bool,
    pub since: i64,
    pub last_hit: i64,
    pub damage: i64,
}

#[derive(Default)]
pub struct Aggro {
    holds: HashMap<i32, Hold>,
}

impl Aggro {
    /// A hit, as the storage records it.
    pub fn hit(&mut self, actor: i32, target: i32, damage: i64, at: i64) {
        if actor == target {
            return;
        }
        let hold = self.holds.entry(actor).or_insert(Hold { target, since: at, last: at, damage: 0 });
        if hold.target != target {
            *hold = Hold { target, since: at, last: at, damage: 0 };
        }
        hold.last = at;
        hold.damage += damage.max(0);
    }

    /// You hit a monster: on you, unless it is on someone else lately.
    pub fn engaged(&mut self, monster: i32, you: i32, at: i64) {
        match self.holds.get_mut(&monster) {
            Some(h) if h.target != you && at - h.last <= AGGRO_MS => {}
            Some(h) if h.target == you => h.last = h.last.max(at),
            _ => {
                self.holds.insert(monster, Hold { target: you, since: at, last: at, damage: 0 });
            }
        }
    }

    /// A monster let go (its target none, `35 38`): on no one.
    pub fn released(&mut self, monster: i32) {
        self.holds.remove(&monster);
    }

    /// A monster died (or anyone did): no longer on anyone.
    pub fn died(&mut self, entity: i32) {
        self.holds.remove(&entity);
    }

    /// The monsters on `me` now: the latest to turn on you first. `monster` tells a monster from a
    /// player (a player's hits on you are PvP, not aggro) and names it: its code, name and whether a boss.
    pub fn on(&mut self, me: i32, now: i64, monster: impl Fn(i32) -> Option<(Option<i32>, String, bool)>) -> Vec<OnYou> {
        self.holds.retain(|_, h| now - h.last <= AGGRO_MS);
        let mut list: Vec<OnYou> = self
            .holds
            .iter()
            .filter(|(_, h)| h.target == me)
            .filter_map(|(&entity, h)| {
                let (code, name, boss) = monster(entity)?;
                Some(OnYou { entity, code, name, boss, since: h.since, last_hit: h.last, damage: h.damage })
            })
            .collect();
        list.sort_by(|a, b| b.boss.cmp(&a.boss).then(a.since.cmp(&b.since)).then(a.entity.cmp(&b.entity)));
        list
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ME: i32 = 10;
    fn monster(e: i32) -> Option<(Option<i32>, String, bool)> {
        (e >= 100).then(|| (Some(2_100_000 + e), format!("Mob {e}"), e == 999))
    }

    #[test]
    fn the_monsters_whose_last_hit_was_on_you_lately_and_alive() {
        let mut a = Aggro::default();
        a.hit(100, ME, 50, 1_000);
        a.hit(100, ME, 30, 2_000);
        a.hit(101, 11, 40, 2_000); // on someone else
        a.hit(999, ME, 500, 3_000); // a boss: first
        a.hit(20, ME, 70, 3_000); // a player: PvP, not aggro
        let on = a.on(ME, 4_000, monster);
        assert_eq!(on.iter().map(|m| m.entity).collect::<Vec<_>>(), vec![999, 100]);
        assert_eq!((on[1].since, on[1].last_hit, on[1].damage), (1_000, 2_000, 80));
        // It turns on someone else: off the list, its count starts again if it comes back.
        a.hit(100, 11, 10, 4_500);
        a.hit(100, ME, 5, 5_000);
        assert_eq!(a.on(ME, 5_000, monster).iter().find(|m| m.entity == 100).map(|m| (m.since, m.damage)), Some((5_000, 5)));
        // Dead, or quiet for too long: gone.
        a.died(999);
        assert!(a.on(ME, 5_000 + AGGRO_MS + 1, monster).is_empty());
    }
}

/// A packet log (the app's Packets overlay, `recordings/packets-*.txt`) through the tracker's readers:
/// the monsters on you as the list changes. You are the player the monsters hit most (a log seldom
/// starts with your login). `AGGRO_LOG=<file> cargo test --release replay_a_packet_log -- --ignored --nocapture`
#[cfg(test)]
mod replay {
    use std::collections::HashMap;

    use super::Aggro;
    use crate::tracker::damage;

    fn frame(bytes: &[u8]) -> Vec<u8> {
        let mut v = (bytes.len() + 4) as u32;
        let mut out = Vec::new();
        loop {
            let b = (v & 0x7F) as u8;
            v >>= 7;
            if v == 0 {
                out.push(b);
                break;
            }
            out.push(b | 0x80);
        }
        out.extend_from_slice(bytes);
        out
    }

    #[test]
    #[ignore]
    fn replay_a_packet_log() {
        let Ok(path) = std::env::var("AGGRO_LOG") else { return };
        let mut lines = Vec::new();
        for line in std::fs::read_to_string(&path).unwrap().lines() {
            let parts: Vec<&str> = line.split('|').map(str::trim).collect();
            let t: Vec<f64> = parts.first().map(|t| t.split(':').filter_map(|x| x.parse().ok()).collect()).unwrap_or_default();
            if parts.len() != 4 || t.len() != 3 {
                continue;
            }
            let ms = ((t[0] * 3600.0 + t[1] * 60.0 + t[2]) * 1000.0) as i64;
            let bytes: Vec<u8> = (0..parts[3].len()).step_by(2).filter_map(|i| u8::from_str_radix(parts[3].get(i..i + 2)?, 16).ok()).collect();
            lines.push((parts[0].to_string(), ms, frame(&bytes)));
        }
        let mut targets = HashMap::<u32, usize>::new();
        for (_, _, f) in &lines {
            if let Some((t, _)) = damage::monster_hit(f) {
                *targets.entry(t).or_default() += 1;
            }
        }
        let you = targets.into_iter().max_by_key(|&(_, n)| n).map(|(t, _)| t as i32).expect("no monster hit anyone");
        println!("you: #{you}");
        let mut aggro = Aggro::default();
        let (mut told, mut checked) = (String::new(), 0);
        for (time, ms, f) in &lines {
            if let Some((t, m)) = damage::monster_hit(f) {
                aggro.hit(m as i32, t as i32, 0, *ms);
            }
            // A monster's cast, or the target of the one you look at.
            if let Some((caster, target, skill)) = crate::tracker::protocol::cast_on(f) {
                if (1_000_000..=9_999_999).contains(&skill) && caster as i32 != you {
                    aggro.hit(caster as i32, target as i32, 0, *ms);
                }
            }
            if let Some((entity, target)) = crate::tracker::protocol::selection_target(f) {
                if entity as i32 != you && target == 0 {
                    aggro.released(entity as i32);
                } else if entity as i32 != you {
                    aggro.hit(entity as i32, target as i32, 0, *ms);
                }
            }
            // Yours on a monster (a hit on an entity no player: the log has no spawns to tell them).
            for h in damage::hits(f, |_| true) {
                if h.actor as i32 == you && h.target as i32 != you {
                    aggro.engaged(h.target as i32, you, *ms);
                }
            }
            if ms - checked < 500 {
                continue;
            }
            checked = *ms;
            let list = aggro.on(you, *ms, |e| Some((None, format!("#{e}"), false)));
            let now = list.iter().map(|m| m.name.clone()).collect::<Vec<_>>().join(", ");
            if now != told {
                println!("{time} | {} on you: {now}", list.len());
                told = now;
            }
        }
    }
}
