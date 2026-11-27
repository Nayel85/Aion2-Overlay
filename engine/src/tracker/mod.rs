//! The overlay's own tracking, on the frames the parser reads (its frame tap):
//! the pet collection and its souls, crystals, Kina, the Black Cloud Merchant,
//! field bosses, what is around you, and player kills. Ported from the Python
//! tracker (`track.py`, from Nyerk), with the pet rules of A2Tools' pet-souls
//! plugin and one collection per game server.
//!
//! Events go out as JSON (the sidecar prints them); the shapes are the Python
//! tracker's, documented in main.rs.

pub mod damage;
pub mod data;
mod around;
mod gathering;
mod login;
mod monsters;
mod party;
mod pets;
mod players;
mod rewards;
pub mod protocol;
pub mod pvp;
pub mod store;

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;

use a2tools_dps_meter_lib::combat::data_storage::DataStorage;
use a2tools_dps_meter_lib::entity::special_damage::SpecialDamage;
use a2tools_dps_meter_lib::i18n::lookup::NpcLookup;
use serde_json::{Value, json};

use data::PetData;
use protocol as p;
use store::{LEVEL_NEED, MAX_LEVEL, Pet, Store};

/// How long before a soul or crystal its kill can be (the credit comes ~0.3 s before).
const NAME_WINDOW_MS: i64 = 1500;
/// A "combat" event at most this often: the overlay only needs to know fighting is going on.
const COMBAT_EVERY_MS: i64 = 5000;
/// The collection comes just before the record naming the character, in the
/// same bundle: it waits this long for it, then goes to the one playing.
const SYNC_WAIT_MS: i64 = 5000;
/// How long the login's counters wait for the record naming the character (6 s in the owner's logs).
const COUNTERS_WAIT_MS: i64 = 30_000;
/// The Abyss Points a login sends come just before the record naming the character: a total waits
/// this long for one (A2Tools DPS Meter's hold), else it is the character playing's.
const ABYSS_WAIT_MS: i64 = 3000;
/// The most one Abyss Points update can be a gain of (A2Tools DPS Meter's KDA): a bigger jump is a
/// total last seen long ago (points earned while the app was off), taken as the new start.
const ABYSS_MAX_GAIN: u64 = 20_000;
/// A player kill is passed on once per killer and victim in this long.
const PVP_REPEAT_MS: i64 = 30_000;
/// A cast's target this close to where you are is no news of where you are.
const CAST_RANGE: f32 = 2500.0;
/// Faster than this between two places under MAX_JUMP_MS apart is a misread,
/// not you (5,400/s mounted or dashing, in Nyerk's captures).
const MAX_SPEED: f32 = 10_000.0;
const MAX_JUMP_MS: i64 = 2000;
/// The object templates that are Hidden Cubes, with the game's asset name of
/// each, from benhighlanderr/Aion2-Hidden-Cube-Radar (`HIDDEN_CUBE_IDS` in
/// aion2_radar.py). 1200039 and 1200041 (Verteron) were also seen opened in
/// dr89mh/aion2-cube-radar's captures (FINDINGS B5, B9); the rest are that
/// list's alone. Each zone and version of a cube has its own.
const CUBE_TEMPLATES: [u32; 26] = [
    1_000_295, // Basic_HiddenCube_01
    1_000_548, // Basic_HiddenCube_01_V01
    1_000_556, // Basic_HiddenCube_01_V02
    1_000_568, // Basic_HiddenCube_01_V03
    1_000_566, // Basic_HiddenCube_01_V04
    1_000_567, // Basic_HiddenCube_01_V05
    1_100_056, // E_FE_TB_HiddenCube_01
    1_100_094, // E_FE_SpecterEvasion_HiddenCube_01
    1_200_018, // E_HiddenCube_01_001
    1_200_036, // E_HiddenCube_01_001
    1_200_037, // E_HiddenCube_01_002
    1_200_039, // E_HiddenCube_01_V04_001 (Verteron)
    1_200_040, // E_HiddenCube_01_V04_002
    1_200_041, // E_HiddenCube_01_V04_003 (Verteron)
    1_200_667, // E_HiddenCube_01_003
    1_200_707, // E_L1_FE_SpecterEvasion_HiddenCube_01
    1_201_054, // E_HiddenCube_01_004
    1_201_055, // E_HiddenCube_01_005
    1_300_081, // E_D1_TreasureBoxRare_001 (Asmodian)
    1_300_082, // E_D1_TreasureBoxLegend_001 (Asmodian)
    1_300_754, // E_D1_HiddenCube_01 (Asmodian)
    1_301_199, // E_D1_TreasureBoxRare_002 (Asmodian, V04)
    1_301_200, // E_D1_HiddenCube_02 (Asmodian, V04)
    1_401_335, // E_HiddenCube_01_006
    1_401_336, // E_HiddenCube_01_007
    3_682_560, // Special_HiddenCube
];

pub type Emit = Box<dyn Fn(Value) + Send + Sync>;

pub struct Tracker {
    store: Store,
    /// Where the collection is saved; None: never (a replay).
    path: Option<PathBuf>,
    pets: &'static PetData,
    npcs: Arc<NpcLookup>,
    storage: Arc<DataStorage>,
    emit: Emit,

