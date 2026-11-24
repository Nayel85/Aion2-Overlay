// Copied from A2Tools DPS Meter (GPL-3.0), https://github.com/taengu/A2Tools-DPS-Meter
// src-tauri/src/history/fight_history.rs at 08b249d49ef18be9ac9b41d8dd35596ae99aacfd.
// Changed: given its folder rather than the app's data folder; written with a
// temporary file and a rename instead of upstream's atomic_file.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::SystemTime;

use parking_lot::{Mutex, MutexGuard};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use a2tools_dps_meter_lib::entity::fight_record::{FightRecord, FightSummary};
use crate::bests::personal_bests::PersonalBests;

/// How many fights to keep on disk.
///
/// Records average around 73 KB — they carry a timestamp per hit — so this is
/// roughly 35 MB of history, and it is the first limit this directory has ever
/// had. Generous on purpose: someone who has been playing for months should not
/// find their history quietly truncated because a number was chosen tightly.
const MAX_HISTORY_FIGHTS: usize = 500;

/// Whether `name` is a single file name: no path separator, no "..", no
/// drive prefix. Fight ids and icon keys come from the webview and become
/// file names under the app data directory.
pub fn is_plain_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':', '\0']) && !name.contains("..")
}

fn check_id(id: &str) -> Result<(), String> {
    if is_plain_name(id) {
        Ok(())
    } else {
        Err(format!("Invalid fight id: {id:?}"))
    }
}

// v2: the summaries tell you in each fight (the library's history::summary); v1's are made again.
const INDEX_FILE: &str = ".fight-summaries-v2";
/// The personal bests, apart from the fights (the library's PersonalBests).
const BESTS_FILE: &str = "personal_bests.json";

#[derive(Deserialize, Eq, PartialEq, Serialize)]
struct FileStamp {
    modified: SystemTime,
    len: u64,
}

impl FileStamp {
    fn read(path: &Path) -> std::io::Result<Self> {
        let metadata = fs::metadata(path)?;
        Ok(Self {
            modified: metadata.modified()?,
            len: metadata.len(),
        })
    }
}

#[derive(Deserialize, Serialize)]
struct IndexedFight {
    stamp: FileStamp,
    summary: FightSummary,
}

#[derive(Default)]
struct HistoryIndex {
    fights: HashMap<String, IndexedFight>,
    dirty: bool,
}

impl HistoryIndex {
    fn load(dir: &Path) -> Self {
        let fights = fs::read(dir.join(INDEX_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            fights,
            dirty: false,
        }
    }

    /// Reconcile imports, external edits and interrupted saves against the original fight files.
    fn refresh(&mut self, dir: &Path) -> std::io::Result<()> {
        let mut present = HashSet::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "json") {
                continue;
            }
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            present.insert(name.clone());
            let Ok(stamp) = FileStamp::read(&path) else {
                continue;
            };
            if self
                .fights
                .get(&name)
                .is_some_and(|entry| entry.stamp == stamp)
            {
                continue;
            }
            match fs::read(&path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<FightRecord>(&bytes).ok())
            {
                Some(record) => {
                    self.fights.insert(
                        name,
                        IndexedFight {
                            stamp,
                            summary: summarize(&record),
                        },
                    );
                    self.dirty = true;
                }
                None => self.remove(&name),
            }
        }
        let count = self.fights.len();
        self.fights.retain(|name, _| present.contains(name));
        self.dirty |= self.fights.len() != count;
        Ok(())
    }

    fn remove(&mut self, name: &str) {
        self.dirty |= self.fights.remove(name).is_some();
    }

    fn store(&mut self, dir: &Path) {
        if !self.dirty {
            return;
        }
        let path = dir.join(INDEX_FILE);
        let tmp = dir.join(".fight-summaries-v1.tmp");
        let saved = serde_json::to_vec(&self.fights)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                fs::write(&tmp, bytes)
                    .and_then(|_| fs::rename(&tmp, &path))
                    .map_err(|e| e.to_string())
            });
        match saved {
            Ok(()) => self.dirty = false,
            Err(e) => warn!("Could not save fight summaries: {e}"),
        }
    }
}

/// A saved fight's summary: the library's (`history::summary`, copied: bests/summary.rs), which tells you in it (your name,
/// class, server, damage: the one name kept unmasked, or the actor it recorded as you) and the
/// fight's outcome; the personal bests are made of those.
fn summarize(record: &FightRecord) -> FightSummary {
    crate::bests::summary::of(record)
}

