//! PvP fights: every hit between two players in view, you or others (read by
//! `damage`, a copy of A2Tools DPS Meter's reader: its meter takes a player's
//! hit on a player for party healing and keeps none), and on a kill, a death
//! or an assist of yours, the fight around that player saved: everyone's hits
//! on them and theirs on anyone, each player's skills, the damage they did and
//! took, and when. The PvP page opens one in the Details window.

use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};

use a2tools_dps_meter_lib::entity::job_class::JobClass;
use serde::{Deserialize, Serialize};

/// A skill's class, named as the meter names them (A2Tools' `JobClass::convert_from_skill`).
pub fn skill_class(skill: i32) -> Option<&'static str> {
    Some(match JobClass::convert_from_skill(skill)? {
        JobClass::Gladiator => "Gladiator",
        JobClass::Templar => "Templar",
        JobClass::Ranger => "Ranger",
        JobClass::Assassin => "Assassin",
        JobClass::Sorcerer => "Sorcerer",
        JobClass::Cleric => "Cleric",
        JobClass::Elementalist => "Spiritmaster",
        JobClass::Chanter => "Chanter",
        JobClass::Fighter => "Brawler",
    })
}

/// The class most of these skills belong to.
pub fn class_of_skills(skills: impl IntoIterator<Item = i32>) -> Option<&'static str> {
    let mut votes: HashMap<&'static str, u32> = HashMap::new();
    for class in skills.into_iter().filter_map(skill_class) {
        *votes.entry(class).or_default() += 1;
    }
    votes.into_iter().max_by_key(|&(class, n)| (n, class)).map(|(class, _)| class)
}

/// Hits kept: the last few minutes of fighting, whatever comes of it.
const KEEP_MS: i64 = 10 * 60_000;
const MAX_HITS: usize = 20_000;
/// A pause this long between two players' hits ends one fight: the hits before it are another.
pub const GAP_MS: i64 = 30_000;
/// Fights kept on disk, newest first.
const MAX_FIGHTS: usize = 300;

/// One hit of a player on another, as the parser read it.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub ts: i64,
    pub actor: u32,
    pub target: u32,
    pub skill: i32,
    pub damage: i64,
    pub crit: bool,
    pub dot: bool,
    pub back: bool,
    pub perfect: bool,
    pub double: bool,
    pub parry: bool,
    pub multi: u32,
}

#[derive(Default)]
pub struct Hits {
    list: VecDeque<Hit>,
}

impl Hits {
    pub fn push(&mut self, hit: Hit) {
        let cutoff = hit.ts - KEEP_MS;
        while self.list.front().is_some_and(|h| h.ts < cutoff) || self.list.len() >= MAX_HITS {
            self.list.pop_front();
        }
        self.list.push_back(hit);
    }

    /// The hits between `a` and `b` (either way) of the fight that ended by `end`: back from the
    /// last one before it, to the first pause longer than `GAP_MS`.
    pub fn between(&self, a: u32, b: u32, end: i64) -> Vec<Hit> {
        let mut out: Vec<Hit> = Vec::new();
        for h in self.list.iter().rev() {
            if h.ts > end || !((h.actor == a && h.target == b) || (h.actor == b && h.target == a)) {
                continue;
            }
            if out.last().is_some_and(|later| later.ts - h.ts > GAP_MS) {
                break;
            }
            out.push(h.clone());
        }
        out.reverse();
        out
    }

    /// The fight around player `x` that ended by `end`: every hit they dealt or took, back from
    /// the last one before it to the first pause longer than `GAP_MS`.
    #[cfg(test)]
    pub fn around(&self, x: u32, end: i64) -> Vec<Hit> {
        self.around_any(&[x], end)
    }

    /// The same around several players at once: every hit any of them dealt or took (your death
    /// has the hits of everyone who attacked you, not only the one who landed the blow).
    pub fn around_any(&self, players: &[u32], end: i64) -> Vec<Hit> {
        let mut out: Vec<Hit> = Vec::new();
        for h in self.list.iter().rev() {
            if h.ts > end || !(players.contains(&h.actor) || players.contains(&h.target)) {
                continue;
            }
            if out.last().is_some_and(|later| later.ts - h.ts > GAP_MS) {
                break;
            }
            out.push(h.clone());
        }
        out.reverse();
        out
    }
}

/// One player's skill in a fight, in the Details window's terms (shared/meter.ts `DetailsSkill`,
/// but its name, which the sidecar adds from the skill list).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillLine {
    pub actor: u32,
    pub code: i32,
    pub damage: i64,
    pub hits: u32,
    pub crits: u32,
    pub max_hit: i64,
    pub dot: bool,
    pub back: u32,
    pub perfect: u32,
    pub double: u32,
    pub parry: u32,
    pub multi: u32,
    /// When each hit landed, ms from the fight's start.
    pub at: Vec<i64>,
}

/// The damage one player took in a fight, and in how many hits.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Taken {
    pub entity: u32,
    pub damage: i64,
    pub hits: u32,
}