    /// Each character's souls this session, by pet.
    sessions: HashMap<String, HashMap<u32, u32>>,
    /// entity -> monster code, for every spawn seen
    mob_code: HashMap<u32, u32>,
    /// Kills: (ms, monster entity)
    recent: VecDeque<(i64, u32)>,
    /// Kill credits: (ms, monster entity, player credited)
    credits: VecDeque<(i64, u32, u32)>,
    /// Which player is you, by the credits just before your souls: for when
    /// the parser has not learnt it from the game's own records.
    self_votes: HashMap<u32, u32>,
    last_combat: i64,
    /// The collection waiting for the record that names the character.
    pending_sync: Option<(i64, p::Collection)>,
    /// The login's counters (`0B 61`), waiting for the record that names the character: they come
    /// a few seconds before it.
    pending_counters: Option<(i64, Vec<(u32, Vec<u64>)>)>,
    /// Counters changed (`0C 61`) while those wait: theirs too, told after them.
    pending_counter: Vec<(i64, u32, Vec<u64>)>,
    /// The login's subscriptions (`3B E3`), waiting for the record that names the character.
    pending_subscriptions: Option<(i64, Vec<(u32, u64)>)>,
    /// The login's Kina and bound Kina (`11 56`), the same way.
    pending_wallet: Option<(i64, Option<u64>, Option<u64>)>,
    /// The balances (Oath Coins, Abyss Points) and the season's weekly progress a login said, told with the wallet.
    pending_balances: Vec<(u32, u64)>,
    pending_week: Option<u32>,
    /// The login's whole item list, waiting with the wallet for the record naming its character.
    pending_depot: Vec<p::DepotItem>,
    /// The Abyss Points total the game just sent (when, points, limit), waiting to know whose.
    pending_abyss: Option<(i64, u64, u64)>,
    /// Each character's Abyss Points balance as last seen (`1b 56`, item byte 0x23).
    abyss_balance: HashMap<String, u64>,
    /// Your class, level and gear score as last told to the app.
    me_stats: Option<(String, u32, u32, u32)>,
    field_bosses: Option<(u32, Vec<p::FieldBoss>)>,
    /// When a field boss list last could not be read (logged at most once a minute).
    field_bosses_unread: i64,
    /// Scan unknown messages for possible field-boss records while debugging.
    boss_diagnostics: bool,
    /// Other messages naming field bosses, by opcode: when each was last logged.
    boss_messages: HashMap<[u8; 2], i64>,

    /// Around you: monsters loaded (entity -> code), your zone and position (x, -y).
    visible: HashMap<u32, u32>,
    world: Option<u32>,
    position: Option<(f32, f32)>,
    /// When the position was last set, and whether from where you stand (a
    /// zone load, a teleport, an effect on you) rather than a cast's target.
    position_ms: i64,
    position_exact: bool,
    pub nearby_dirty: bool,

    /// The Hidden Cubes in view (sent once you are within about 100 m): object id -> cube.
    cubes: HashMap<u32, p::ObjectSpawn>,
    /// Players in view and their legions, for the kill feed; cleared on each zone load.
    players: HashMap<u32, p::Player>,
    /// Names of players known only from a kill credit (name, server, legion), by entity: who a
    /// selection means when their spawn was not seen. Cleared with the players.
    named: HashMap<u32, (String, u16, Option<String>)>,
    /// Players of the other faction in view: in on `45 36`, out on `42 36` or a new zone.
    enemies: HashMap<u32, p::Player>,
    /// Where each enemy in view was last seen, game (x, y): their arrival, then the effects and
    /// casts that land on them.
    enemy_places: HashMap<u32, (f32, f32)>,
    /// When the enemies' list last went out for a move (moves go out once a second at most).
    enemies_moved_ms: i64,
    /// Hits between you and other players, and the fights saved from them (`pvp`).
    pvp_hits: pvp::Hits,
    /// Players' classes, from the skills they were seen using (`pvp::skill_class`).
    classes: HashMap<u32, &'static str>,
    pvp_fights: pvp::Fights,
    /// Player cards (`30 97`, target info `50 36`) by name and server: level, gear score, combat power.
    cards: HashMap<(String, u16), Card>,
    /// Counts card updates, to tell which card is oldest (`card_mut`).
    card_tick: u64,
    /// Cards changed since they were last written, and when that was (`player-cards.json`, beside
    /// the collection): what was read of a player is kept for the next time they are met.
    cards_dirty: bool,
    /// The player entity you have selected: their sheet is sent again when a card update brings more.
    selected_entity: Option<u32>,
    cards_saved_ms: i64,
    /// When target info last had no believable combat power (logged once a minute, to fix the reader).
    target_unread: i64,
    legions: HashMap<u32, String>,
    /// Your entity in this zone (from your own record).
    self_entity: Option<u32>,
    pvp_seen: HashMap<(u32, u32), i64>,
    /// The duty board's missions by place: their quest and rewards (from the board, or taken).
    duty: HashMap<u32, (u32, Vec<p::DutyReward>)>,
    /// Missions handed in before their place was known (the board follows them): (place, indexes, when).
    duty_pending: Vec<(u32, Vec<u32>, i64)>,
    /// When you last opened the duty board, rerolled it or took or handed in a mission: the board after
    /// it is one you are looking at (not the one sent as you log in).
    duty_opened_at: i64,
    /// When you last logged in or switched character: the game sends its duty messages then too.
    logged_in_at: i64,
    /// An arena's players by id, and its last kill (its score update names who assisted).
    arena_players: std::collections::HashMap<u32, String>,
    arena_kill: Option<(i64, u32, u32)>,
    /// An arena's other team, by name: your enemies there, whatever their race or server; none out of one.
    arena_foes: std::collections::HashSet<String>,
    /// The party as last told the app (its members' names, classes and entities), and when checked.
    party_told: Value,
    party_checked: i64,
    /// Objects in view but cubes (gathering spots...), their template by id: a gathering's start
    /// names only its spot, whose template says what it gives.
    objects: HashMap<u32, u32>,
    /// The craft going on (its recipe), and once done, when: the bags' next change is its item.
    craft: Option<u32>,
    craft_done: Option<(u32, i64)>,
    /// The spot being gathered: its interaction's end (done or given up) is told.
    gathering: Option<u32>,
    /// The last player a boss hit, and when it was told: the one it is on, for the party frames.
    boss_target: Option<(u32, u32, i64)>,
    /// The monsters on you (aggro.rs), and the list last told.
    aggro: crate::aggro::Aggro,
    aggro_told: Vec<(i32, i64)>,
}

