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

    /// The cubes in view, as the overlay shows them: where (the map data's x, -y), how high,
    /// and since when they exist.
    pub fn cubes(&self) -> Value {
        let mut list: Vec<&p::ObjectSpawn> = self.cubes.values().collect();
        list.sort_by_key(|c| c.id);
        Value::Array(
            list.into_iter()
                .map(|c| {
                    json!({
                        "id": c.id, "template": c.template, "position": [c.x.round() as i64, (-c.y).round() as i64],
                        "height": c.z.round() as i64, "createdAt": c.created_ms,
                    })
                })
                .collect(),
        )
    }

    fn cubes_changed(&self, ts: i64) {
        (self.emit)(json!({ "type": "cubes", "ts": ts, "cubes": self.cubes() }));
    }

    pub fn finish_writes(&mut self) {
        self.pvp_fights.finish();
    }

    fn clear_cubes(&mut self) {
        if !self.cubes.is_empty() {
            self.cubes.clear();
            (self.emit)(json!({ "type": "cubes", "cubes": [] }));
        }
    }

    /// You are at game (x, y): kept as the map data's (x, -y).
    fn move_to(&mut self, ts: i64, x: f32, y: f32, exact: bool) {
        self.position = Some((x, -y));
        self.position_ms = ts;
        self.position_exact = exact;
        self.nearby_dirty = true;
    }

    /// Game (x, y) is too far from your last place for the time since: a misread.
    fn jump(&self, ts: i64, x: f32, y: f32) -> bool {
        let dt = ts - self.position_ms;
        let Some((px, py)) = self.position else { return false };
        dt < MAX_JUMP_MS && ((px - x).hypot(py + y)) > MAX_SPEED * (dt.max(50) as f32 / 1000.0)
    }

    pub fn nearby(&mut self) -> Value {
        self.nearby_dirty = false;
        let mut counts: HashMap<u32, u32> = HashMap::new();
        for code in self.visible.values() {
            *counts.entry(*code).or_default() += 1;
        }
        let mut monsters: Vec<(u32, u32)> = counts.into_iter().collect();
        monsters.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        json!({
            "world": self.world,
            "position": self.position.map(|(x, y)| [x.round() as i64, y.round() as i64]),
            "monsters": monsters.into_iter().map(|(npc, count)| json!({ "npc": npc, "count": count })).collect::<Vec<_>>(),
        })
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
            p::OP_SELF => {
                if let Some(who) = p::character(f) {
                    self.self_entity = Some(who.entity);
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
mod tests {
    use super::*;

    fn frame(op: [u8; 2], body: &[u8]) -> Vec<u8> {
        let mut out = vec![(body.len() + 6) as u8];
        out.extend_from_slice(&op);
        out.extend_from_slice(body);
        out
    }

    fn le(parts: &[u32]) -> Vec<u8> {
        parts.iter().flat_map(|p| p.to_le_bytes()).collect()
    }

    fn soul(pets: &[(u32, u32)]) -> Vec<u8> {
        let mut body = vec![pets.len() as u8];
        for &(pet, n) in pets {
            body.extend(le(&[pet, n]));
        }
        frame(p::OP_SOUL, &body)
    }

    fn character(entity: u8, name: &str, server: u16) -> Vec<u8> {
        let mut body = vec![entity, 0, 0, 0, 0, 0, name.len() as u8];
        body.extend(name.as_bytes());
        body.extend(server.to_le_bytes());
        frame(p::OP_SELF, &body)
    }

    fn collection(pets: &[(u32, u32, u32)]) -> Vec<u8> {
        let mut body = vec![0, 0, 0, 0, pets.len() as u8];
        for &(pet, level, _) in pets {
            body.extend(le(&[pet, pet, level]));
        }
        body.push(pets.len() as u8);
        for &(pet, _, souls) in pets {
            body.extend(le(&[pet, souls]));
        }
        frame(p::OP_COLLECTION, &body)
    }

    #[test]
    fn a_field_boss_killed_in_view_is_told() {
        let (mut t, events) = tracker();
        t.mob_code.insert(77, 2_100_003);
        t.mob_code.insert(78, 2_101_120);
        t.mob_code.insert(79, 2_000_001);
        // Neikel killed; Dartan only out of range; an ordinary monster killed.
        t.frame(1000, &frame(p::OP_DEATH, &[77, 0, 3]));
        t.frame(1100, &frame(p::OP_DEATH, &[78, 0, 1]));
        t.frame(1200, &frame(p::OP_DEATH, &[79, 0, 3]));
        let kills: Vec<_> = events.lock().unwrap().iter().filter(|e| e["type"] == "bossKilled").cloned().collect();
        assert_eq!(kills, vec![json!({ "type": "bossKilled", "ts": 1000, "npc": 2_100_003 })]);
    }

    #[test]
    fn field_boss_diagnostics_only_logs_unknown_messages() {
        let unknown_op = [0x10, 0x20];
        // 101001 as a varint, followed by 101021 as a u32.
        let unknown = frame(unknown_op, &[0x89, 0x95, 0x06, 0x00, 0x9d, 0x8a, 0x01, 0x00]);
        let respawn = 1_794_010_200_000u64;
        let mut list = vec![0, 0, 20, 0, 0, 0, 1, 0, 0x9d, 0x95, 0x06];
        list.extend(respawn.to_le_bytes());
        let list = frame(p::OP_FIELD_BOSSES, &list);

        for enabled in [false, true] {
            let (mut t, events) = tracker();
            t.frame(60_000, &unknown);
            assert!(t.boss_messages.is_empty(), "scan must be off by default");
            t.set_boss_diagnostics(enabled);
            t.frame(61_000, &unknown);
            t.frame(62_000, &unknown);
            assert_eq!(t.boss_messages.get(&unknown_op).copied(), enabled.then_some(61_000));
            assert!(events.lock().unwrap().is_empty());

            t.mob_code.insert(77, 2_100_003);
            t.frame(63_000, &list);
            t.frame(64_000, &frame(p::OP_DEATH, &[77, 0, 3]));
            assert_eq!(*events.lock().unwrap(), vec![
                json!({ "type": "fieldBosses", "ts": 63_000, "world": 20,
                    "bosses": [{ "id": 101021, "up": false, "at": respawn }] }),
                json!({ "type": "bossKilled", "ts": 64_000, "npc": 2_100_003 }),
            ]);

            t.set_boss_diagnostics(false);
            t.frame(130_000, &unknown);
            assert_eq!(t.boss_messages.get(&unknown_op).copied(), enabled.then_some(61_000));
        }
    }

    fn tracker() -> (Tracker, Arc<std::sync::Mutex<Vec<Value>>>) {
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = events.clone();
        let t = Tracker::new(
            Store::default(),
            None,
            Arc::new(NpcLookup::new()),
            Arc::new(DataStorage::new()),
            Box::new(move |ev| sink.lock().unwrap().push(ev)),
        );
        (t, events)
    }

    fn pet(t: &Tracker, id: u32) -> Pet {
        t.store.pets().and_then(|p| p.get(&id)).cloned().unwrap_or_default()
    }

    /// The login's counters come before the record naming the character: they are hers. With
    /// no record after them, they are the character playing's.
    #[test]
    fn the_login_counters_go_to_the_character_logging_in() {
        let (mut t, events) = tracker();
        let counters = |energy: u8| frame(p::OP_COUNTERS, &[1, 0x0C, 0x01, 0x87, 0x93, 0x03, energy, 0x9B, 0x01]);
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(2000, &counters(60));
        assert!(!events.lock().unwrap().iter().any(|e| e["type"] == "counters"));
        t.frame(8000, &character(6, "Ksixx", 1104));
        t.frame(9000, &counters(45));
        t.frame(9000 + COUNTERS_WAIT_MS + 1, &soul(&[(1006, 1)]));
        let read: Vec<_> = events.lock().unwrap().iter().filter(|e| e["type"] == "counters").cloned().collect();
        assert_eq!(read.len(), 2);
        assert_eq!((read[0]["name"].as_str(), read[0]["values"]["60000001"].clone()), (Some("Ksixx"), json!([60, 155])));
        assert_eq!((read[1]["name"].as_str(), read[1]["values"]["60000001"].clone()), (Some("Ksixx"), json!([45, 155])));
    }

    /// The item list's Kina comes before the record naming the character: it is the one logging
    /// in's, not the one playing before. With no record after it, the character playing's.
    #[test]
    fn the_login_wallet_goes_to_the_character_logging_in() {
        let (mut t, events) = tracker();
        let wallet = |kina: u64| {
            let mut body = vec![0, 0, 1, 0x3f, 0x33, 0x70, 0x37];
            body.extend(kina.to_le_bytes());
            frame(p::OP_ITEM_LIST, &body)
        };
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(2000, &wallet(17_224_972));
        assert!(!events.lock().unwrap().iter().any(|e| e["type"] == "wallet"));
        t.frame(6000, &character(6, "Ksixx", 1104));
        t.frame(7000, &wallet(7_273_016));
        t.frame(7000 + COUNTERS_WAIT_MS + 1, &soul(&[(1006, 1)]));
        let read: Vec<_> = events.lock().unwrap().iter().filter(|e| e["type"] == "wallet").cloned().collect();
        assert_eq!(read.len(), 2);
        assert_eq!((read[0]["name"].as_str(), read[0]["kina"].as_u64()), (Some("Ksixx"), Some(17_224_972)));
        assert_eq!((read[1]["name"].as_str(), read[1]["kina"].as_u64()), (Some("Ksixx"), Some(7_273_016)));
    }

    /// A corridor given while the counters wait for the record naming you: told after them, both
    /// at the time the game sent them.
    #[test]
    fn counter_changes_follow_the_counters_they_came_after() {
        let (mut t, events) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(2000, &frame(p::OP_COUNTERS, &[1, 0x00, 0x82, 0x96, 0x98, 0x00]));
        t.frame(2500, &frame(p::OP_COUNTER, &[0, 0x01, 0x82, 0x96, 0x98, 0x00, 0xd0, 0xfb, 0x01, 0, 0, 0, 0, 0, 0x02]));
        t.frame(4000, &character(5, "Ksix", 1104));
        t.frame(6000, &frame(p::OP_COUNTER, &[0, 0x00, 0x82, 0x96, 0x98, 0x00, 0x03]));
        let got: Vec<_> = events.lock().unwrap().iter().filter(|e| e["type"] == "counters" || e["type"] == "counter").cloned().collect();
        assert_eq!(got.len(), 3);
        assert_eq!((got[0]["type"].as_str(), got[0]["ts"].as_i64(), got[0]["values"]["10000002"].clone()), (Some("counters"), Some(2000), json!([])));
        assert_eq!((got[1]["ts"].as_i64(), got[1]["id"].as_str(), got[1]["values"].clone()), (Some(2500), Some("10000002"), json!([130000])));
        assert_eq!((got[2]["ts"].as_i64(), got[2]["name"].as_str(), got[2]["values"].clone()), (Some(6000), Some("Ksix"), json!([])));
    }

    #[test]
    fn a_pickup_for_two_pets_counts_both_and_a_level_keeps_the_souls_past_its_cost() {
        let (mut t, events) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(2000, &collection(&[(1006, 0, 4), (1015, 1, 24)]));
        t.frame(2100, &character(5, "Ksix", 1104));
        // 4/5 and 24/25: one more each levels both, and 1015's second soul is kept.
        t.frame(3000, &soul(&[(1006, 1), (1015, 2)]));
        assert_eq!((pet(&t, 1006).level, pet(&t, 1006).souls), (Some(1), 0));
        assert_eq!((pet(&t, 1015).level, pet(&t, 1015).souls), (Some(2), 1));
        let souls: Vec<_> = events.lock().unwrap().iter().filter(|e| e["type"] == "soul").cloned().collect();
        assert_eq!(souls.len(), 2);
        assert!(souls.iter().all(|s| s["levelUp"] == true));
        assert_eq!(souls[1]["pet"]["session"], 2);
    }

    #[test]
    fn a_crystal_never_maxes_a_pet_the_game_says_is_below_lv3() {
        let (mut t, events) = tracker();
        let (&code, &id) = t.pets.droppers.iter().min().unwrap();
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(1100, &collection(&[(id, 2, 65)]));
        t.frame(1200, &character(5, "Ksix", 1104));
        // Its monster died just before a crystal (another pet's, maxed, whose kill was not seen).
        t.mob_code.insert(77, code);
        t.credits.push_back((2000, 77, 5));
        t.crystal(2100, &p::Crystal { genus: 9, amount: 1, raw: vec![] });
        let now = pet(&t, id);
        assert_eq!((now.level, now.souls, now.crystals), (Some(2), 65, 0));
        let ev = events.lock().unwrap().iter().rfind(|e| e["type"] == "crystal").cloned().unwrap();
        assert_eq!(ev["pet"], Value::Null);
        // Not known from the game: the crystal says it is maxed.
        let (mut t, _) = tracker();
        t.mob_code.insert(77, code);
        t.credits.push_back((2000, 77, 5));
        t.crystal(2100, &p::Crystal { genus: 9, amount: 1, raw: vec![] });
        assert_eq!((pet(&t, id).level, pet(&t, id).crystals), (Some(MAX_LEVEL), 1));
    }

    /// Three chests opened on 2026-11-05 (A2Tools Plugins' `tests/pet-souls-chests.json`):
    /// from the game's pet list before them, their records must reach the list the game
    /// sent after a reconnect. Seven new pets (`09 90`), and three at 24/25 levelled by 5
    /// souls, with 4 left.
    #[test]
    fn chests_new_pets_and_souls_past_a_levels_cost_reach_the_games_list() {
        let fixture: Value = serde_json::from_str(include_str!("testdata/pet-chests.json")).unwrap();
        let id = |k: &str| k.parse::<u32>().unwrap();
        let get = |side: &str, part: &str, pet: u32| fixture[side][part][pet.to_string()].as_u64().map(|v| v as u32);
        let (mut t, _) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        let mut pets: Vec<u32> = ["before", "after"]
            .iter()
            .flat_map(|side| ["levels", "points"].map(|part| (side, part)))
            .flat_map(|(side, part)| fixture[*side][part].as_object().unwrap().keys().map(|k| id(k)).collect::<Vec<_>>())
            .collect();
        pets.sort_unstable();
        pets.dedup();
        for &p in &pets {
            if get("before", "levels", p).is_some() || get("before", "points", p).is_some() {
                let pet = t.store.pets_mut().entry(p).or_default();
                pet.level = get("before", "levels", p);
                pet.souls = get("before", "points", p).unwrap_or(0);
            }
        }
        let mut ts = 2000;
        for event in fixture["events"].as_array().unwrap() {
            let (kind, data) = (event[0].as_str().unwrap(), &event[1]);
            let n = |k: &str| data[k].as_u64().unwrap() as u32;
            ts += 100;
            match kind {
                "decoded:pet-unlocked" => t.frame(ts, &frame(p::OP_PET_UNLOCKED, &[&[0u8, 0][..], &le(&[n("pet"), n("level")])].concat())),
                "decoded:level-up" => t.frame(ts, &frame(p::OP_LEVEL_UP, &[&[0u8, 0][..], &le(&[n("pet"), n("level")])].concat())),
                "decoded:soul-gained" => {
                    let list: Vec<(u32, u32)> = data["souls"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|s| (s["pet"].as_u64().unwrap() as u32, s["amount"].as_u64().unwrap() as u32))
                        .collect();
                    t.frame(ts, &soul(&list));
                }
                other => panic!("an event the test doesn't know: {other}"),
            }
        }
        for &p in &pets {
            let now = pet(&t, p);
            assert_eq!(now.level.unwrap_or(0), get("after", "levels", p).unwrap_or(0), "pet {p}'s level");
            assert_eq!(now.souls, get("after", "points", p).unwrap_or(0), "pet {p}'s souls");
        }
    }

    fn abyss(points: u64, limit: u64) -> Vec<u8> {
        frame(p::OP_ABYSS_POINTS, &[points.to_le_bytes(), limit.to_le_bytes()].concat())
    }

    fn abyss_events(events: &Arc<std::sync::Mutex<Vec<Value>>>) -> Vec<(Value, u64)> {
        events.lock().unwrap().iter().filter(|e| e["type"] == "abyss").map(|e| (e["name"].clone(), e["gained"].as_u64().unwrap())).collect()
    }

    #[test]
    fn abyss_points_a_login_is_a_start_and_each_rise_after_it_a_gain() {
        let (mut t, events) = tracker();
        // A login: the total just before the record naming the character.
        t.frame(1000, &abyss(132_456, 2_500_000));
        t.frame(1500, &character(5, "Ksix", 1104));
        // Gains, each told once nothing names another character for a moment.
        t.frame(10_000, &abyss(133_369, 2_500_000));
        t.frame(14_000, &soul(&[(1006, 1)]));
        t.frame(20_000, &abyss(133_500, 2_500_000));
        t.frame(21_000, &abyss(133_600, 2_500_000));
        t.frame(25_000, &soul(&[(1006, 1)]));
        // Another character logs in: its own total, not a gain (nor a loss) of Ksix's.
        t.frame(30_000, &abyss(40_000, 2_500_000));
        t.frame(30_500, &character(6, "Alt", 1104));
        // A zone move re-sends the self record: a gain just before it is still a gain.
        t.frame(40_000, &abyss(40_100, 2_500_000));
        t.frame(40_500, &character(6, "Alt", 1104));
        // Back on Ksix: from Ksix's last total.
        t.frame(50_000, &abyss(133_600, 2_500_000));
        t.frame(50_500, &character(5, "Ksix", 1104));
        // A total far past the last (earned with the app off): a new start.
        t.frame(60_000, &abyss(180_000, 2_500_000));
        t.frame(64_000, &soul(&[(1006, 1)]));
        let ksix = json!("Ksix");
        let alt = json!("Alt");
        assert_eq!(
            abyss_events(&events),
            [(ksix.clone(), 0), (ksix.clone(), 913), (ksix.clone(), 131), (ksix.clone(), 100), (alt.clone(), 0), (alt, 100), (ksix.clone(), 0), (ksix, 0)]
        );
        assert_eq!(t.store.characters["Ksix"].abyss_points, Some(180_000));
    }

    #[test]
    fn a_level_up_the_count_missed_takes_its_cost_not_every_soul() {
        let (mut t, _) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(1100, &collection(&[(1006, 1, 29)]));
        t.frame(1200, &character(5, "Ksix", 1104));
        t.frame(2000, &frame(p::OP_LEVEL_UP, &[&[0u8, 0][..], &le(&[1006, 2])].concat()));
        assert_eq!((pet(&t, 1006).level, pet(&t, 1006).souls), (Some(2), 4));
    }

    #[test]
    fn the_games_level_up_is_taken_when_the_count_missed_it() {
        let (mut t, events) = tracker();
        t.frame(1000, &soul(&[(1006, 3)]));
        assert_eq!((pet(&t, 1006).level, pet(&t, 1006).level_estimated), (Some(0), true));
        // The game says Lv2: souls were missed.
        t.frame(2000, &frame(p::OP_LEVEL_UP, &[&[0u8, 0][..], &le(&[1006, 2])].concat()));
        let now = pet(&t, 1006);
        assert_eq!((now.level, now.souls, now.level_estimated), (Some(2), 0, false));
        assert!(events.lock().unwrap().iter().any(|e| e["type"] == "pet"));
        // Already there from its souls: nothing changes.
        t.frame(3000, &soul(&[(1006, 1)]));
        t.frame(3100, &frame(p::OP_LEVEL_UP, &[&[0u8, 0][..], &le(&[1006, 2])].concat()));
        assert_eq!(pet(&t, 1006).souls, 1);
    }

    #[test]
    fn each_server_has_its_own_collection_and_the_login_sync_goes_to_the_one_entering() {
        let (mut t, events) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(1100, &collection(&[(1006, 1, 10)]));
        t.frame(1200, &character(5, "Ksix", 1104));
        // An alt on the same server: the same collection.
        t.frame(5000, &collection(&[(1006, 1, 11)]));
        t.frame(5100, &character(6, "Alt", 1104));
        assert_eq!(t.store.key(), "1104");
        assert_eq!(pet(&t, 1006).souls, 11);
        // A character on another server: its own, and the sync before its record is its.
        t.frame(9000, &collection(&[(1006, 0, 2)]));
        t.frame(9100, &character(7, "Other", 2104));
        assert_eq!(t.store.key(), "2104");
        assert_eq!(pet(&t, 1006).souls, 2);
        assert_eq!(t.store.servers["1104"].pets[&1006].souls, 11, "the first server's is untouched");
        let evs = events.lock().unwrap();
        let syncs = evs.iter().filter(|e| e["type"] == "sync").count();
        let characters: Vec<_> = evs.iter().filter(|e| e["type"] == "character").map(|e| e["name"].clone()).collect();
        assert_eq!(syncs, 3);
        assert_eq!(characters, vec![json!("Ksix"), json!("Alt"), json!("Other")]);
    }

    fn effect(target: u8, x: f32, y: f32) -> Vec<u8> {
        let mut body = vec![7, 0x11];
        body.extend(1_792_350_000_000u64.to_le_bytes());
        body.extend([target, 0x01, 0x00]);
        for v in [x, y, 15_000.0f32] {
            body.extend(v.to_le_bytes());
        }
        frame(p::OP_EFFECTS[0], &body)
    }

    #[test]
    fn effects_on_you_say_where_you_are_and_a_misread_jump_does_not() {
        let (mut t, _) = tracker();
        t.frame(1000, &character(5, "Ksix", 1104));
        // Someone else's effect: not you.
        t.frame(1100, &effect(9, 5000.0, 6000.0));
        assert_eq!(t.position, None);
        t.frame(1200, &effect(5, 5000.0, 6000.0));
        assert_eq!(t.position, Some((5000.0, -6000.0)));
        // 50,000 away 0.1 s later: no one moves that fast.
        t.frame(1300, &effect(5, 55_000.0, 6000.0));
        assert_eq!(t.position, Some((5000.0, -6000.0)));
        // 300 away a second later: walking.
        t.frame(2200, &effect(5, 5300.0, 6000.0));
        assert_eq!(t.position, Some((5300.0, -6000.0)));
        assert!(t.nearby_dirty);
    }

    #[test]
    fn a_cube_in_view_is_reported_until_it_is_opened() {
        let (mut t, events) = tracker();
        let mut cube = vec![0xe5, 0xff, 0x03, 0x04, 0x00];
        cube.extend(1_200_039u32.to_le_bytes());
        for v in [-50205.0f32, 126283.0, 15449.0, 0.0, 0.0] {
            cube.extend(v.to_le_bytes());
        }
        cube.extend([1, 1, 1]);
        cube.extend(1_792_350_000_000u64.to_le_bytes());
        t.frame(1000, &frame(p::OP_OBJECT_SPAWN, &cube));
        // Another object (a gathering spot): not a cube.
        let mut other = cube.clone();
        other[5..9].copy_from_slice(&1_500_041u32.to_le_bytes());
        other[0] = 0x10;
        t.frame(1100, &frame(p::OP_OBJECT_SPAWN, &other));
        let shown = t.cubes();
        assert_eq!(shown.as_array().unwrap().len(), 1);
        assert_eq!(shown[0]["position"], json!([-50205, -126283]));
        t.frame(2000, &frame(p::OP_OBJECT_REMOVED, &[0xe5, 0xff, 0x03, 0x04, 0x03, 0x00]));
        assert!(t.cubes().as_array().unwrap().is_empty());
        let reported = events.lock().unwrap().iter().filter(|e| e["type"] == "cubes").count();
        assert_eq!(reported, 2, "once in view, once opened");
        let opened: Vec<Value> = events.lock().unwrap().iter().filter(|e| e["type"] == "cubeOpened").cloned().collect();
        assert_eq!(opened.len(), 1);
        assert_eq!(opened[0]["position"], json!([-50205, -126283]));
    }

    #[test]
    fn a_sync_with_no_character_record_after_it_goes_to_the_one_playing() {
        let (mut t, _) = tracker();
        t.frame(1000, &collection(&[(1006, 1, 7)]));
        assert_eq!(pet(&t, 1006).souls, 0, "waiting for the character record");
        t.frame(1000 + SYNC_WAIT_MS + 1, &frame([0x99, 0x99], &[]));
        assert_eq!(pet(&t, 1006).souls, 7);
    }

    #[test]
    fn combat_power_drops_misreads_and_holds_a_jump_until_confirmed() {
        let mut c = Card::default();
        steady_cp(&mut c, 5);
        assert_eq!(c.cp, None);
        steady_cp(&mut c, 123_186);
        assert_eq!(c.cp, Some(123_186));
        // A jump: held, the shown value stays.
        steady_cp(&mut c, 390_000);
        assert_eq!(c.cp, Some(123_186));
        // Back to normal: the jump is forgotten.
        steady_cp(&mut c, 124_000);
        assert_eq!((c.cp, c.pending), (Some(124_000), None));
        // A real change, read twice: taken.
        steady_cp(&mut c, 170_000);
        steady_cp(&mut c, 171_000);
        assert_eq!(c.cp, Some(171_000));
    }

    /// `45 36` for a player of `faction` (1 Elyos, 2 Asmodian), with no server record: the faction
    /// byte after the name's u32 says it.
    fn player_frame(entity: u8, name: &str, faction: u8) -> Vec<u8> {
        let mut body = vec![entity, 0, 0, 0, 0, name.len() as u8];
        body.extend(name.as_bytes());
        body.extend([0, 0, 0, 0, faction]);
        frame(p::OP_PLAYER, &body)
    }

    fn enemy_names(events: &Arc<std::sync::Mutex<Vec<Value>>>) -> Vec<String> {
        let list = events.lock().unwrap();
        let last = list.iter().rev().find(|e| e["type"] == "enemies").cloned().unwrap_or(Value::Null);
        last["players"].as_array().map(|ps| ps.iter().filter_map(|p| p["name"].as_str().map(str::to_string)).collect()).unwrap_or_default()
    }

    #[test]
    fn an_enemy_leaves_the_list_when_out_of_view_or_in_a_new_zone() {
        let (mut t, events) = tracker();
        // You: Elyos (server 1104).
        t.frame(1000, &character(5, "Ksix", 1104));
        t.frame(1100, &player_frame(40, "Friend", 1));
        t.frame(1200, &player_frame(41, "Loperamida", 2));
        t.frame(1300, &player_frame(42, "Varkhen", 2));
        assert_eq!(enemy_names(&events), vec!["Loperamida", "Varkhen"]);
        // Out of view.
        t.frame(2000, &frame(p::OP_PLAYER_GONE, &[41, 0x02, 0x00]));
        assert_eq!(enemy_names(&events), vec!["Varkhen"]);
        // A new zone: no one.
        t.frame(3000, &frame(p::OP_MAP_LOAD, &[0u8; 28]));
        assert!(enemy_names(&events).is_empty());
    }
}
