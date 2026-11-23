//! The parser's shared state and the DPS meter on top of it.

use std::collections::HashSet;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use a2tools_dps_meter_lib::capture::abnormal;
use a2tools_dps_meter_lib::combat::data_storage::DataStorage;
use a2tools_dps_meter_lib::combat::dps_calculator::DpsCalculator;
use a2tools_dps_meter_lib::combat::ping_tracker::PingTracker;
use a2tools_dps_meter_lib::i18n::lookup::{NpcLookup, SkillLookup};
use parking_lot::Mutex;

use crate::capture::combat_port_detector::CombatPortDetector;
use crate::capture::dispatcher::CaptureDispatcher;
use crate::history::FightHistoryManager;

// A2Tools DPS Meter's tables (src/data at the pinned rev), English only.
const NPCS: &str = include_str!("../data/npcs_en.json");
const SKILLS: &str = include_str!("../data/skills_en.json");
const DOT_SKILL_IDS: &str = include_str!("../data/dot_skill_ids.json");
const ABNORMALS: &str = include_str!("../data/abnormals.json");

/// Now, in the ms the parser stamps its records with (its deaths' times).
pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// Monsters the NPC table calls bosses that are adds, the boss mode following them off the boss:
/// in a dungeon questlog.gg lists bosses for, a monster named as none of them (2026-11-22, Fire
/// Temple: Silver Blade Rotan, spawned in Red Spark Ignus's fight, took the meter). Silver Blade
/// Rotan, Shining Mau Totem (Ferocious Horn Den), Blazing Guardian Sword (Chalice of Muspel),
/// Surveillance Device (Corroded Decontamination Facility), Mirror of Scarlet Desire's unnamed four.
const NOT_BOSSES: &[&str] = &[
    "2300310", "2310310", "2320310", "2300907", "2310907", "2320907", "2301055", "2301067", "2301085", "2301097", "2301216", "2300364", "2300365",
    "2300367", "2300368",
];

/// The NPC table with NOT_BOSSES no bosses.
fn npc_table() -> String {
    let Ok(mut table) = serde_json::from_str::<serde_json::Value>(NPCS) else { return NPCS.to_string() };
    for code in NOT_BOSSES {
        if let Some(npc) = table.get_mut(*code) {
            npc["isBoss"] = serde_json::Value::Bool(false);
        }
    }
    table.to_string()
}

/// Target modes the calculator knows, by the id the app sends.
pub const TARGET_MODES: &[&str] = &["bossTargets", "mostDamage", "mostRecent", "lastHitByMe", "allTargets", "trainTargets"];

struct TrainingSnapshot {
    generation: i64,
    player: i32,
    zone_reset: i64,
    at: Instant,
    value: serde_json::Value,
}

pub struct Meter {
    pub storage: Arc<DataStorage>,
    pub port_detector: Arc<CombatPortDetector>,
    pub calculator: Mutex<DpsCalculator>,
    skills: Arc<SkillLookup>,
    pub npcs: Arc<NpcLookup>,
    pub ping: Arc<PingTracker>,
    dot_skill_ids: HashSet<i32>,
    /// Where boss fights are saved; none in a replay.
    pub history: OnceLock<FightHistoryManager>,
    training: Mutex<Option<TrainingSnapshot>>,
}

impl Meter {
    pub fn new() -> Self {
        let skills = SkillLookup::new();
        skills.load_from_json(SKILLS);
        let npcs = NpcLookup::new();
        npcs.load_from_json(&npc_table());
        let (skills, npcs) = (Arc::new(skills), Arc::new(npcs));
        let storage = Arc::new(DataStorage::new());
        storage.set_abnormal_stack_limits(abnormal::stack_limits(ABNORMALS));
        let ping = Arc::new(PingTracker::new());
        let calculator = DpsCalculator::new(storage.clone(), skills.clone(), npcs.clone(), ping.clone());
        let dot_skill_ids = serde_json::from_str::<Vec<i32>>(DOT_SKILL_IDS).unwrap_or_default().into_iter().collect();
        Self {
            storage,
            port_detector: Arc::new(CombatPortDetector::new()),
            calculator: Mutex::new(calculator),
            skills,
            npcs,
            ping,
            dot_skill_ids,
            history: OnceLock::new(),
            training: Mutex::new(None),
        }
    }

    /// A skill id as the meter counts it: a variant (a level, a specialization) folded into its
    /// skill when the skill list names them the same. Copied from A2Tools DPS Meter
    /// (stream_processor.rs `normalize_skill_id`, GPL-3.0) for the PvP fights' own reader.
    pub fn normalize_skill(&self, raw: i32) -> i32 {
        if (30_000_000..=30_999_999).contains(&raw) {
            return raw;
        }
        let base = raw - (raw % 10000);
        let base_name = self.skills.get_skill_name(base);
        if base_name.is_empty() {
            return raw;
        }
        let raw_name = self.skills.get_skill_name(raw);
        if raw_name.is_empty() || raw_name == base_name {
            return base;
        }
        raw
    }