/// An item where it lies, as the app keeps it (shared/inventory.ts).
fn depot_json(i: &p::DepotItem) -> Value {
    json!({
        "uid": i.uid, "storage": i.storage, "slot": i.slot, "item": i.item, "amount": i.amount, "enchant": i.enchant, "level": i.level,
        "stones": i.stones.iter().map(|&(item, stat, rank)| json!([item, stat, rank])).collect::<Vec<_>>(),
        "soul": i.soul.iter().map(|&(stat, value)| json!([stat, value])).collect::<Vec<_>>(),
        "skills": i.skills.iter().map(|&(skill, levels)| json!([skill, levels])).collect::<Vec<_>>(),
        "stats": i.stats.iter().map(|&(stat, value)| json!([stat, value])).collect::<Vec<_>>(),
        "theostone": i.theostone,
    })
}

fn pet_view(id: u32, pet: &Pet, name: Option<&str>, session: u32) -> Value {
    json!({
        "id": id,
        "name": name,
        "souls": pet.souls,
        "level": pet.level.unwrap_or(0),
        "levelEstimated": pet.level.is_none() || pet.level_estimated,
        "crystals": pet.crystals,
        "session": session,
    })
}

impl Tracker {
    pub fn new(store: Store, path: Option<PathBuf>, npcs: Arc<NpcLookup>, storage: Arc<DataStorage>, emit: Emit) -> Self {
        let cards = load_cards(path.as_ref().map(|p| p.with_file_name(CARDS_FILE)));
        let pvp_fights = pvp::Fights::load(path.as_ref().map(|p| p.with_file_name("pvp-fights.json")));
        Self {
            store,
            path,
            pets: data::pets(),
            npcs,
            storage,
            emit,
            sessions: HashMap::new(),
            mob_code: HashMap::new(),
            recent: VecDeque::new(),
            credits: VecDeque::new(),
            self_votes: HashMap::new(),
            last_combat: i64::MIN,
            pending_sync: None,
            pending_counters: None,
            pending_counter: Vec::new(),
            pending_subscriptions: None,
            pending_wallet: None,
            pending_balances: Vec::new(),
            pending_week: None,
            pending_depot: Vec::new(),
            pending_abyss: None,
            abyss_balance: HashMap::new(),
            me_stats: None,
            field_bosses: None,
            field_bosses_unread: 0,
            boss_diagnostics: false,
            boss_messages: HashMap::new(),
            visible: HashMap::new(),
            world: None,
            position: None,
            position_ms: 0,
            position_exact: false,
            nearby_dirty: false,
            cubes: HashMap::new(),
            players: HashMap::new(),
            named: HashMap::new(),
            enemies: HashMap::new(),
            enemy_places: HashMap::new(),
            enemies_moved_ms: 0,
            cards,
            card_tick: 0,
            cards_dirty: false,
            selected_entity: None,
            cards_saved_ms: 0,
            pvp_hits: pvp::Hits::default(),
            classes: HashMap::new(),
            pvp_fights,
            target_unread: 0,
            legions: HashMap::new(),
            self_entity: None,
            pvp_seen: HashMap::new(),
            duty: HashMap::new(),
            duty_pending: Vec::new(),
            duty_opened_at: i64::MIN,
            logged_in_at: i64::MIN,
            arena_players: std::collections::HashMap::new(),
            arena_kill: None,
            arena_foes: std::collections::HashSet::new(),
            party_told: json!([]),
            party_checked: 0,
            objects: HashMap::new(),
            craft: None,
            craft_done: None,
            gathering: None,
            boss_target: None,
            aggro: crate::aggro::Aggro::default(),
            aggro_told: Vec::new(),
        }
    }

