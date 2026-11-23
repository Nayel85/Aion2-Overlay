//! Copied from A2Tools DPS Meter (taengu/A2Tools-DPS-Meter, GPL-3.0), rev c19960d,
//! `src-tauri/src/history/personal_bests.rs`: built only with its `desktop` feature, which the engine does not
//! take (it would bring the library's desktop app). Kept as it is but for its paths.

//! Personal bests, per character and dungeon boss, kept apart from the fight
//! files (`personal_bests.json`): pruning the history (500 fights) or losing
//! its files never takes one away, and the kill and wipe totals keep counting
//! the fights that are gone.

use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use a2tools_dps_meter_lib::entity::fight_record::FightSummary;

/// One best: its value (ms for the fastest kill, damage per second for the
/// others), the fight it came from, when, your class, and whether the kill
/// was recorded (a fight from before 2.0.87 can't always tell).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Best {
    pub value: i64,
    pub fight_id: String,
    pub at_ms: i64,
    pub job: String,
    pub confirmed: bool,
}

/// The fights' outcomes no longer in the history.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub kills: u32,
    pub wipes: u32,
    pub unconfirmed: u32,
}

/// A character's bests on one boss of one instance (its difficulty with it).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Encounter {
    pub character: String,
    pub server: u16,
    pub dungeon_id: i32,
    pub mob_code: i32,
    pub boss_name: String,
    pub final_boss: bool,
    pub raid: bool,
    #[serde(default)]
    pub dungeon_tier: u8,
    pub fastest: Option<Best>,
    pub my_dps: Option<Best>,
    pub party_dps: Option<Best>,
    pub archived: Counts,
}

#[derive(Default, Serialize, Deserialize)]
pub struct PersonalBests {
    pub encounters: BTreeMap<String, Encounter>,
}

/// A dungeon boss fought by a known you, not a training dummy: what counts.
fn counted(f: &FightSummary) -> bool {
    f.dungeon_id != 0 && !f.is_train && !f.is_live && !f.my_name.is_empty() && f.duration_ms > 0
}

fn key(f: &FightSummary) -> String {
    format!("{}|{}|{}|{}", f.my_name, f.my_server, f.dungeon_id, f.mob_code)
}

/// `new` replaces `old` when it is the same fight (saved again), a recorded
/// kill over one that isn't, or better at the same confirmation.
fn take(old: &mut Option<Best>, new: Best, lower_is_better: bool) -> bool {
    let better = match old {
        None => true,
        Some(o) if o.fight_id == new.fight_id => *o != new,
        Some(o) if new.confirmed != o.confirmed => new.confirmed,
        Some(o) => if lower_is_better { new.value < o.value } else { new.value > o.value },
    };
    if better {
        *old = Some(new);
    }
    better
}

impl PersonalBests {
    pub fn load(path: &std::path::Path) -> Self {
        std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save(&self, path: &std::path::Path) {
        if let Ok(bytes) = serde_json::to_vec(self) {
            if let Err(e) = write_atomic(path, &bytes) {
                tracing::warn!("Personal bests not written: {e}");
            }
        }
    }

    /// Take each kill in `fights` that beats a best. Whether anything changed.
    pub fn update(&mut self, fights: &[FightSummary]) -> bool {
        let mut changed = false;
        for f in fights.iter().filter(|f| counted(f) && f.outcome != "wipe") {
            let e = self.encounters.entry(key(f)).or_insert_with(|| {
                changed = true;
                Encounter {
                    character: f.my_name.clone(),
                    server: f.my_server,
                    dungeon_id: f.dungeon_id,
                    mob_code: f.mob_code,
                    ..Default::default()
                }
            });
            if e.boss_name != f.boss_name || e.final_boss != f.final_boss || e.raid != f.raid || e.dungeon_tier != f.dungeon_tier {
                e.boss_name = f.boss_name.clone();
                e.final_boss = f.final_boss;
                e.raid = f.raid;
                e.dungeon_tier = f.dungeon_tier;
                changed = true;
            }
            let best = |value: i64| Best {
                value,
                fight_id: f.id.clone(),
                at_ms: f.start_time_ms,
                job: f.my_job.clone(),
                confirmed: f.outcome == "kill",
            };
            changed |= take(&mut e.fastest, best(f.duration_ms), true);
            changed |= take(&mut e.my_dps, best(f.my_damage * 1000 / f.duration_ms), false);
            changed |= take(&mut e.party_dps, best(f.total_damage as i64 * 1000 / f.duration_ms), false);
        }
        changed
    }

    /// A fight pruned from the history: its outcome joins the totals.
    pub fn archive(&mut self, f: &FightSummary) {
        if !counted(f) {
            return;
        }
        let e = self.encounters.entry(key(f)).or_insert_with(|| Encounter {
            character: f.my_name.clone(),
            server: f.my_server,
            dungeon_id: f.dungeon_id,
            mob_code: f.mob_code,
            boss_name: f.boss_name.clone(),
            final_boss: f.final_boss,
            raid: f.raid,
            dungeon_tier: f.dungeon_tier,
            ..Default::default()
        });
        match f.outcome.as_str() {
            "kill" => e.archived.kills += 1,
            "wipe" => e.archived.wipes += 1,
            _ => e.archived.unconfirmed += 1,
        }
    }

    /// A fight the player deleted: the bests it held go, to be taken again
    /// from what is left (`update`).
    pub fn forget(&mut self, fight_id: &str) -> bool {
        let mut changed = false;
        for e in self.encounters.values_mut() {
            for best in [&mut e.fastest, &mut e.my_dps, &mut e.party_dps] {
                if best.as_ref().is_some_and(|b| b.fight_id == fight_id) {
                    *best = None;
                    changed = true;
                }
            }
        }
        changed
    }

    /// The fights holding a best: pruning keeps them.
    pub fn fight_ids(&self) -> HashSet<String> {
        self.encounters
            .values()
            .flat_map(|e| [&e.fastest, &e.my_dps, &e.party_dps])
            .flatten()
            .map(|b| b.fight_id.clone())
            .collect()
    }
}

/// The library's `atomic_file::write`, as the engine has none: a temporary file, then renamed over.
fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}