    /// A skill's name, as the meter's skill list has it.
    pub fn skill_name(&self, code: i32) -> String {
        self.skills.get_skill_name(code)
    }

    /// Save the boss fights (and training dummy sessions) on the meter to the
    /// history: those changed since their last save, or every one with
    /// `force` (before the combat data is cleared). How many were saved.
    pub fn save_fights(&self, force: bool) -> usize {
        let Some(history) = self.history.get() else { return 0 };
        if self.storage.damage_generation() <= 0 {
            return 0;
        }
        let mut records = {
            let mut calculator = self.calculator.lock();
            if force { calculator.snapshot_boss_fights_force() } else { calculator.snapshot_boss_fights() }
        };
        // The parser masks everyone's name but yours in a saved record ("Ch****a", made for the logs
        // it uploads). This app keeps the fights on this machine only, so they keep the names.
        let names = self.storage.get_nicknames();
        for record in &mut records {
            for actor in &mut record.actors {
                if let Some(name) = names.get(&actor.actor_id).filter(|n| !n.is_empty()) {
                    actor.nickname = name.clone();
                }
            }
        }
        records.iter().filter(|r| history.save_fight(r).map_err(|e| tracing::warn!("fight not saved: {e}")).is_ok()).count()
    }

    /// A dispatcher feeding this meter's parser.
    pub fn dispatcher(&self) -> CaptureDispatcher {
        let mut dispatcher = CaptureDispatcher::new(
            self.storage.clone(),
            self.skills.clone(),
            self.npcs.clone(),
            self.port_detector.clone(),
            self.ping.clone(),
        );
        dispatcher.set_dot_skill_ids(self.dot_skill_ids.clone());
        dispatcher
    }

    /// The meter as the app shows it, as JSON (`DpsData`, camelCase), each row
    /// with what upstream's own row leaves out: `critRate` (0..1 of its hits),
    /// `taken` (damage it took from the targets on the meter), and `party`
    /// (in your party's roster), `gearScore` (item level: the roster's, or
    /// for you your own record's; 0 when unknown), and your own `combatPower`
    /// when solo. Its `deaths` are upstream's: the player's, in the fight shown (their HP down to 0;
    /// a player's death sends no `42 36`). And `train`: your own damage on training
    /// dummies, whatever the meter follows, for timing training runs:
    /// `{"damage", "target": the dummy you hit last, "lastHit": ms}` or null.
    pub fn dps(&self) -> serde_json::Value {
        let data = self.calculator.lock().get_dps();
        let mut out = serde_json::to_value(&data).unwrap_or_default();
        let party = self.storage.get_party_members();
        let me = self.storage.local_player_id().and_then(|id| i32::try_from(id).ok());
        let profile = self.storage.local_profile();
        for (id, row) in &data.map {
            let (crits, hits) = row.analyzed_data.values().fold((0i64, 0i64), |(c, h), s| (c + i64::from(s.crit_times), h + i64::from(s.times)));
            let member = party.get(&row.nickname);
            let you = me == Some(*id);
            let entry = &mut out["map"][id.to_string()];
            if entry.is_object() {
                entry["critRate"] = serde_json::json!(if hits > 0 { crits as f64 / hits as f64 } else { 0.0 });
                entry["taken"] = serde_json::json!(row.damage_received);
                entry["party"] = serde_json::json!(member.is_some());
                let gear = member.map(|m| m.gear_score).filter(|&g| g > 0).or(if you { profile.gear_score } else { None });
                entry["gearScore"] = serde_json::json!(gear.unwrap_or(0));
                // Out of a party the roster says nothing of you: your own record does.
                if you && row.combat_power <= 0 {
                    entry["combatPower"] = serde_json::json!(profile.combat_power.unwrap_or(0));
                }
            }
        }
        out["train"] = self.train();
        out
    }

    /// Your damage (and your summons') on every training dummy fought since
    /// the combat data was last cleared, and the dummy you hit last.
    fn train(&self) -> serde_json::Value {
        let Some(me) = self.storage.local_player_id().and_then(|id| i32::try_from(id).ok()) else {
            return serde_json::Value::Null;
        };
        let generation = self.storage.damage_generation();
        let zone_reset = self.storage.last_zone_reset_ms();
        let mut cached = self.training.lock();
        // Damage invalidates immediately. Recheck quiet fights for late spawn/HP and summon information.
        if let Some(prev) = cached.as_ref()
            && prev.generation == generation && prev.player == me && prev.zone_reset == zone_reset
            && prev.at.elapsed() < Duration::from_secs(1)
        {
            return prev.value.clone();
        }
        let value = self.dummy_damage(me);
        *cached = Some(TrainingSnapshot { generation, player: me, zone_reset, at: Instant::now(), value: value.clone() });
        value
    }