    /// The party (A2Tools' roster, `02 97`: names, classes, levels, combat power, slots), each member
    /// with their entity here when known (their vitals come by it): told the app when it changes,
    /// checked at most once a second.
    fn party_check(&mut self, ts: i64) {
        if ts - self.party_checked < 1000 {
            return;
        }
        self.party_checked = ts;
        let mut members: Vec<Value> = self
            .storage
            .get_party_members()
            .into_iter()
            .map(|(name, m)| {
                json!({
                    "name": name, "slot": m.slot, "level": m.level, "combatPower": m.combat_power, "server": m.server_id,
                    "className": m.job.map(|j| format!("{j:?}")), "entity": self.storage.find_id_by_nickname(&name),
                })
            })
            .collect();
        members.sort_by_key(|m| m["slot"].as_u64());
        let party = json!(members);
        if party != self.party_told {
            (self.emit)(json!({ "type": "party", "ts": ts, "members": party }));
            self.party_told = party;
        }
    }

    pub fn set_boss_diagnostics(&mut self, on: bool) {
        self.boss_diagnostics = on;
    }

    fn save(&self) {
        if let Some(path) = &self.path {
            if let Err(e) = self.store.save(path) {
                tracing::warn!("could not save the collection: {e}");
            }
        }
    }

    pub fn view(&self, id: u32) -> Value {
        let pet = self.store.pets().and_then(|p| p.get(&id)).cloned().unwrap_or_default();
        pet_view(id, &pet, self.store.name(id), self.session(id))
    }

    /// Every pet of the collection playing, as the overlay sees them.
    pub fn snapshot(&self) -> Value {
        Value::Array(self.store.pets().into_iter().flatten().map(|(&id, _)| self.view(id)).collect())
    }

    pub fn character(&self) -> Value {
        match &self.store.current {
            Some(name) => json!({ "name": name, "server": self.store.characters.get(name).and_then(|c| c.server) }),
            None => Value::Null,
        }
    }

    /// Which entity is you: the game's own word (the parser's), else the votes.
    fn me(&self) -> Option<u32> {
        self.storage
            .local_player_id()
            .map(|id| id as u32)
            .or(self.self_entity)
            .or_else(|| self.self_votes.iter().max_by_key(|(_, n)| **n).map(|(id, _)| *id))
    }

    fn npc_name(&self, code: u32) -> Option<String> {
        let name = self.npcs.get_npc_name(code as i32);
        (!name.is_empty() && name.parse::<i64>().is_err()).then_some(name)
    }

    /// Nothing is around you any more, and entity ids start over (the game closed).
    pub fn forget_view(&mut self) {
        self.visible.clear();
        self.mob_code.clear();
        self.credits.clear();
        self.recent.clear();
        self.self_votes.clear();
        self.players.clear();
        self.named.clear();
        self.classes.clear();
        self.legions.clear();
        self.self_entity = None;
        self.clear_cubes();
        self.world = None;
        self.position = None;
        self.position_exact = false;
        self.nearby_dirty = true;
    }

    pub fn finish_writes(&mut self) {
        self.pvp_fights.finish();
    }

    pub fn reset_session(&mut self) {
        let name = self.store.current.clone().unwrap_or_default();
        self.sessions.remove(&name);
    }

    pub fn set_souls(&mut self, id: u32, souls: u32) -> Value {
        self.store.pets_mut().entry(id).or_default().souls = souls;
        self.save();
        self.view(id)
    }

    pub fn set_name(&mut self, id: u32, name: &str) -> Value {
        // A name given by hand outvotes any learned one.
        self.store.names.insert(id, [(name.to_string(), 1_000_000)].into());
        self.save();
        self.view(id)
    }