/// One side of a fight.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Side {
    pub entity: u32,
    pub name: String,
    pub server: Option<u16>,
    pub class_name: Option<String>,
    pub combat_power: Option<u32>,
    pub legion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fight {
    pub id: String,
    /// When the kill came (ms since epoch).
    pub at: i64,
    /// "kill": you killed them; "death": they killed you; "assist": someone else killed the
    /// player you were fighting (`killer`).
    pub outcome: String,
    /// An assist's killer: who took the kill.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub killer: Option<String>,
    pub me: Side,
    pub opponent: Side,
    /// The other players in it: your allies who hit the opponent, theirs they hit.
    #[serde(default)]
    pub others: Vec<Side>,
    pub start_ms: i64,
    pub duration_ms: i64,
    pub skills: Vec<SkillLine>,
    /// What each player took, from whom it may be (fights saved before it: none).
    #[serde(default)]
    pub taken: Vec<Taken>,
}

/// The fight from its hits: each side's skills, most damage first.
pub fn fight(id: String, at: i64, outcome: &str, me: Side, opponent: Side, hits: &[Hit]) -> Fight {
    let start = hits.first().map_or(at, |h| h.ts);
    let end = hits.last().map_or(at, |h| h.ts);
    let mut lines: HashMap<(u32, i32), SkillLine> = HashMap::new();
    let mut taken: HashMap<u32, Taken> = HashMap::new();
    for h in hits {
        let t = taken.entry(h.target).or_insert_with(|| Taken { entity: h.target, ..Default::default() });
        t.damage += h.damage;
        t.hits += 1;
        let line = lines.entry((h.actor, h.skill)).or_insert_with(|| SkillLine { actor: h.actor, code: h.skill, ..Default::default() });
        line.damage += h.damage;
        line.hits += 1;
        line.crits += u32::from(h.crit);
        line.max_hit = line.max_hit.max(h.damage);
        line.dot |= h.dot;
        line.back += u32::from(h.back);
        line.perfect += u32::from(h.perfect);
        line.double += u32::from(h.double);
        line.parry += u32::from(h.parry);
        line.multi += h.multi;
        line.at.push(h.ts - start);
    }
    let mut skills: Vec<SkillLine> = lines.into_values().collect();
    skills.sort_by(|a, b| b.damage.cmp(&a.damage));
    let mut taken: Vec<Taken> = taken.into_values().collect();
    taken.sort_by_key(|t| t.entity);
    Fight { id, at, outcome: outcome.to_string(), killer: None, me, opponent, others: Vec::new(), start_ms: start, duration_ms: (end - start).max(1000), skills, taken }
}

/// The fights saved, newest first.
pub struct Fights {
    list: Vec<Arc<Fight>>,
    writer: Option<mpsc::SyncSender<SaveFight>>,
    thread: Option<JoinHandle<()>>,
}

struct SaveFight {
    fight: Arc<Fight>,
    expired: Option<String>,
}

impl SaveFight {
    fn write(self, dir: &std::path::Path) -> std::io::Result<()> {
        fs::create_dir_all(dir)?;
        let file = dir.join(format!("{}.json", self.fight.id));
        let tmp = file.with_extension("tmp");
        fs::write(&tmp, serde_json::to_vec(self.fight.as_ref())?)?;
        fs::rename(tmp, file)?;
        if let Some(id) = self.expired.filter(|id| crate::history::is_plain_name(id)) {
            let expired = dir.join(format!("{id}.json"));
            if expired.exists() { fs::remove_file(expired)?; }
        }
        Ok(())
    }
}

impl Fights {
    pub fn load(path: Option<PathBuf>) -> Self {
        // Older versions stored one JSON array. Read it alongside the individual fight files.
        let mut list: Vec<Fight> = path.as_ref().and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let mut writer = None;
        let mut thread = None;
        if let Some(path) = path {
            let dir = path.with_extension("");
            if let Ok(files) = fs::read_dir(&dir) {
                for file in files.flatten().map(|entry| entry.path()).filter(|p| p.extension().is_some_and(|s| s == "json")) {
                    if let Some(fight) = fs::read(file).ok().and_then(|b| serde_json::from_slice(&b).ok()) {
                        list.push(fight);
                    }
                }
            }
            let (tx, rx) = mpsc::sync_channel::<SaveFight>(64);
            writer = Some(tx);
            thread = Some(thread::spawn(move || {
                for job in rx {
                    if let Err(e) = job.write(&dir) {
                        tracing::warn!("could not save PvP fight: {e}");
                    }
                }
            }));
        }
        list.sort_by(|a, b| b.at.cmp(&a.at).then_with(|| a.id.cmp(&b.id)));
        list.dedup_by(|a, b| a.id == b.id);
        list.truncate(MAX_FIGHTS);
        Self { list: list.into_iter().map(Arc::new).collect(), writer, thread }
    }