    fn dummy_damage(&self, me: i32) -> serde_json::Value {
        let codes = self.storage.get_mob_data();
        let mut dummies: Vec<i32> = codes.iter().filter_map(|(&id, &code)| self.npcs.is_training_dummy(code).then_some(id)).collect();
        // A dummy first recognized by its HP reset always has a max-HP entry.
        dummies.extend(self.storage.get_mob_hp_data().keys().copied().filter(|id| !codes.contains_key(id) && self.storage.is_hp_reset_dummy(*id)));
        if dummies.is_empty() {
            return serde_json::Value::Null;
        }
        let summons = self.storage.get_summon_data();
        let mut damage = 0i64;
        let mut last: Option<(i64, i32)> = None;
        for tid in dummies {
            let Some(fight) = self.storage.get_target_snapshot_light(tid) else { continue };
            for (&actor, a) in &fight.actors {
                if a2tools_dps_meter_lib::entity::summon_resolver::resolve(actor, &summons) != me || a.total_damage <= 0 {
                    continue;
                }
                damage += a.total_damage;
                if last.is_none_or(|(at, _)| a.last_damage_time > at) {
                    last = Some((a.last_damage_time, tid));
                }
            }
        }
        match last {
            Some((at, target)) => serde_json::json!({ "damage": damage, "target": target, "lastHit": at }),
            None => serde_json::Value::Null,
        }
    }

    /// One target's breakdown by skill, for the given players (all when none),
    /// with each player's `defense` on it: damage and hits taken, and healing.
    pub fn details(&self, target: i32, actors: Option<&[i32]>, display: bool) -> serde_json::Value {
        let mut details = self.calculator.lock().get_target_details(target, actors);
        let mut openings = Vec::new();
        if display {
            for skill in &mut details.skills {
                openings.push(thin_timeline(&mut skill.hit_timestamps));
            }
            for heal in &mut details.heal_skills {
                thin_timeline(&mut heal.hit_timestamps);
            }
        }
        let mut out = serde_json::to_value(details).unwrap_or_default();
        if let Some(skills) = out["skills"].as_array_mut() {
            for (skill, opening) in skills.iter_mut().zip(openings) {
                if let Some(opening) = opening { skill["opening"] = serde_json::json!(opening); }
            }
        }
        if let Some(fight) = self.storage.get_target_snapshot_light(target) {
            let defense: serde_json::Map<String, serde_json::Value> = fight
                .actors
                .iter()
                .map(|(id, a)| (id.to_string(), serde_json::json!({ "taken": a.damage_received, "hitsTaken": a.hits_received, "heal": a.party_heal })))
                .collect();
            out["defense"] = serde_json::Value::Object(defense);
        }
        out
    }

    /// The buffs and debuffs of the live fight on `target` so far (upstream's
    /// `get_fight_buffs`), as JSON: `{"startTimeMs", "durationMs", "buffs": [BuffTrack]}`.
    pub fn fight_buffs(&self, target: i32) -> serde_json::Value {
        serde_json::to_value(self.calculator.lock().live_fight_buffs(target, &[target])).unwrap_or_default()
    }

    /// What is on your character now, one entry per buff (its stacks counted):
    /// `[{"id", "stacks", "endsAt": ms | null, "startedAt", "by", "skill", "mine", "debuff"}]`, the
    /// game's ids (`SkillAbnormal`). A debuff is one cast by someone who is not a
    /// player (a monster); players' are buffs, yours or your party's.
    pub fn my_buffs(&self) -> serde_json::Value {
        let Some(me) = self.storage.local_player_id().and_then(|id| i32::try_from(id).ok()) else {
            return serde_json::json!([]);
        };
        self.buffs_of(me, &HashSet::new())
    }