/// The fights kept: the dungeon bosses' and your training dummy runs. Not the world's (field and
/// Abyss bosses: no dungeon), nor a dummy others hit while you did nothing (your damage 0): those
/// are never saved, and the ones saved before are deleted as the history is read.
fn kept(f: &FightSummary) -> bool {
    if f.is_train { f.my_damage > 0 } else { f.dungeon_id != 0 }
}

/// A personal best just beaten (a kill): which boss, whose, the damage per second now and before.
#[derive(Clone, Debug)]
pub struct NewBest {
    pub boss_name: String,
    pub character: String,
    pub dps: i64,
    pub before: i64,
    pub fight_id: String,
}

/// Manages full fight records and a rebuildable index of their summaries.
pub struct FightHistoryManager {
    history_dir: PathBuf,
    index: OnceLock<Mutex<HistoryIndex>>,
    /// Each character's bests on each dungeon boss (the library's), kept in `personal_bests.json`
    /// apart from the fights: pruned fights don't take a best away.
    bests: Mutex<PersonalBests>,
    /// Bests beaten since the app last asked (`take_new_bests`), each fight told once.
    beaten: Mutex<Vec<NewBest>>,
    told: Mutex<std::collections::HashSet<String>>,
}

impl FightHistoryManager {
    /// Fights are kept in `history_dir`, one JSON file each.
    pub fn new(history_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&history_dir);
        let bests = Mutex::new(PersonalBests::load(&history_dir.join(BESTS_FILE)));
        Self {
            history_dir,
            index: OnceLock::new(),
            bests,
            beaten: Mutex::new(Vec::new()),
            told: Mutex::new(std::collections::HashSet::new()),
        }
    }

    /// Take the fights' kills into the bests, saved if they changed. `tell`: a kill that beats its
    /// character's best damage per second on that boss (one there already, from another fight) is
    /// noted for the app, once (not for the history read again, the fights already there).
    fn note_bests(&self, fights: &[FightSummary], tell: bool) {
        let mut bests = self.bests.lock();
        let key = |f: &FightSummary| format!("{}|{}|{}|{}", f.my_name, f.my_server, f.dungeon_id, f.mob_code);
        let before: Vec<Option<(String, i64)>> = fights.iter().map(|f| bests.encounters.get(&key(f)).and_then(|e| e.my_dps.as_ref()).map(|b| (b.fight_id.clone(), b.value))).collect();
        if !bests.update(fights) {
            return;
        }
        bests.save(&self.history_dir.join(BESTS_FILE));
        if !tell {
            return;
        }
        let mut told = self.told.lock();
        for (f, before) in fights.iter().zip(before) {
            let Some((was_fight, was)) = before else { continue };
            let Some(now) = bests.encounters.get(&key(f)).and_then(|e| e.my_dps.as_ref()) else { continue };
            if f.outcome == "kill" && now.fight_id == f.id && was_fight != f.id && told.insert(f.id.clone()) {
                info!("Personal best: {} on {}, {} dps (was {})", f.my_name, f.boss_name, now.value, was);
                self.beaten.lock().push(NewBest { boss_name: f.boss_name.clone(), character: f.my_name.clone(), dps: now.value, before: was, fight_id: f.id.clone() });
            }
        }
    }

    /// The bests beaten since the last call.
    pub fn take_new_bests(&self) -> Vec<NewBest> {
        std::mem::take(&mut *self.beaten.lock())
    }

    /// Every character's bests, each dungeon boss.
    pub fn bests(&self) -> serde_json::Value {
        serde_json::to_value(&*self.bests.lock()).unwrap_or(serde_json::Value::Null)
    }

    fn index(&self) -> MutexGuard<'_, HistoryIndex> {
        self.index
            .get_or_init(|| Mutex::new(HistoryIndex::load(&self.history_dir)))
            .lock()
    }

    pub fn save_fight(&self, record: &FightRecord) -> Result<(), String> {
        check_id(&record.id)?;
        if !kept(&summarize(record)) {
            return Ok(());
        }
        let name = format!("{}.json", record.id);
        let file_path = self.history_dir.join(&name);
        let json = serde_json::to_string_pretty(record)
            .map_err(|e| format!("Serialization error: {}", e))?;
        // Serialize the write and index update with other writes and deletes.
        let mut index = self.index();
        let tmp = file_path.with_extension("tmp");
        fs::write(&tmp, json.as_bytes())
            .and_then(|_| fs::rename(&tmp, &file_path))
            .map_err(|e| format!("Write error: {}", e))?;
        match FileStamp::read(&file_path) {
            Ok(stamp) => {
                let summary = summarize(record);
                self.note_bests(std::slice::from_ref(&summary), true);
                index.fights.insert(name, IndexedFight { stamp, summary });
                index.dirty = true;
            }
            Err(_) => index.remove(&name),
        }
        info!("Fight saved: {}", record.id);
        // An upgraded installation can still have unindexed fights. Count files
        // before pruning, and leave their first full scan to History when possible.
        let over_limit = fs::read_dir(&self.history_dir).is_ok_and(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    Path::new(&entry.file_name())
                        .extension()
                        .is_some_and(|ext| ext == "json")
                })
                .nth(MAX_HISTORY_FIGHTS)
                .is_some()
        });
        if over_limit && index.refresh(&self.history_dir).is_ok() {
            self.prune(&mut index, MAX_HISTORY_FIGHTS);
        }
        index.store(&self.history_dir);
        Ok(())
    }

    /// Keep the newest fights by start time, including when a fight is auto-saved again.
    fn prune(&self, index: &mut HistoryIndex, keep: usize) {
        if index.fights.len() <= keep {
            return;
        }
        let mut fights: Vec<_> = index
            .fights
            .iter()
            .map(|(name, entry)| (entry.summary.start_time_ms, name.clone()))
            .collect();
        fights.sort_unstable();
        let doomed = fights.len() - keep;
        for (_, name) in fights.into_iter().take(doomed) {
            // Its outcome stays in its boss's totals (the bests outlive the fights).
            if let Some(entry) = index.fights.get(&name) {
                self.bests.lock().archive(&entry.summary);
            }
            let path = self.history_dir.join(&name);
            match fs::remove_file(&path) {
                Ok(()) => {
                    index.remove(&name);
                    info!("Pruned old fight {}", path.display());
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => index.remove(&name),
                Err(e) => warn!("Could not prune {}: {e}", path.display()),
            }
        }
    }

    pub fn load_fight(&self, id: &str) -> Result<FightRecord, String> {
        check_id(id)?;
        let file_path = self.history_dir.join(format!("{}.json", id));
        let json = std::fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
    }

    pub fn delete_fight(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        let name = format!("{id}.json");
        let mut index = self.index();
        fs::remove_file(self.history_dir.join(&name))
            .map_err(|e| format!("Delete error: {}", e))?;
        index.remove(&name);
        index.store(&self.history_dir);
        // Deleted by hand: not a best any more.
        let mut bests = self.bests.lock();
        if bests.forget(id) {
            bests.save(&self.history_dir.join(BESTS_FILE));
        }
        info!("Fight deleted: {}", id);
        Ok(())
    }

    pub fn list_fights(&self) -> Vec<FightSummary> {
        let mut index = self.index();
        if let Err(e) = index.refresh(&self.history_dir) {
            // When the directory is gone, a stale index cannot stand in for its fights.
            if e.kind() == std::io::ErrorKind::NotFound {
                return Vec::new();
            }
            warn!("Could not read fight history: {e}");
        } else {
            let gone: Vec<String> = index.fights.iter().filter(|(_, entry)| !kept(&entry.summary)).map(|(name, _)| name.clone()).collect();
            for name in &gone {
                if fs::remove_file(self.history_dir.join(name)).is_ok() || !self.history_dir.join(name).exists() {
                    index.remove(name);
                }
            }
            if !gone.is_empty() {
                info!("Fight history: {} not kept (world bosses, dummies you did not hit) deleted", gone.len());
            }
            index.store(&self.history_dir);
        }
        let mut summaries: Vec<_> = index
            .fights
            .values()
            .map(|entry| entry.summary.clone())
            .collect();
        summaries.sort_unstable_by(|a, b| {
            b.start_time_ms
                .cmp(&a.start_time_ms)
                .then_with(|| a.id.cmp(&b.id))
        });
        drop(index);
        // The fights from before the bests were kept count too (oldest first: the first is no beating).
        let oldest_first: Vec<FightSummary> = summaries.iter().rev().cloned().collect();
        self.note_bests(&oldest_first, false);
        summaries
    }

    pub fn export_fight_json(&self, record: &FightRecord) -> Result<String, String> {
        serde_json::to_string(record).map_err(|e| format!("Serialization error: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str, at: i64) -> FightRecord {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "bossName": "Boss",
            "targetId": 12,
            "startTimeMs": at,
            "durationMs": 150,
            "totalDamage": 200,
            "jobs": ["Cleric"],
            // A dungeon's boss: the world's are not kept.
            "dungeonId": 600022,
            "actors": [{"actorId": 1, "nickname": "Player", "job": "Cleric"}],
            "details": {
                "targetId": 12,
                "totalTargetDamage": 200,
                "battleTime": 150,
                "skills": [{
                    "actorId": 1, "code": 10, "name": "Skill", "time": 2, "dmg": 200, "crit": 0,
                    "multiHitCount": 0, "multiHitDamage": 0, "parry": 0, "back": 0, "perfect": 0,
                    "double": 0, "regen": 0, "hitTimestamps": [0, 150],
                }],
            },
        }))
        .unwrap()
    }

    #[test]
    fn summaries_follow_saved_and_external_edits_without_changing_fight_details() {
        let dir = std::env::temp_dir().join(format!("a2t-history-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let history = FightHistoryManager::new(dir.clone());
        let legacy = record("legacy", 100);
        fs::write(
            dir.join("legacy.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();

        let first = history.list_fights();
        assert_eq!(first[0].id, "legacy");
        assert_eq!(first[0].member_jobs, ["Cleric"]);
        let cache = HistoryIndex::load(&dir);
        assert_eq!(cache.fights.len(), 1);
        assert_eq!(cache.fights["legacy.json"].summary.id, "legacy");

        let mut current = record("current", 200);
        history.save_fight(&current).unwrap();
        current.total_damage = 300;
        history.save_fight(&current).unwrap();
        let restarted = FightHistoryManager::new(dir.clone());
        let list = restarted.list_fights();
        assert_eq!(
            list.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(),
            ["current", "legacy"]
        );
        assert_eq!(list[0].total_damage, 300);
        let saved = restarted.load_fight("current").unwrap();
        assert_eq!(saved.details.skills[0].hit_timestamps, [0, 150]);

        current.boss_name = "Imported boss name".to_string();
        fs::write(
            dir.join("current.json"),
            serde_json::to_vec(&current).unwrap(),
        )
        .unwrap();
        assert_eq!(restarted.list_fights()[0].boss_name, "Imported boss name");
        restarted.delete_fight("current").unwrap();
        assert_eq!(restarted.list_fights()[0].id, "legacy");
        fs::remove_file(dir.join("legacy.json")).unwrap();
        assert!(restarted.list_fights().is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn world_bosses_and_dummies_you_did_not_hit_are_not_kept() {
        let dir = std::env::temp_dir().join(format!("a2t-history-kept-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let history = FightHistoryManager::new(dir.clone());
        // A world boss (no dungeon): never written.
        let mut world = record("world", 100);
        world.dungeon_id = 0;
        history.save_fight(&world).unwrap();
        assert!(!dir.join("world.json").exists());
        // One saved before: deleted as the history is read; a dungeon's stays.
        history.save_fight(&record("dungeon", 200)).unwrap();
        fs::write(dir.join("world.json"), serde_json::to_string(&world).unwrap()).unwrap();
        let ids: Vec<String> = history.list_fights().into_iter().map(|f| f.id).collect();
        assert_eq!(ids, ["dungeon"]);
        assert!(!dir.join("world.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn pruning_uses_fight_start_time_and_a_broken_index_can_be_rebuilt() {
        let dir = std::env::temp_dir().join(format!("a2t-history-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let history = FightHistoryManager::new(dir.clone());
        let old = record("old", 100);
        history.save_fight(&old).unwrap();
        history.save_fight(&record("new", 200)).unwrap();
        history.save_fight(&old).unwrap();
        {
            let mut index = history.index();
            history.prune(&mut index, 1);
        }
        assert!(!dir.join("old.json").exists());
        assert!(dir.join("new.json").exists());
        fs::write(dir.join(INDEX_FILE), b"interrupted").unwrap();
        let reopened = FightHistoryManager::new(dir.clone());
        assert_eq!(reopened.list_fights()[0].id, "new");
        assert_eq!(HistoryIndex::load(&dir).fights.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn ids_that_leave_the_directory_are_refused() {
        for bad in ["", "..", "../settings", "a/b", "a\\b", "C:x", "auto..1"] {
            assert!(!is_plain_name(bad), "{bad:?}");
        }
        assert!(is_plain_name("auto_36734_1759578598645"));
        assert!(is_plain_name("Skill_Icon_01.png"));

        let dir = std::env::temp_dir().join(format!("a2t-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let history = FightHistoryManager::new(dir.clone());
        std::fs::write(dir.join("keep.json"), b"{}").unwrap();
        assert!(history.delete_fight("../keep").is_err());
        assert!(dir.join("keep.json").exists());
        assert!(history.load_fight("../keep").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