    /// One game frame, as the parser read it; `ts` is its capture time (ms).
    pub fn frame(&mut self, ts: i64, f: &[u8]) {
        self.save_cards(ts);
        // On any frame, so leaving the party is told too (its vitals stop then).
        self.party_check(ts);
        if let Some((at, _)) = &self.pending_sync {
            if ts - at > SYNC_WAIT_MS {
                let (_, coll) = self.pending_sync.take().unwrap();
                self.sync(ts, &coll);
            }
        }
        // The wallet and subscriptions with no character record after them (mid-game): the
        // character playing's.
        if self.pending_wallet.as_ref().is_some_and(|(at, ..)| ts - at > COUNTERS_WAIT_MS) {
            match self.store.current.clone() {
                Some(name) => {
                    let server = self.store.characters.get(&name).and_then(|c| c.server);
                    self.wallet_read(&name, server);
                }
                None => {
                    self.pending_wallet = None;
                    self.pending_depot.clear();
                }
            }
        }
        if self.pending_subscriptions.as_ref().is_some_and(|(at, _)| ts - at > COUNTERS_WAIT_MS) {
            match self.store.current.clone() {
                Some(name) => {
                    let server = self.store.characters.get(&name).and_then(|c| c.server);
                    self.subscriptions_read(&name, server);
                }
                None => self.pending_subscriptions = None,
            }
        }
        // Counters with no character record after them (not a login): the character playing.
        if self.pending_counters.as_ref().is_some_and(|(at, _)| ts - at > COUNTERS_WAIT_MS) {
            if let Some(name) = self.store.current.clone() {
                let server = self.store.characters.get(&name).and_then(|c| c.server);
                self.counters_read(&name, server);
            }
            self.pending_counters = None;
            self.pending_counter.clear();
        }
        if self.pending_abyss.is_some_and(|(at, _, _)| ts - at > ABYSS_WAIT_MS) {
            let name = self.store.current.clone();
            self.abyss_read(name);
        }
        let Some(op) = p::opcode(f) else { return };
        // Looking for where else the game sends field bosses (the map's list comes at login, but
        // not always with the map open): any other message naming two of them is logged, once a
        // minute for each kind, with its bytes.
        if self.boss_diagnostics
            && op != p::OP_FIELD_BOSSES
            && f.len() <= 8192
            && self.boss_messages.get(&op).is_none_or(|&last| ts - last > 60_000)
            && p::boss_ids_in(f) >= 2
        {
            self.boss_messages.insert(op, ts);
            let hex: String = f.iter().take(600).map(|b| format!("{b:02x}")).collect();
            tracing::info!("field bosses in message {:02x} {:02x} ({} bytes): {hex}", op[0], op[1], f.len());
        }

        for credit in p::kill_credits(f) {
            self.kill_credit(ts, &credit);
        }
        match op {
            p::OP_SPAWN => {
                if let Some(s) = p::spawn(f) {
                    match s.mob_code {
                        Some(code) => {
                            self.mob_code.insert(s.entity, code);
                            self.visible.insert(s.entity, code);
                            self.nearby_dirty = true;
                        }
                        None => {
                            self.mob_code.remove(&s.entity);
                        }
                    }
                }
            }
            p::OP_OBJECT_SPAWN => {
                if let Some(o) = p::object_spawn(f) {
                    if !CUBE_TEMPLATES.contains(&o.template) {
                        // Kept while in view; a long session without removals is trimmed.
                        if self.objects.len() > 5000 {
                            self.objects.clear();
                        }
                        self.objects.insert(o.id, o.template);
                        // A gathering spot (templates 1500000 up, one per resource): where it is, for
                        // the app to tell its resource by the map's.
                        if (1_500_000..1_501_000).contains(&o.template) {
                            (self.emit)(json!({ "type": "spot", "ts": ts, "template": o.template, "world": self.world, "position": [o.x.round() as i64, (-o.y).round() as i64] }));
                        }
                    }
                    if CUBE_TEMPLATES.contains(&o.template) && self.cubes.insert(o.id, o).is_none() {
                        tracing::info!("hidden cube {} (template {}) at {:.0}, {:.0}", o.id, o.template, o.x, o.y);
                        self.cubes_changed(ts);
                    }
                }
            }
            p::OP_OBJECT_REMOVED => {
                // Opened (04) or out of range (01): either way not there for you any more.
                if let Some((id, reason)) = p::object_removed(f) {
                    self.objects.remove(&id);
                    if let Some(cube) = self.cubes.remove(&id) {
                        tracing::info!("hidden cube {id} gone (reason {reason})");
                        // Opened (by you, or someone near): where, for what comes into your bags after.
                        if reason == 4 {
                            let position = [cube.x.round() as i64, (-cube.y).round() as i64];
                            (self.emit)(json!({ "type": "cubeOpened", "ts": ts, "id": id, "template": cube.template, "position": position }));
                        }
                        self.cubes_changed(ts);
                    }
                }
            }
            p::OP_DEATH => {
                if let Some((entity, flag)) = p::death(f) {
                    // Any 42 36 takes a monster out of view: 1 out of range, 3 killed, 7 gone.
                    if self.visible.remove(&entity).is_some() {
                        self.nearby_dirty = true;
                    }
                    // A player too: an enemy gone from view (or dead) is off the list.
                    if self.enemies.remove(&entity).is_some() {
                        self.enemies_changed(ts);
                    }
                    self.aggro.died(entity as i32);
                    self.monster_off(ts, entity);
                    self.aggro_tick(ts);
                    if flag == p::DEATH_FLAG_COMBAT && self.mob_code.contains_key(&entity) {
                        self.push_recent(ts, entity);
                        let code = self.mob_code[&entity];
                        if data::field_boss_npcs().contains(&code) {
                            tracing::info!("field boss {code} killed in view");
                            (self.emit)(json!({ "type": "bossKilled", "ts": ts, "npc": code }));
                        }
                    }
                }
            }
            p::OP_MAP_LOAD => {
                if let Some((world, x, y)) = p::map_load(f) {
                    // A new zone: nothing from the last one is around you any more.
                    // Another zone: its cubes are not around you. The same zone again
                    // (a teleport inside it) keeps them; the server removes what is out of range.
                    if self.world != Some(world) {
                        self.clear_cubes();
                    }
                    self.world = Some(world);
                    self.move_to(ts, x, y, true);
                    self.visible.clear();
                    self.players.clear();
                    self.named.clear();
                    self.classes.clear();
                    self.legions.clear();
                    self.clear_enemies(ts);
                    self.arena_foes.clear();
                    self.nearby_dirty = true;
                }
            }
            p::OP_TELEPORT => {
                if let Some((x, y)) = p::self_teleport(f) {
                    self.move_to(ts, x, y, true);
                }
            }
            op if p::OP_EFFECTS.contains(&op) => {
                // Effects on you, whoever put them there: where you are, between zone loads. On an
                // enemy: where they are.
                if let Some((target, x, y)) = p::effect_position(f) {
                    self.enemy_moved(ts, target, x, y);
                    if Some(target) == self.me() && !self.jump(ts, x, y) {
                        self.move_to(ts, x, y, true);
                    }
                }
            }
            op if p::OP_CASTS.contains(&op) => {
                // A monster's cast: who it is on, before its hit lands (aggro.rs).
                if let Some((caster, target, skill)) = p::cast_on(f) {
                    if (1_000_000..=9_999_999).contains(&skill) {
                        self.monster_on(ts, caster, target);
                    }
                }
                // Your casts give where their target is: only a guess at where you
                // are, taken when nothing better is known or it is far from it.
                if let Some((actor, x, y)) = p::cast(f) {
                    // A cast's place is its target's: an enemy's, when they are the target.
                    if let Some(target) = p::cast_target(f) {
                        self.enemy_moved(ts, target, x, y);
                    }
                    let near = self.position.is_some_and(|(px, py)| (px - x).hypot(py + y) <= CAST_RANGE);
                    if Some(actor) == self.me() && !(self.position_exact && near) && !self.jump(ts, x, y) {
                        self.move_to(ts, x, y, false);
                    }
                }
            }
            // Your own resources: who you are, for the meter when it does not know yet (the app started
            // in the middle of a game: it learns it at a login or a new zone, 2026-11-27).
            p::OP_RESOURCES => {
                if self.storage.local_player_id().is_none()
                    && let Some(me) = p::resources_owner(f)
                {
                    self.storage.set_local_player_id(Some(i64::from(me)));
                    tracing::info!("meter: you are {me}, from your resources");
                }
            }
            p::OP_SELF => {
                if let Some(who) = p::character(f) {
                    self.self_entity = Some(who.entity);
                    self.logged_in_at = ts;
                    self.character_seen(ts, who);
                }
            }
            p::OP_SOUL => {
                if let Some(list) = p::souls(f) {
                    self.souls(ts, &list);
                }
            }
            p::OP_LEVEL_UP => {
                if let Some((pet, level)) = p::level_up(f) {
                    self.level_up(pet, level);
                }
            }
            p::OP_PET_UNLOCKED => {
                if let Some((pet, level)) = p::pet_unlocked(f) {
                    self.pet_unlocked(pet, level);
                }
            }
            p::OP_CRYSTAL => {
                if let Some(c) = p::crystal(f) {
                    self.crystal(ts, &c);
                }
            }
            p::OP_COLLECTION => {
                if let Some(coll) = p::collection(f) {
                    self.pending_sync = Some((ts, coll));
                }
            }
            p::OP_ITEM => {
                // The slots it says anew (a transfer, loot, a sale): the inventory as it goes.
                let slots = p::item_slots(f);
                // Right after a craft: what it made.
                if let Some((recipe, at)) = self.craft_done.take()
                    && ts - at < 2_000
                    && let Some(made) = slots.iter().find(|s| s.amount > 0)
                {
                    (self.emit)(json!({ "type": "craftResult", "ts": ts, "recipe": recipe, "item": made.item }));
                }
                if !slots.is_empty() && self.pending_wallet.is_none() {
                    if let Some(name) = self.store.current.clone() {
                        let server = self.store.characters.get(&name).and_then(|c| c.server);
                        let slots: Vec<Value> = slots.iter().map(depot_json).collect();
                        (self.emit)(json!({ "type": "inventorySlots", "ts": ts, "name": name, "server": server, "slots": slots }));
                    }
                }
                if let Some(balance) = p::abyss_balance(f) {
                    self.abyss_wallet(ts, balance);
                }
                // Whose: the character playing, but nobody's while a login's item list waits for the
                // record naming the one logging in (the one playing until then is the last one).
                let owner = if self.pending_wallet.is_some() { None } else { self.store.current.clone() };
                let server = owner.as_ref().and_then(|n| self.store.characters.get(n)).and_then(|c| c.server);
                if let Some(balance) = p::kina(f) {
                    // The balance as is: the app works out what was earned from the changes.
                    (self.emit)(json!({ "type": "kina", "ts": ts, "balance": balance, "name": owner, "server": server }));
                }
                if let Some(balance) = p::bound_kina(f) {
                    (self.emit)(json!({ "type": "boundKina", "ts": ts, "balance": balance, "name": owner, "server": server }));
                }
                for (item, balance) in p::balances(f) {
                    (self.emit)(json!({ "type": "balance", "ts": ts, "item": item, "balance": balance, "name": owner, "server": server }));
                }
                for (item, balance) in p::currencies(f) {
                    (self.emit)(json!({ "type": "currency", "ts": ts, "item": item, "balance": balance, "name": owner, "server": server }));
                }
                if let Some((item, amount)) = p::item_change(f) {
                    (self.emit)(json!({ "type": "item", "ts": ts, "item": item, "amount": amount }));
                }
            }
            p::OP_FIELD_BOSSES => match p::field_bosses(f) {
                Some(list) => {
                    if self.field_bosses.as_ref() != Some(&list) {
                        (self.emit)(json!({
                            "type": "fieldBosses", "ts": ts, "world": list.0,
                            "bosses": list.1.iter().map(|b| json!({ "id": b.id, "up": b.up, "at": b.at_ms })).collect::<Vec<_>>(),
                        }));
                        self.field_bosses = Some(list);
                    }
                }
                // The map's list, in a shape the parser does not know (a patch): its bytes, to fix it.
                None if ts - self.field_bosses_unread > 60_000 => {
                    self.field_bosses_unread = ts;
                    let hex: String = f.iter().take(600).map(|b| format!("{b:02x}")).collect();
                    tracing::warn!("field boss list not read ({} bytes): {hex}", f.len());
                }
                None => {}
            },
            p::OP_SHOP => {
                if let Some((tab, items, next)) = p::shop(f) {
                    // As the tab shows it: the app knows which items are pets worth buying.
                    (self.emit)(json!({ "type": "shop", "ts": ts, "tab": tab, "nextAt": next, "items": items }));
                }
            }
            damage::OP_DAMAGE => self.damage(ts, f),
            p::OP_CHARACTER_LIST => {
                if let Some(list) = p::character_list(f) {
                    let characters: Vec<_> = list
                        .iter()
                        .map(|c| {
                            json!({
                                // As text: NCSoft's keys are past what a JS number holds.
                                "key": c.key.to_string(), "name": c.name, "server": c.server, "classId": c.class,
                                "className": p::roster_class(c.class), "level": c.level, "gearScore": c.gear_score, "legion": c.legion,
                            })
                        })
                        .collect();
                    tracing::info!("character list: {}", list.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(", "));
                    (self.emit)(json!({ "type": "characterList", "ts": ts, "characters": characters }));
                }
            }
            p::OP_COUNTERS => {
                if let Some(list) = p::counters(f) {
                    self.pending_counters = Some((ts, list));
                }
            }
            // The season's weekly rewards' progress: at login (its list, waiting with the wallet for the
            // character's name), and as it moves (yours: the one playing).
            p::OP_PROGRESS_LIST => {
                if let Some(week) = p::progress(f, p::SEASON_WEEK) {
                    self.pending_week = Some(week);
                }
            }
            p::OP_PROGRESS => {
                if let Some(week) = p::progress(f, p::SEASON_WEEK) {
                    let owner = if self.pending_wallet.is_some() { None } else { self.store.current.clone() };
                    let server = owner.as_ref().and_then(|n| self.store.characters.get(n)).and_then(|c| c.server);
                    (self.emit)(json!({ "type": "seasonWeek", "ts": ts, "value": week, "name": owner, "server": server }));
                }
            }
            p::OP_ITEM_LIST => {
                if let Some((kina, bound)) = p::wallet(f) {
                    // Sent a few seconds before the record naming the character (a switch's new
                    // one): it waits for it, as the counters do.
                    tracing::info!("wallet: kina {kina:?}, bound {bound:?}");
                    self.pending_wallet = Some((ts, kina, bound));
                    self.pending_balances = p::balances(f);
                    self.pending_depot = p::depot(f);
                    tracing::info!("item list: {} items", self.pending_depot.len());
                }
            }
            p::OP_SUBSCRIPTIONS => {
                if let Some(list) = p::subscriptions(f) {
                    tracing::info!("subscriptions: {list:?}");
                    self.pending_subscriptions = Some((ts, list));
                }
            }
            p::OP_ABYSS_POINTS => {
                if let Some((points, limit)) = p::abyss_points(f) {
                    // One still waiting: no login followed it, it was the character playing's.
                    if self.pending_abyss.is_some() {
                        let name = self.store.current.clone();
                        self.abyss_read(name);
                    }
                    self.pending_abyss = Some((ts, points, limit));
                }
            }
            p::OP_COUNTER => {
                if let Some((id, values)) = p::counter(f) {
                    if self.pending_counters.is_some() {
                        self.pending_counter.push((ts, id, values));
                    } else if let Some(name) = self.store.current.clone() {
                        let server = self.store.characters.get(&name).and_then(|c| c.server);
                        (self.emit)(json!({ "type": "counter", "ts": ts, "name": name, "server": server, "id": id.to_string(), "values": values }));
                    }
                }
            }
            p::OP_PVP_SWITCH => {
                if let Some((entity, on)) = p::pvp_switch(f) {
                    if let Some(player) = self.players.get_mut(&entity) {
                        player.pvp = on;
                    }
                    if let Some(enemy) = self.enemies.get_mut(&entity).filter(|e| e.pvp != on) {
                        enemy.pvp = on;
                        self.enemies_changed(ts);
                    }
                }
            }
            p::OP_PLAYER_GONE => {
                // Out of view: off the enemies' list (kept among the players, for names on a late
                // kill credit; a new zone clears those).
                if let Some(entity) = p::player_gone(f) {
                    self.enemy_places.remove(&entity);
                    if self.enemies.remove(&entity).is_some() {
                        self.enemies_changed(ts);
                    }
                }
            }
            p::OP_TARGET_INFO => {
                if let Some(t) = p::target_info(f) {
                    self.target_info(ts, t, f);
                } else if ts - self.target_unread > 60_000 {
                    self.target_unread = ts;
                    let head: String = f.iter().take(64).map(|b| format!("{b:02x}")).collect();
                    tracing::warn!("target info not read ({} bytes): head {head}", f.len());
                }
            }
            p::OP_SELECTION => {
                // The target of a monster you look at: who it is on (aggro.rs).
                if let Some((entity, target)) = p::selection_target(f) {
                    // Its target none: it let go of whoever it was on.
                    if self.mob_code.contains_key(&entity) && target == 0 {
                        self.aggro.released(entity as i32);
                        self.monster_off(ts, entity);
                        self.aggro_tick(ts);
                    } else {
                        self.monster_on(ts, entity, target);
                    }
                }
                if let Some(entity) = p::selection(f) {
                    self.selected(ts, entity);
                }
            }
            p::OP_PLAYER_CARD => {
                if let Some(card) = p::player_card(f) {
                    self.player_card(ts, card);
                }
            }
            p::OP_PLAYER => {
                if let Some(player) = p::player(f) {
                    // In an arena, the other team; elsewhere, the other side.
                    let enemy = if self.arena_foes.is_empty() {
                        matches!((player.faction, self.my_faction()), (Some(theirs), Some(mine)) if theirs != mine)
                    } else {
                        self.arena_foes.contains(&player.name)
                    };
                    if let Some(class) = player.class.and_then(p::roster_class) {
                        self.classes.entry(player.entity).or_insert(class);
                    }
                    if let (true, Some(place)) = (enemy, player.place) {
                        self.enemy_places.insert(player.entity, place);
                    }
                    let cp_changed = self.spawn_combat_power(&player);
                    self.players.insert(player.entity, player.clone());
                    if cp_changed {
                        self.refresh_selected(ts);
                    }
                    if enemy {
                        match self.enemies.insert(player.entity, player.clone()) {
                            None => {
                                tracing::info!("enemy in view: {} ({:?}, {:?} combat power, pvp {})", player.name, player.server, player.combat_power, player.pvp);
                                self.enemies_changed(ts);
                            }
                            Some(before) if cp_changed || (before.pvp, before.open_pvp) != (player.pvp, player.open_pvp) => self.enemies_changed(ts),
                            Some(_) => {}
                        }
                    }
                    self.players.insert(player.entity, player);
                }
            }
            p::OP_LEGION => {
                if let Some((entity, name)) = p::legion(f) {
                    if Some(entity) == self.me() {
                        self.my_legion(&name);
                    }
                    self.legions.insert(entity, name);
                }
            }
            // The rest, by domain: gathering and crafts, dungeons and rewards, the party.
            _ => {
                let _ = self.gathering_frame(op, ts, f) || self.rewards_frame(op, ts, f) || self.party_frame(op, ts, f);
            }
        }
    }