    pub fn add(&mut self, fight: Fight) {
        let fight = Arc::new(fight);
        self.list.retain(|old| old.id != fight.id);
        self.list.insert(0, fight.clone());
        let expired = if self.list.len() > MAX_FIGHTS { self.list.pop().map(|old| old.id.clone()) } else { None };
        if let Some(writer) = &self.writer {
            let _ = writer.send(SaveFight { fight, expired });
        }
    }

    pub fn finish(&mut self) {
        self.writer.take();
        if let Some(thread) = self.thread.take() { let _ = thread.join(); }
    }

    pub fn get(&self, id: &str) -> Option<&Fight> {
        self.list.iter().find(|f| f.id == id).map(|f| f.as_ref())
    }
}

impl Drop for Fights {
    fn drop(&mut self) { self.finish(); }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(ts: i64, actor: u32, target: u32, skill: i32, damage: i64) -> Hit {
        Hit { ts, actor, target, skill, damage, crit: damage > 1000, dot: false, back: false, perfect: false, double: false, parry: false, multi: 0 }
    }

    #[test]
    fn history_reads_legacy_and_drains_individual_writes_on_shutdown() {
        let dir = std::env::temp_dir().join(format!("lokthar-pvp-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("pvp-fights.json");
        let make = |at| fight(format!("pvp-{at}-2"), at, "kill", Side::default(), Side::default(), &[]);
        fs::write(&file, serde_json::to_vec(&vec![make(0)]).unwrap()).unwrap();
        {
            let mut history = Fights::load(Some(file.clone()));
            assert!(history.get("pvp-0-2").is_some());
            for at in 1..=301 { history.add(make(at)); }
        }
        let history = Fights::load(Some(file));
        assert_eq!(history.list.len(), MAX_FIGHTS);
        assert!(history.get("pvp-0-2").is_none());
        assert!(history.get("pvp-301-2").is_some());
        assert_eq!(fs::read_dir(dir.join("pvp-fights")).unwrap().count(), MAX_FIGHTS);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_fight_is_the_hits_between_two_players_back_to_the_last_pause() {
        let mut hits = Hits::default();
        // An earlier fight with the same player, a minute before: not this one.
        hits.push(hit(0, 1, 2, 10, 500));
        hits.push(hit(60_000, 1, 2, 10, 800));
        hits.push(hit(61_000, 2, 1, 20, 1200));
        // Someone else's hit on you: not this fight's.
        hits.push(hit(61_500, 3, 1, 30, 999));
        hits.push(hit(62_000, 1, 2, 10, 900));
        let between = hits.between(1, 2, 63_000);
        assert_eq!(between.iter().map(|h| h.ts).collect::<Vec<_>>(), vec![60_000, 61_000, 62_000]);

        let f = fight("a".into(), 63_000, "kill", Side { entity: 1, ..Default::default() }, Side { entity: 2, ..Default::default() }, &between);
        assert_eq!((f.start_ms, f.duration_ms), (60_000, 2000));
        let mine = f.skills.iter().find(|s| s.actor == 1).unwrap();
        assert_eq!((mine.code, mine.damage, mine.hits, mine.max_hit, mine.at.clone()), (10, 1700, 2, 900, vec![0, 2000]));
        let theirs = f.skills.iter().find(|s| s.actor == 2).unwrap();
        assert_eq!((theirs.damage, theirs.crits), (1200, 1));
        assert_eq!(f.taken, vec![Taken { entity: 1, damage: 1200, hits: 1 }, Taken { entity: 2, damage: 1700, hits: 2 }]);
    }

    #[test]
    fn the_fight_around_a_player_has_everyones_hits_on_them_and_theirs() {
        let mut hits = Hits::default();
        hits.push(hit(0, 1, 2, 10, 500)); // you on them
        hits.push(hit(1_000, 3, 2, 30, 700)); // an ally on them
        hits.push(hit(1_500, 2, 3, 20, 400)); // them on the ally
        hits.push(hit(2_000, 3, 4, 30, 999)); // the ally on someone else: another fight
        let around = hits.around(2, 3_000);
        assert_eq!(around.iter().map(|h| h.ts).collect::<Vec<_>>(), vec![0, 1_000, 1_500]);
    }

    #[test]
    fn a_death_has_the_hits_of_everyone_who_attacked_you() {
        let mut hits = Hits::default();
        hits.push(hit(0, 2, 1, 10, 500)); // the one who killed you, on you
        hits.push(hit(1_000, 3, 1, 30, 700)); // another enemy, on you
        hits.push(hit(1_500, 1, 3, 20, 400)); // you on that other enemy
        hits.push(hit(2_000, 4, 5, 40, 999)); // two strangers: not this fight
        let around = hits.around_any(&[1, 2], 3_000);
        assert_eq!(around.iter().map(|h| h.ts).collect::<Vec<_>>(), vec![0, 1_000, 1_500]);
        // Around the killer alone, the other enemy's hits on you are missing.
        assert_eq!(hits.around(2, 3_000).iter().map(|h| h.ts).collect::<Vec<_>>(), vec![0]);
    }
}
