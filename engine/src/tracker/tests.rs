//! The tracker's tests: messages as the game sent them, what the tracker makes of them.

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