    fn push_recent(&mut self, ts: i64, mob: u32) {
        self.recent.push_back((ts, mob));
        if self.recent.len() > 64 {
            self.recent.pop_front();
        }
    }

}

/// A player's card, as last read.
#[derive(Debug, Clone, Default)]
struct Card {
    level: u32,
    gear_score: u32,
    /// By its number in target info (`50 36`) or the card (`30 97`).
    class: Option<&'static str>,
    /// Combat power as shown: a believable value, held against odd jumps (`steady_cp`).
    cp: Option<u32>,
    /// A value far from the shown one, seen once: taken if the next read agrees.
    pending: Option<u32>,
    /// When it was last updated (`card_tick`): the oldest goes first when there are too many.
    touched: u64,
}

const CARDS_FILE: &str = "player-cards.json";
const CARDS_SAVE_EVERY_MS: i64 = 60_000;
const CLASSES: [&str; 8] = ["Gladiator", "Templar", "Ranger", "Assassin", "Spiritmaster", "Sorcerer", "Cleric", "Chanter"];

/// A card as kept on disk.
#[derive(serde::Serialize, serde::Deserialize)]
struct SavedCard {
    name: String,
    server: u16,
    level: u32,
    gear_score: u32,
    class: Option<String>,
    cp: Option<u32>,
}