    /// The debuffs on each member of your party but you (by their entity, those with any), as
    /// `my_buffs` reads them, for the party frames: what monsters put on them, and what players of
    /// the other faction did (`enemies`: those in view, the tracker's) unless in your party (a
    /// dungeon's party can have both factions; its members' are buffs).
    pub fn party_debuffs(&self, enemies: &HashSet<u32>) -> serde_json::Value {
        let me = self.storage.local_player_id();
        let party: Vec<i32> = self.storage.get_party_members().into_keys().filter_map(|name| self.storage.find_id_by_nickname(&name)).collect();
        let hostile: HashSet<i32> = enemies.iter().filter_map(|&e| i32::try_from(e).ok()).filter(|e| !party.contains(e)).collect();
        let mut out = serde_json::Map::new();
        for id in party {
            if me == Some(i64::from(id)) {
                continue;
            }
            let list: Vec<serde_json::Value> =
                self.buffs_of(id, &hostile).as_array().into_iter().flatten().filter(|b| b["debuff"] == true).cloned().collect();
            if !list.is_empty() {
                out.insert(id.to_string(), serde_json::json!(list));
            }
        }
        serde_json::Value::Object(out)
    }

    /// What is on one entity now, as `my_buffs` says it (`mine`: cast by that entity); what the
    /// `hostile` players cast is a debuff too.
    fn buffs_of(&self, me: i32, hostile: &HashSet<i32>) -> serde_json::Value {
        let now = a2tools_dps_meter_lib::clock::now_ms();
        let players = self.storage.get_nicknames();
        let mut by_id: std::collections::BTreeMap<(u32, i32), serde_json::Value> = std::collections::BTreeMap::new();
        for i in self.storage.abnormal_instances(now, now).into_iter().filter(|i| i.entity == me && i.end_ms.is_none()) {
            // Ran out on the server's clock and nothing said so yet.
            if i.server_end_ms.is_some_and(|e| e < now - 1_000) {
                continue;
            }
            // Timed, but no record said when it ends: nothing will run it out, and the ones seen
            // so (potions) stayed listed long after they were gone. Passives have no timer at all.
            if !i.endless && i.server_end_ms.is_none() {
                continue;
            }
            let entry = by_id.entry((i.abnormal, i.caster)).or_insert_with(|| {
                serde_json::json!({
                    "id": i.abnormal, "stacks": 0, "endsAt": i.server_end_ms, "startedAt": i.start_ms,
                    "by": i.caster, "skill": i.skill, "mine": i.caster == me,
                    "debuff": i.caster != me && i.caster != 0 && (!players.contains_key(&i.caster) || hostile.contains(&i.caster)),
                    "passive": i.endless,
                })
            });
            entry["stacks"] = serde_json::json!(entry["stacks"].as_u64().unwrap_or(0) + 1);
            // The stack that runs longest says when it ends.
            if let (Some(end), Some(prev)) = (i.server_end_ms, entry["endsAt"].as_i64())
                && end > prev
            {
                entry["endsAt"] = serde_json::json!(end);
            }
        }
        serde_json::Value::Array(by_id.into_values().collect())
    }

    pub fn set_target_mode(&self, mode: &str) -> bool {
        if !TARGET_MODES.contains(&mode) {
            return false;
        }
        self.calculator.lock().set_target_selection_mode(mode);
        true
    }

    /// Start over: no target, no damage. The fights on the meter are saved first.
    pub fn reset(&self) {
        self.save_fights(true);
        self.calculator.lock().restart_target_selection(true);
        *self.training.lock() = None;
    }
}

/// Keep the opening casts and evenly spaced hit indices for the live rotation graph.
fn thin_timeline(times: &mut Vec<i64>) -> Option<Vec<i64>> {
    if times.len() <= 512 { return None; }
    times.sort_unstable();
    let mut opening = vec![times[0]];
    opening.extend(times.windows(2).filter(|pair| pair[1] - pair[0] > 300).take(23).map(|pair| pair[1]));

    let last = times.len() - 1;
    let stride = times.len().div_ceil(384);
    let mut index = 0;
    times.retain(|_| {
        let keep = index % stride == 0 || index == last;
        index += 1;
        keep
    });
    Some(opening)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_add_the_npc_table_calls_a_boss_is_none() {
        let npcs = NpcLookup::new();
        npcs.load_from_json(&npc_table());
        // Silver Blade Rotan, an add of Red Spark Ignus's fight; the Fire Temple's bosses stay.
        assert!(!npcs.is_boss(2_300_310));
        assert!(npcs.is_boss(2_300_311));
        assert!(npcs.is_boss(2_300_371));
    }

    #[test]
    fn live_graph_keeps_activity_bounds_and_exact_opening_in_dense_fights() {
        let mut hits: Vec<_> = (0..100).flat_map(|i| (0..200).map(move |j| i * 10_000 + j * 10)).collect();
        let opening = thin_timeline(&mut hits).unwrap();
        assert_eq!(opening, (0..24).map(|i| i * 10_000).collect::<Vec<_>>());
        assert!(hits.len() <= 385);
        assert_eq!((hits[0], hits.last().copied()), (0, Some(991_990)));
    }
}