/// The cards kept from earlier runs, the newest data of each player winning as it is read.
fn load_cards(path: Option<PathBuf>) -> HashMap<(String, u16), Card> {
    let list: Vec<SavedCard> = path.and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    list.into_iter()
        .take(MAX_CARDS)
        .map(|c| {
            let class = c.class.and_then(|k| CLASSES.iter().find(|&&n| n == k).copied());
            ((c.name, c.server), Card { level: c.level, gear_score: c.gear_score, class, cp: c.cp, pending: None, touched: 0 })
        })
        .collect()
}

/// An enemy's pin moves on the map this often at most (a fight sends many effects a second).
const ENEMY_MOVE_EVERY_MS: i64 = 1000;
/// Cards kept at most: past it the oldest makes room (a long session among crowds).
const MAX_CARDS: usize = 5000;
/// Combat power players have (late 2026: most 90k-175k, some past 200k); outside it, a misread.
const CP_RANGE: std::ops::RangeInclusive<u32> = 20_000..=400_000;
/// A change bigger than this share of the shown value is a jump, until a second read confirms it.
const CP_JUMP: f64 = 0.25;

/// The combat power a card shows: values out of range are dropped; one far from the last (a jump
/// another tool saw now and then) is held until a second read close to it agrees, as a real
/// change (new gear) would.
fn steady_cp(card: &mut Card, value: u32) {
    if !CP_RANGE.contains(&value) {
        return;
    }
    let near = |a: u32, b: u32| (a as f64 - b as f64).abs() <= b as f64 * CP_JUMP;
    match card.cp {
        Some(shown) if !near(value, shown) => {
            if card.pending.is_some_and(|p| near(value, p)) {
                card.cp = Some(value);
                card.pending = None;
            } else {
                card.pending = Some(value);
            }
        }
        _ => {
            card.cp = Some(value);
            card.pending = None;
        }
    }
}

#[cfg(test)]
mod tests;
