//! The records the pet tracker and the overlay need, read from one game frame
//! (`<length varint> <opcode, 2 bytes> <body>`) as the parser's frame tap hands
//! it over. Ported from the Python tracker's `protocol.py` (Lokthar / Nyerk),
//! with the pet records fixed after A2Tools' pet-souls plugin: a soul pickup
//! lists every pet it gives souls to, and `14 90` says a pet levelled.

use a2tools_dps_meter_lib::capture::stream_processor::read_varint;

mod gathering;
mod rewards;
pub use gathering::*;
pub use rewards::*;

pub const OP_SPAWN: [u8; 2] = [0x41, 0x36];
pub const OP_DEATH: [u8; 2] = [0x42, 0x36];
pub const OP_SOUL: [u8; 2] = [0x0D, 0x90];
pub const OP_LEVEL_UP: [u8; 2] = [0x14, 0x90];
pub const OP_PET_UNLOCKED: [u8; 2] = [0x09, 0x90];
pub const OP_CRYSTAL: [u8; 2] = [0x11, 0x90];
pub const OP_COLLECTION: [u8; 2] = [0x00, 0x90];
pub const OP_MAP_LOAD: [u8; 2] = [0x21, 0x36];
pub const OP_TELEPORT: [u8; 2] = [0x23, 0x36];
pub const OP_CASTS: [[u8; 2]; 2] = [[0x02, 0x38], [0x03, 0x38]];
pub const OP_EFFECTS: [[u8; 2]; 2] = [[0x2A, 0x38], [0x2B, 0x38]];
pub const OP_SELF: [u8; 2] = [0x33, 0x36];
pub const OP_ITEM: [u8; 2] = [0x1B, 0x56];
pub const OP_FIELD_BOSSES: [u8; 2] = [0x01, 0x91];
pub const OP_SHOP: [u8; 2] = [0x91, 0x56];
pub const OP_KILL: [u8; 2] = [0x04, 0x8D];
pub const OP_PLAYER: [u8; 2] = [0x45, 0x36];
pub const OP_PLAYER_GONE: [u8; 2] = [0x47, 0x36];
pub const OP_LEGION: [u8; 2] = [0x33, 0x8A];
pub const OP_OBJECT_SPAWN: [u8; 2] = [0x34, 0x36];
pub const OP_OBJECT_REMOVED: [u8; 2] = [0x35, 0x36];
/// `35 38 <entity varint> ...`: what you select (target), as the game sends it the moment you do.
pub const OP_SELECTION: [u8; 2] = [0x35, 0x38];
pub const OP_PLAYER_CARD: [u8; 2] = [0x30, 0x97];
pub const OP_APPLICANT: [u8; 2] = [0x07, 0x97];
pub const OP_APPLICANT_GONE: [u8; 2] = [0x25, 0x97];
pub const OP_MEMBER_JOINED: [u8; 2] = [0x0B, 0x97];
pub const OP_TARGET_INFO: [u8; 2] = [0x50, 0x36];
pub const OP_PVP_SWITCH: [u8; 2] = [0x54, 0x36];
pub const OP_CHARACTER_LIST: [u8; 2] = [0x15, 0x36];
pub const OP_COUNTERS: [u8; 2] = [0x0B, 0x61];
pub const OP_COUNTER: [u8; 2] = [0x0C, 0x61];
pub const OP_ABYSS_POINTS: [u8; 2] = [0xAB, 0xFF];
pub const OP_SUBSCRIPTIONS: [u8; 2] = [0x3B, 0xE3];
pub const OP_ITEM_LIST: [u8; 2] = [0x11, 0x56];
pub const OP_PROGRESS_LIST: [u8; 2] = [0x83, 0x56];
pub const OP_PROGRESS: [u8; 2] = [0x84, 0x56];
pub const OP_SUPPLY_DONE: [u8; 2] = [0x3F, 0xE2];
pub const OP_DUNGEON_START: [u8; 2] = [0x01, 0x40];
pub const OP_DUNGEON_CLEAR: [u8; 2] = [0x01, 0x61];
pub const OP_DUNGEON_STATE: [u8; 2] = [0x00, 0x61];
pub const OP_NIGHTMARE_START: [u8; 2] = [0x35, 0xE2];
pub const OP_LOOT: [u8; 2] = [0x15, 0x57];
/// Each expedition's cubes toward its guaranteed chest, as you log in (`12 57`).
pub const OP_EXPEDITIONS: [u8; 2] = [0x12, 0x57];
pub const OP_GATHER: [u8; 2] = [0x33, 0x8D];
/// A craft starting: its outcome already in it (`craft_start`); and done, its item next in the bags.
pub const OP_CRAFT_START: [u8; 2] = [0x6F, 0x8D];
pub const OP_CRAFT_DONE: [u8; 2] = [0x71, 0x8D];
/// An interaction with an object over (`3A 36 <object varint> <who varint> ...`): a gathering done or
/// given up (walked away from), 0.1 s before its result when done.
pub const OP_INTERACTION_OVER: [u8; 2] = [0x3A, 0x36];
/// A gathering starting: its outcome already in it (`gather_start`).
pub const OP_GATHER_START: [u8; 2] = [0x31, 0x8D];
pub const OP_REWARD_BOARD: [u8; 2] = [0x0A, 0x57];
/// A box opened from your bags (a field boss's loot chest...): what it took and gave.
pub const OP_BOX_OPENED: [u8; 2] = [0x47, 0x56];
/// The duty board's missions: one taken (`11 8D`), the board (`1C 8D`), one handed in (`0F 8D`).
pub const OP_DUTY_TAKEN: [u8; 2] = [0x11, 0x8D];
/// A party member's vitals, about once a second each (`1B 92`): HP, MP, flight time.
pub const OP_PARTY_VITALS: [u8; 2] = [0x1B, 0x92];
pub const OP_DUTY_BOARD: [u8; 2] = [0x1C, 0x8D];
/// The duty board opened (`1B 8D 00 00`), rerolled (`1E 8D 00 00`): its new board follows.
pub const OP_DUTY_OPEN: [u8; 2] = [0x1B, 0x8D];
pub const OP_DUTY_REROLL: [u8; 2] = [0x1E, 0x8D];
/// The duty board opened again, its board already sent (`41 8D 00 00`, no board after it: the owner's
/// 2026-11-26 log, opened three times).
pub const OP_DUTY_REOPEN: [u8; 2] = [0x41, 0x8D];
/// An arena's match (the owner's 2026-11-27 Co-op, 5v5): its players (`19 E3`: each `<id u32> 00 00
/// <server u16> <name len u8> <name>`...), each kill (`25 E3`: the killer's `<id u32> 00 00 <server
/// u16>`, the victim's), and the score of those it changed (`26 E3`: right after a kill, the killer,
/// the victim and those who assisted).
pub const OP_ARENA_PLAYERS: [u8; 2] = [0x19, 0xE3];
pub const OP_ARENA_KILL: [u8; 2] = [0x25, 0xE3];
pub const OP_ARENA_SCORE: [u8; 2] = [0x26, 0xE3];
pub const OP_DUTY_DONE: [u8; 2] = [0x0F, 0x8D];
/// A Nightmare's end (`38 E2`): its boss and stage too, but after fields of varying length (71 and
/// 68 bytes in the owner's two runs); only logged, `35 E2` says the same as you enter.
pub const OP_NIGHTMARE_END: [u8; 2] = [0x38, 0xE2];

/// `42 36`'s flag for a monster killed in combat (1: out of range, 7: gone).
pub const DEATH_FLAG_COMBAT: u32 = 3;
/// Pet ids are four digits (1001-1299 in the game's table): anything else in a
/// pet field is a misread, not a pet.
pub const PET_IDS: std::ops::RangeInclusive<u32> = 1000..=9999;
/// The most a pet's count can be (75 at Lv2): a count past it is a misread.
const MAX_SOULS: u32 = 1000;

/// `(value, bytes)`; `None` where no varint is.
fn varint(b: &[u8], at: usize) -> Option<(u32, usize)> {
    if at >= b.len() {
        return None;
    }
    let v = read_varint(b, at);
    (v.length > 0).then(|| (v.value as u32, v.length as usize))
}

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn u64_at(b: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_le_bytes(b.get(at..at + 8)?.try_into().ok()?))
}

fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

/// An arena's players: `(id, name)` each, found as `<id u32> 00 00 <server u16> <len u8> <name>` (the
/// fields between them not read).
pub fn arena_players(frame: &[u8]) -> Vec<(u32, String)> {
    let Some(b) = body(frame, OP_ARENA_PLAYERS) else { return Vec::new() };
    let mut out = Vec::new();
    let mut at = 0;
    while at + 9 < b.len() {
        let len = b[at + 8] as usize;
        let name = b.get(at + 9..at + 9 + len).filter(|_| b[at + 4] == 0 && b[at + 5] == 0 && (3..=16).contains(&len));
        match name.and_then(|n| std::str::from_utf8(n).ok()).filter(|n| n.chars().all(|c| c.is_alphanumeric())) {
            Some(name) => {
                out.push((u32_at(b, at).unwrap_or(0), name.to_string()));
                at += 9 + len;
            }
            None => at += 1,
        }
    }
    out
}

/// An arena's kill: the killer's id and the victim's.
pub fn arena_kill(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_ARENA_KILL)?;
    Some((u32_at(b, 0)?, u32_at(b, 8)?))
}

/// An arena's score update: which of `players` it names (by their ids in it).
pub fn arena_scored(frame: &[u8], players: &[u32]) -> Vec<u32> {
    let Some(b) = body(frame, OP_ARENA_SCORE) else { return Vec::new() };
    players.iter().copied().filter(|id| b.windows(6).any(|w| w[..4] == id.to_le_bytes() && w[4..] == [0, 0])).collect()
}

/// The frame's opcode.
/// Where a frame's opcode starts: after its length prefix (the packet log).
pub fn opcode_at(frame: &[u8]) -> Option<usize> {
    varint(frame, 0).map(|(_, n)| n)
}

pub fn opcode(frame: &[u8]) -> Option<[u8; 2]> {
    let (_, n) = varint(frame, 0)?;
    frame.get(n..n + 2)?.try_into().ok()
}

/// The frame's body, if its opcode is `op`.
fn body(frame: &[u8], op: [u8; 2]) -> Option<&[u8]> {
    let (_, n) = varint(frame, 0)?;
    (frame.get(n..n + 2)? == op).then(|| &frame[n + 2..])
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Spawn {
    pub entity: u32,
    pub mob_code: Option<u32>,
}

/// `41 36 <entity varint> <mask> ...`: the mob code is the u24 before an
/// `00 (00|40) 02` marker within 60 bytes.
pub fn spawn(frame: &[u8]) -> Option<Spawn> {
    let b = body(frame, OP_SPAWN)?;
    let (entity, n) = varint(b, 0)?;
    let limit = (b.len().saturating_sub(2)).min(n + 60);
    let code = (n..limit)
        .find(|&i| b[i] == 0 && matches!(b[i + 1], 0x00 | 0x40) && b[i + 2] == 0x02)
        .filter(|&i| i >= n + 3)
        .map(|i| b[i - 3] as u32 | (b[i - 2] as u32) << 8 | (b[i - 1] as u32) << 16);
    Some(Spawn { entity, mob_code: code })
}

/// `42 36 <entity varint> <varint, always 0> <flag varint>`.
pub fn death(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_DEATH)?;
    let (entity, n) = varint(b, 0)?;
    let (_, m) = varint(b, n)?;
    let (flag, _) = varint(b, n + m)?;
    Some((entity, flag))
}

/// A kill credit: `04 8D <victim varint> <u32> <killer varint> <server u16>
/// <len><name> [<len><legion>] ... <last byte>`. Who got the killing blow on a
/// monster or player around you; the last byte is 01 when the victim was a
/// player. The same opcode links summons to their owners with no name: not a
/// credit. It is found anywhere in a frame, as it also comes embedded.
#[derive(Debug, Clone, PartialEq)]
pub struct KillCredit {
    pub victim: u32,
    pub killer: u32,
    pub server: u16,
    pub name: String,
    pub legion: Option<String>,
    pub player_victim: bool,
}

/// Every kill credit in `frame` (Python's `loot_owner_records`, plus the
/// legion and the player-victim byte from Nyerk 0.2.17's `parse_kill_credit`).
pub fn kill_credits(frame: &[u8]) -> Vec<KillCredit> {
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(at) = frame[i..].windows(2).position(|w| w == OP_KILL).map(|p| p + i) {
        i = at + 2;
        let Some(credit) = kill_credit_at(frame, i) else { continue };
        out.push(credit);
    }
    out
}

fn kill_credit_at(b: &[u8], at: usize) -> Option<KillCredit> {
    let (victim, n) = varint(b, at)?;
    if !(100..=9_999_999).contains(&victim) {
        return None;
    }
    let j = at + n + 4; // a u32: a skill id for a summon, 0 otherwise
    let (killer, n2) = varint(b, j)?;
    let j = j + n2;
    let server = u16_at(b, j)?;
    let (name, end) = text(b, j + 2, 36)?;
    if !name.chars().all(|c| !c.is_control()) {
        return None;
    }
    let legion = text(b, end, 48).map(|(s, _)| s).filter(|s| !s.is_empty());
    // The last byte of the record: Nyerk reads it as the frame's last byte, as
    // a credit is a frame of its own when it is a player's death.
    let player_victim = b.last() == Some(&1) && at == varint(b, 0).map_or(0, |(_, n)| n + 2);
    Some(KillCredit { victim, killer, server, name, legion, player_victim })
}

/// A length-prefixed UTF-8 string of 1..=max bytes at `at`, and where it ends.
fn text(b: &[u8], at: usize, max: usize) -> Option<(String, usize)> {
    let n = *b.get(at)? as usize;
    if !(1..=max).contains(&n) {
        return None;
    }
    let s = std::str::from_utf8(b.get(at + 1..at + 1 + n)?).ok()?;
    Some((s.to_string(), at + 1 + n))
}

/// A character name: 1-32 bytes of UTF-8 letters and digits.
fn name_at(b: &[u8], at: usize) -> Option<String> {
    let (s, _) = text(b, at, 32)?;
    s.chars().all(char::is_alphanumeric).then_some(s)
}

/// `0D 90 <count u8> count × (<pet u32> <amount u32>)`: souls picked up, sent
/// only to you. One kill can give souls for several pets: each is listed.
pub fn souls(frame: &[u8]) -> Option<Vec<(u32, u32)>> {
    let b = body(frame, OP_SOUL)?;
    let count = *b.first()? as usize;
    if count == 0 || b.len() < 1 + count * 8 {
        return None;
    }
    let mut out = Vec::with_capacity(count);
    for k in 0..count {
        let pet = u32_at(b, 1 + k * 8)?;
        let amount = u32_at(b, 5 + k * 8)?;
        if !PET_IDS.contains(&pet) || !(1..MAX_SOULS).contains(&amount) {
            return None;
        }
        out.push((pet, amount));
    }
    Some(out)
}

/// `14 90 <2 bytes> <pet u32> <level u32>`: a pet reached a level.
pub fn level_up(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_LEVEL_UP)?;
    let pet = u32_at(b, 2)?;
    let level = u32_at(b, 6)?;
    (PET_IDS.contains(&pet) && (1..=3).contains(&level)).then_some((pet, level))
}

/// `09 90 <2 bytes> <pet u32> <level u32>`, laid out as `level_up`: a pet is
/// yours now, at that level, as a chest that gives one sends it (A2Tools
/// pet-souls 0.5.4, chests opened 2026-11-05).
pub fn pet_unlocked(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_PET_UNLOCKED)?;
    let pet = u32_at(b, 2)?;
    let level = u32_at(b, 6)?;
    (PET_IDS.contains(&pet) && level <= 3).then_some((pet, level))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Crystal {
    pub genus: u8,
    pub amount: u32,
    pub raw: Vec<u8>,
}

/// `11 90 01 <genus u8> <amount u32> 02`: genus crystals from a monster whose
/// pet is maxed. It names no pet: the kill just before it does.
pub fn crystal(frame: &[u8]) -> Option<Crystal> {
    let b = body(frame, OP_CRYSTAL)?;
    if b.len() < 6 || b[0] != 0x01 {
        return None;
    }
    let amount = u32_at(b, 2)?;
    (1..MAX_SOULS).contains(&amount).then(|| Crystal { genus: b[1], amount, raw: b.to_vec() })
}

/// The genus byte of `11 90`, as seen. Natura and Varian not captured yet.
pub fn crystal_genus(byte: u8) -> Option<&'static str> {
    match byte {
        1 => Some("fera"),
        2 => Some("cogni"),
        _ => None,
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Collection {
    /// pet -> level
    pub levels: Vec<(u32, u32)>,
    /// pet -> souls, as the Pets menu shows them
    pub souls: Vec<(u32, u32)>,
}

/// `00 90 <u32> <varint n> n × (<pet u32> <pet u32> <level u32>) <varint m>
/// m × (<pet u32> <souls u32>) ...`: your whole collection, sent once as you
/// enter the world. Anything that doesn't read as pets (a pet id out of
/// range, a level past 3, a count past 1000) gives no sync at all: better no
/// sync than a wrong one.
pub fn collection(frame: &[u8]) -> Option<Collection> {
    let b = body(frame, OP_COLLECTION)?;
    let mut pos = 4;
    let (n, ln) = varint(b, pos)?;
    pos += ln;
    let mut out = Collection::default();
    for _ in 0..n {
        let (pet, pet2, level) = (u32_at(b, pos)?, u32_at(b, pos + 4)?, u32_at(b, pos + 8)?);
        if pet != pet2 || !PET_IDS.contains(&pet) || level > 3 {
            return None;
        }
        out.levels.push((pet, level));
        pos += 12;
    }
    let (m, ln) = varint(b, pos)?;
    pos += ln;
    for _ in 0..m {
        let (pet, souls) = (u32_at(b, pos)?, u32_at(b, pos + 4)?);
        if !PET_IDS.contains(&pet) || souls >= MAX_SOULS {
            return None;
        }
        out.souls.push((pet, souls));
        pos += 8;
    }
    Some(out)
}

/// `21 36 <u32> <u32 map id> <8 bytes> <f32 x> <f32 y> <f32 z> ...`: every zone load.
pub fn map_load(frame: &[u8]) -> Option<(u32, f32, f32)> {
    let b = body(frame, OP_MAP_LOAD)?;
    if b.len() < 28 {
        return None;
    }
    Some((u32_at(b, 4)?, f32_at(b, 16)?, f32_at(b, 20)?))
}

/// `23 36 00 <5 bytes> <f32 x> <f32 y> <f32 z>`: entity 0, you, placed somewhere.
pub fn self_teleport(frame: &[u8]) -> Option<(f32, f32)> {
    let b = body(frame, OP_TELEPORT)?;
    if b.len() < 18 || b[0] != 0 {
        return None;
    }
    Some((f32_at(b, 6)?, f32_at(b, 10)?))
}

/// Heights seen run 11,000 to 30,000; a coordinate read as a height is far above this.
const MAX_HEIGHT: f32 = 100_000.0;

/// An x, y, z at `off` that reads as a place: x and y within ±500,000 and past
/// ±1,000 (smaller values are other fields read as floats), z under MAX_HEIGHT.
fn place_at(b: &[u8], off: usize) -> Option<(f32, f32)> {
    let (x, y, z) = (f32_at(b, off)?, f32_at(b, off + 4)?, f32_at(b, off + 8)?);
    let coord = |v: f32| (1000.0..500_000.0).contains(&v.abs());
    (coord(x) && coord(y) && z.abs() < MAX_HEIGHT).then_some((x, y))
}

/// `02 38` / `03 38 <caster varint> 00 <target varint> <skill u32> ... <x y z f32>`:
/// the caster, and where its **target** stands, not the caster (Nyerk
/// 2026-10-17: 938 of 986 casts matched the target's movement); close to the
/// caster only for melee and gathering. The first plausible place after the
/// skill: the height check keeps a field reading 1,413.8 from passing as an x
/// (1 cast in 11 was misread that way).
pub fn cast(frame: &[u8]) -> Option<(u32, f32, f32)> {
    let b = OP_CASTS.iter().find_map(|&op| body(frame, op))?;
    let (actor, n) = varint(b, 0)?;
    (n + 6..(b.len().saturating_sub(12)).min(n + 24)).find_map(|off| place_at(b, off).map(|(x, y)| (actor, x, y)))
}

/// The target of a `02 38` / `03 38` cast: `<caster varint> 00 <target varint>`. The place
/// `cast` reads is this target's.
pub fn cast_target(frame: &[u8]) -> Option<u32> {
    let b = OP_CASTS.iter().find_map(|&op| body(frame, op))?;
    let (_, n) = varint(b, 0)?;
    if *b.get(n)? != 0 {
        return None;
    }
    varint(b, n + 1).map(|(target, _)| target).filter(|&t| t != 0)
}

/// A cast's caster, target and skill, as it starts (`02 38 <caster> 00 <skill u32> <n> <kind> <target>`)
/// or lands (`03 38 <caster> 00 <target> <skill u32>`): a monster's (a 7-digit skill) tells who it is on
/// before its hit does (the owner's 2026-11-25 23:32 log: a monster's cast on you 0.8 s before its hit).
pub fn cast_on(frame: &[u8]) -> Option<(u32, u32, u32)> {
    let (op, b) = OP_CASTS.iter().find_map(|&op| body(frame, op).map(|b| (op, b)))?;
    let (caster, n) = varint(b, 0)?;
    if *b.get(n)? != 0 {
        return None;
    }
    let (target, skill) = if op == OP_CASTS[0] {
        (varint(b, n + 7)?.0, u32_at(b, n + 1)?)
    } else {
        let (target, m) = varint(b, n + 1)?;
        (target, u32_at(b, n + 1 + m)?)
    };
    (target != 0).then_some((caster, target, skill))
}

/// `35 38 <entity> 00 <its target | 00>`: the target of an entity you look at (your target's target,
/// sent as it changes): a monster's is who it is on; 0, no one (it let go).
pub fn selection_target(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_SELECTION)?;
    let (entity, n) = varint(b, 0)?;
    if *b.get(n)? != 0 {
        return None;
    }
    let (target, _) = varint(b, n + 1)?;
    (entity > 0).then_some((entity, target))
}

/// Epoch ms, 2020 to 2128: how the time in an effect record is found. Effects
/// that never run out carry the end of 2099.
const EFFECT_MS: std::ops::Range<u64> = 1_580_000_000_000..5_000_000_000_000;

/// `2A 38` / `2B 38 <source varint> ... <u64 ms> <target varint> <0-8 bytes>
/// <x y z f32>`: an effect put on the target (a buff, a heal, a hit's debuff,
/// whoever put it there), and where the target stands (Nyerk 0.2.17: all
/// 112,742 effect records of a capture read this way, median error 0 against
/// the entities' own movement). A field before the time can read as one, so
/// each window that does is tried in turn.
pub fn effect_position(frame: &[u8]) -> Option<(u32, f32, f32)> {
    let b = OP_EFFECTS.iter().find_map(|&op| body(frame, op))?;
    (1..b.len().saturating_sub(8).min(40)).find_map(|i| {
        if !u64_at(b, i).is_some_and(|t| EFFECT_MS.contains(&t)) {
            return None;
        }
        let (target, n) = varint(b, i + 8)?;
        if target == 0 {
            return None;
        }
        let start = i + 8 + n;
        (start..(start + 9).min(b.len().saturating_sub(11))).find_map(|off| place_at(b, off).map(|(x, y)| (target, x, y)))
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct Character {
    pub entity: u32,
    pub name: String,
    pub server: u16,
    /// The class number (`roster_class`), level and gear score, when they read as such.
    pub class: Option<u32>,
    pub level: Option<u32>,
    pub gear_score: Option<u32>,
}

/// `33 36 <entity varint> <5 bytes> <len u8> <name> <server u16> <class u32> <u8> <level u32>
/// <gear score u32> ...`: you, on every zone entry (logins included, right after the
/// collection). Ksix 1406: class 6, Lv45, 2732 gear score (the owner's 2026-10-31 log; NCSoft's
/// item level for her says 2732 too).
pub fn character(frame: &[u8]) -> Option<Character> {
    let b = body(frame, OP_SELF)?;
    let (entity, pos) = varint(b, 0)?;
    (pos..(pos + 12).min(b.len())).find_map(|p| {
        let name = name_at(b, p)?;
        let end = p + 1 + name.len();
        let class = u32_at(b, end + 2).filter(|c| roster_class(*c).is_some());
        let level = u32_at(b, end + 7).filter(|l| (1..=99).contains(l));
        let gear_score = u32_at(b, end + 11).filter(|g| *g < 100_000);
        let read = class.is_some() && level.is_some() && gear_score.is_some();
        Some(Character {
            entity,
            server: u16_at(b, end)?,
            name,
            class: class.filter(|_| read),
            level: level.filter(|_| read),
            gear_score: gear_score.filter(|_| read),
        })
    })
}

/// One character of the account, as the character selection screen lists them.
#[derive(Debug, Clone, PartialEq)]
pub struct ListedCharacter {
    pub name: String,
    pub server: u16,
    /// NCSoft's key for the character: `<server u16> 00 00 <number u32>`, as a u64. Their
    /// portrait is `profileimg.plaync.com/...?gameServerKey=<server>&charKey=<key>`.
    pub key: u64,
    /// The class number (`roster_class`).
    pub class: u32,
    pub level: u32,
    pub gear_score: u32,
    pub legion: Option<String>,
}

/// `15 36 <u16> <u64 ms> <u64 ms> <count u8>`, then per character `<u32> <len><name> <class u32>
/// <u8> <u8> <level u32> <4 bytes> <gear score u32> <20 bytes> <len><legion> ...` and its gear
/// and looks, some 2.5 KB, with `<key u64> <u32> <u64 ms>` in the last part: the server's characters, as you
/// pick the server (the owner's 2026-10-31 log, 5 characters on Ariel). A character is found
/// where those fields read as such; its key is the first `<number u32> 00 00 <server u16>` after
/// them with a time 4 bytes on.
pub fn character_list(frame: &[u8]) -> Option<Vec<ListedCharacter>> {
    let b = body(frame, OP_CHARACTER_LIST)?;
    let count = *b.get(18)? as usize;
    // Each character's place: its name, and where its fixed fields end.
    let mut found: Vec<(usize, String, u32, u32, u32)> = Vec::new();
    let mut at = 19;
    while at + 40 < b.len() && found.len() < count {
        let hit = name_at(b, at).and_then(|name| {
            let end = at + 1 + name.len();
            let class = u32_at(b, end)?;
            let level = u32_at(b, end + 6)?;
            let gear_score = u32_at(b, end + 14)?;
            let ok = roster_class(class).is_some() && (1..=2).contains(b.get(end + 4)?) && (1..=99).contains(&level) && gear_score < 100_000;
            ok.then_some((end, name, class, level, gear_score))
        });
        match hit {
            Some(c) => {
                at = c.0 + 38;
                found.push(c);
            }
            None => at += 1,
        }
    }
    if found.len() != count {
        return None;
    }
    let mut out = Vec::with_capacity(count);
    for (i, (end, name, class, level, gear_score)) in found.iter().enumerate() {
        let stop = found.get(i + 1).map_or(b.len(), |n| n.0);
        let key = (end + 38..stop.saturating_sub(8)).find_map(|k| {
            let server = u16_at(b, k + 6)?;
            let ok = (1000..=9999).contains(&server) && u16_at(b, k + 4)? == 0 && u32_at(b, k)? != 0 && plausible_ms(b, k + 12);
            ok.then(|| (u64_at(b, k), server))
        })?;
        let legion = text(b, end + 38, 48).map(|(s, _)| s).filter(|s| s.chars().all(|c| !c.is_control()));
        out.push(ListedCharacter { name: name.clone(), server: key.1, key: key.0?, class: *class, level: *level, gear_score: *gear_score, legion });
    }
    Some(out)
}

/// `0B 61 <count varint>`, then per counter `<flags u8> <id u32>` and its values: a u64 for each
/// of flags 01 and 02, a varint for each of 04 and 08 (a value of 0 is left out, its flag
/// clear; read back as 0 when a later value follows, so each keeps its place). Your character's
/// counters, at login: Odyle energy is 60000001 (basic, charged), the Shugo Festival keys 1 (the
/// owner's 2026-10-31 logs, 73 counters), Nightmare 4 (daily entries, tickets), the Ascension
/// Trial's entries left 80000001 and its weekly cap 70000001 (a friend's captures, server 1406).
pub fn counters(frame: &[u8]) -> Option<Vec<(u32, Vec<u64>)>> {
    let b = body(frame, OP_COUNTERS)?;
    let (count, mut at) = varint(b, 0)?;
    let mut out = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let (id, values, n) = counter_at(b, at)?;
        out.push((id, values));
        at += n;
    }
    (at == b.len()).then_some(out)
}

/// One counter of `counters`' list at `at`: its id, values and length.
fn counter_at(b: &[u8], start: usize) -> Option<(u32, Vec<u64>, usize)> {
    let flags = *b.get(start)?;
    if flags & 0xF0 != 0 {
        return None;
    }
    let id = u32_at(b, start + 1)?;
    let mut at = start + 5;
    let mut values = Vec::new();
    // The second of a pair alone: the first was 0.
    if flags & 0x03 == 0x02 {
        values.push(0);
    }
    for bit in [0x01, 0x02] {
        if flags & bit != 0 {
            values.push(u64_at(b, at)?);
            at += 8;
        }
    }
    if flags & 0x0C == 0x08 {
        values.push(0);
    }
    for bit in [0x04, 0x08] {
        if flags & bit != 0 {
            let (v, n) = varint(b, at)?;
            values.push(v as u64);
            at += n;
        }
    }
    Some((id, values, at - start))
}

/// `0C 61 00 <counter as in counters> <u8>`: one counter changed, while you play. The Abyss's
/// Artifact corridors are 10000001-10000003 (Reshanta's Root, Sulfur Tree Island, Archipelago of
/// Siel's Wings): their passage time (130000 ms, the "02:10" the game shows) given when you enter
/// the Abyss after a reset, and cleared once the corridor is done; your Abyss time (3) ticks while
/// you are there (the owner's 2026-11-01 logs).
pub fn counter(frame: &[u8]) -> Option<(u32, Vec<u64>)> {
    let b = body(frame, OP_COUNTER)?;
    // 0: changed by the game or a run spent, then a u8; 1: given by an item, then a u8 and the
    // amount u32 (energy +10: 575 to 585, the owner's 2026-11-22 log).
    let tail = match b.first()? {
        0 => 1,
        1 => 5,
        _ => return None,
    };
    let (id, values, n) = counter_at(b, 1)?;
    (1 + n + tail == b.len()).then_some((id, values))
}

/// `AB FF <points u64> <limit u64>`: the week's Abyss Points and their weekly limit, at a login
/// (just before the record naming the character) and with every gain. Since the game's 2026-10-29
/// build (`A9 FF` before), read as A2Tools DPS Meter does (`1e4bd80`): 132456 of 2500000, then
/// 133369 for the 913 the game said (2026-11-02).
pub fn abyss_points(frame: &[u8]) -> Option<(u64, u64)> {
    let b = body(frame, OP_ABYSS_POINTS)?;
    if b.len() != 16 {
        return None;
    }
    let (points, limit) = (u64_at(b, 0)?, u64_at(b, 8)?);
    ((1..=1_000_000_000).contains(&limit) && points <= limit).then_some((points, limit))
}

const KINA_ITEM: [u8; 4] = [0x3f, 0x33, 0x70, 0x37];

/// Your Kina balance: `1B 56 01 01 00 <u32> <u32> 3f 33 70 37 <balance u64>`.
/// The same opcode carries other stacks with other item bytes.
pub fn kina(frame: &[u8]) -> Option<u64> {
    currency(frame, KINA_ITEM)
}

/// The Abyss Points balance, the same record as Kina's with the item byte 0x23: in the owner's
/// 2026-11-14 19:12 corridor log it rose 200 to 270 with every kill (247271, 247524, 247776...)
/// while the weekly figure `ab ff` stayed still. The item before it, 0x21, rose 70 to 200 a kill.
const ABYSS_ITEM: [u8; 4] = [0x23, 0x33, 0x70, 0x37];

pub fn abyss_balance(frame: &[u8]) -> Option<u64> {
    currency(frame, ABYSS_ITEM)
}

/// Your subscriptions (`3B E3`, at login): `<count varint> (<u8> <id u32> <u64> <end u64>)*`, the
/// end in unix ms. As Abyss DPS Meter (v4.2.8) reads it (`DecodeSubscribeList`, its membership from
/// ids 1 (Special Shugo), 3 (Tsenka) and 4-7 (Special Quai), ended at the second u64). Each (id, end).
pub fn subscriptions(frame: &[u8]) -> Option<Vec<(u32, u64)>> {
    let b = body(frame, OP_SUBSCRIPTIONS)?;
    let (count, mut at) = varint(b, 0)?;
    if count > 64 {
        return None;
    }
    let mut out = Vec::with_capacity(count as usize);
    for _ in 0..count {
        out.push((u32_at(b, at + 1)?, u64_at(b, at + 13)?));
        at += 21;
    }
    (at == b.len()).then_some(out)
}

/// Your Kina and bound Kina in the item list the game sends as you enter the world (`11 56`, Abyss
/// DPS Meter's `DecodeItemDepotList`: two bytes, a count, then the items). Its items have equipment
/// details of varying length, so the two currencies are found by their item ids, each followed by
/// its amount (u64), as in `1B 56`. None for either not in the list.
pub fn wallet(frame: &[u8]) -> Option<(Option<u64>, Option<u64>)> {
    let b = body(frame, OP_ITEM_LIST)?;
    let find = |item: [u8; 4]| b.windows(4).position(|w| w == item).and_then(|at| u64_at(b, at + 4));
    let (kina, bound) = (find(KINA_ITEM), find(BOUND_KINA_ITEM));
    (kina.is_some() || bound.is_some()).then_some((kina, bound))
}

/// The season's Oath Coins (its points): an item of their own, each character's (the owner's 2026-11-26
/// log: 44,920 in the login's list, 45,820 in the `1B 56` of the 900 a mission gave).
pub const SEASON_POINTS: u32 = 930_100_019;
/// The Abyss Points, as an item (`ABYSS_ITEM`'s id).
pub const ABYSS_POINTS: u32 = 930_100_003;
/// The balances each character's row shows (with Kina): the Oath Coins and the Abyss Points.
pub const BALANCES: [u32; 2] = [SEASON_POINTS, ABYSS_POINTS];

/// The season's weekly rewards' progress, one of the `83 56` / `84 56` progress records (0 to 8,000,
/// back to 0 at the weekly reset: Nayoul's 8,000 on 2026-11-23, 0 after the reset, 320 after a mission).
pub const SEASON_WEEK: u32 = 210_000_100;

/// The currencies the Session page counts besides Kina and Abyss Points (questlog.gg's item ids):
/// the Enhance Stones (dailies, quests), the Phantasmal Fragments (the Nightmares), the season's points.
pub const SESSION_CURRENCIES: [u32; 3] = [930_100_023, 930_100_017, SEASON_POINTS];

/// BALANCES in a message listing items (the login's `11 56`, a change's `1B 56`), as Kina's: each id
/// followed by its amount (u64).
pub fn balances(frame: &[u8]) -> Vec<(u32, u64)> {
    let Some(b) = body(frame, OP_ITEM_LIST).or_else(|| body(frame, OP_ITEM)) else { return Vec::new() };
    BALANCES
        .iter()
        .filter_map(|&id| {
            let at = b.windows(4).position(|w| w == id.to_le_bytes())?;
            Some((id, u64_at(b, at + 4)?))
        })
        .collect()
}

/// A progress record's value: in the login's list (`83 56`, records of `<id u32> <value u32> <at u64>
/// <step u8>`) or a change (`84 56 01 <id u32> <value u32> <at u64> <step u8>`).
pub fn progress(frame: &[u8], id: u32) -> Option<u32> {
    if let Some(b) = body(frame, OP_PROGRESS) {
        return (b.first() == Some(&1) && u32_at(b, 1) == Some(id)).then(|| u32_at(b, 5)).flatten();
    }
    let b = body(frame, OP_PROGRESS_LIST)?;
    let at = b.windows(4).position(|w| w == id.to_le_bytes())?;
    u32_at(b, at + 4)
}

/// The balances of SESSION_CURRENCIES a `1B 56` changes: found by their item ids, each followed by
/// its amount (u64), as Kina's (a record can list several items, with equipment of varying length).
pub fn currencies(frame: &[u8]) -> Vec<(u32, u64)> {
    let Some(b) = body(frame, OP_ITEM) else { return Vec::new() };
    SESSION_CURRENCIES
        .iter()
        .filter_map(|&id| {
            let at = b.windows(4).position(|w| w == id.to_le_bytes())?;
            Some((id, u64_at(b, at + 4)?))
        })
        .collect()
}

/// A dungeon begins (`01 40 <zone u32> ...`, as you are let in) and is cleared (`01 61 <u8> <zone
/// u32> ...`, its last boss down, or a field event over: 00 the owner's 2026-11-22 Nightmare, zone
/// 200003, 1 min 25 apart; 01 their Shugo Festival's "Up! Up! Up!", 500035).
pub fn dungeon_start(frame: &[u8]) -> Option<u32> {
    u32_at(body(frame, OP_DUNGEON_START)?, 0).filter(|&z| z > 0)
}

/// `00 61 <zone u32> <state u8> <at u64 ms> <deadline u64 ms>`: a run's state as the game keeps it, on its
/// own clock (A2Tools' `dungeon_state`): 1 entered (the countdown before the start), 2 under way (`at`:
/// its start; `deadline`: its time limit, 0 none), 3 over (`at`: when; the reward follows).
pub fn dungeon_state(frame: &[u8]) -> Option<(u32, u8, u64, u64)> {
    let b = body(frame, OP_DUNGEON_STATE)?;
    let zone = u32_at(b, 0).filter(|&z| z > 0)?;
    Some((zone, *b.get(4)?, u64_at(b, 5)?, u64_at(b, 13)?))
}

pub fn dungeon_clear(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_DUNGEON_CLEAR)?;
    matches!(b.first(), Some(0 | 1)).then(|| u32_at(b, 1)).flatten().filter(|&z| z > 0)
}

/// A Nightmare as you enter (`35 E2 00 00 <boss u32> <stage u32>`): its boss and level, the stage
/// being the level the game shows plus one. The owner's 2026-11-22 runs: Fortress Guardian Notun
/// (2001) level 2 sent stage 3, Mutated Gerod (2002) level 4 stage 5.
pub fn nightmare_start(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_NIGHTMARE_START)?;
    Some((u32_at(b, 2)?, u32_at(b, 6)?.checked_sub(1)?))
}

/// Where an item of the login's list (`11 56`) lies, its record's storage byte. The owner's
/// 2026-11-23 logins (Nayell, then Nayel): 1 the bag (Kina, potions, Silentium...), 2 the account's
/// shared warehouse (the same 91 items for both), 11 what is worn, 14 the Arcana, 15 the
/// character's own warehouse (Nayel's Seeds of Detection, Kisk stones, Clash Rune...; Nayell's empty).
pub const DEPOT_STORAGES: [u8; 5] = [1, 2, 11, 14, 15];

/// An item where it lies: its storage (DEPOT_STORAGES), its slot there, how many (0: the slot is
/// empty now), and an equipment's enchantment and the stones set in it (manastones, soulstones).
#[derive(Debug, Clone, PartialEq)]
pub struct DepotItem {
    /// The item's own id (the Arcana all lie in slot 0: told apart by it).
    pub uid: u32,
    pub storage: u8,
    pub slot: u8,
    pub item: u32,
    pub amount: u64,
    pub enchant: u8,
    /// Its item level (the game's, enchantment's included: the owner's Aulamus Bow +10, 91 = 70 + 21).
    pub level: u8,
    /// The stones set in it: (stone item, stat code, rank 1-3) (the bow's: Superior Manastones, Attack
    /// 0x13D ranks 3, 1, 2 and HP 0xC1 rank 1: Attack +10, +3, +5, HP +50 in game).
    pub stones: Vec<(u32, u16, u8)>,
    /// Its soul binding's stats: (stat code, value) (the bow's HP 0xC1 308, Combat Speed 0x11A 972
    /// (9.7%), Critical Hit 0x80 51).
    pub soul: Vec<(u16, u32)>,
    /// The skills it raises: (skill, levels) (the bow's Tempest Shot +1; an Arcana's four).
    pub skills: Vec<(u32, u8)>,
    /// An Arcana's own stats, not bound: (stat code, value) (the owner's Chalice of Vigor: 0x0B 21,
    /// "Time [Siel] 21" in game).
    pub stats: Vec<(u16, u32)>,
    /// The Theostone engraved, by its effect (the owner's Rupture Longbow: 19950011, Theostone:
    /// Zikel's Vestige, the items whose ids end the same five digits), or 0.
    pub theostone: u32,
}

/// The item records of a list (`11 56` at login, `1B 56` as they change): each `<uid u32> 00 <u16>
/// 00 <item u32> <amount u64> <storage u8> <slot u8> ...`, 35 bytes, an equipment's longer. So each
/// is found where an item id sits after those zeros, with a sane amount (`empty`: 0 too, a slot
/// emptied) and a known storage byte. An equipment's extra: its item level, then 3 or 4 zeros, its
/// slot again, then `<count u8>` stones of `<item u32> <stat u16> <rank u8>`; its enchantment the one
/// byte set between the record's start and its level (the owner's Nayell: Spiritforged Dagger +5,
/// Aulamus Earrings +10, Berk Necklace +7, as the game shows them). Further on, its soul binding:
/// `<n>` stats of `<code u16> <value u32>`, then `<n>` again with the same codes.
fn depot_records(b: &[u8], empty: bool) -> Vec<DepotItem> {
    let least = u64::from(!empty);
    let mut at = Vec::new();
    let mut i = 4;
    while i + 14 <= b.len() {
        let item = u32_at(b, i).unwrap_or(0);
        let amount = u64_at(b, i + 4).unwrap_or(0);
        if (100_000_000..1_000_000_000).contains(&item) && b[i - 1] == 0 && b[i - 4] == 0 && (least..=10_000_000_000).contains(&amount) && DEPOT_STORAGES.contains(&b[i + 12]) {
            at.push(i);
            i += 14;
        } else {
            i += 1;
        }
    }
    at.iter()
        .enumerate()
        .map(|(k, &i)| {
            let (storage, slot) = (b[i + 12], b[i + 13]);
            // This record's extra: up to the next one's uid.
            let end = at.get(k + 1).map_or(b.len(), |&n| n.saturating_sub(8)).max(i + 14);
            let extra = &b[i + 14..end];
            // Its slot again (where it is worn: 0 in a bag or a warehouse, the owner's Rupture Longbow),
            // after its level and 3 zeros (4 for some: the owner's Vakron Greaves).
            let worn = if storage == 11 { slot } else { 0 };
            let mark = (20..extra.len().saturating_sub(1))
                .find_map(|q| {
                    let lvl = if extra[q - 4] != 0 { q - 4 } else { q - 5 };
                    (extra[q] == worn && (1..=200).contains(&extra[lvl]) && extra[lvl + 1..q].iter().all(|&v| v == 0) && extra[q + 1] <= 6).then_some((q, lvl))
                });
            let (mut enchant, mut level, mut stones, mut soul, mut skills, mut stats, mut theostone) = (0, 0, Vec::new(), Vec::new(), Vec::new(), Vec::new(), 0);
            if let Some((q, lvl)) = mark {
                level = extra[lvl];
                enchant = extra[8..lvl].iter().copied().find(|&v| v != 0).filter(|&v| v <= 30).unwrap_or(0);
                for s in 0..extra[q + 1] as usize {
                    let o = q + 2 + 7 * s;
                    match (u32_at(extra, o), u16_at(extra, o + 4), extra.get(o + 6)) {
                        (Some(id), Some(stat), Some(&rank)) if (100_000_000..1_000_000_000).contains(&id) => stones.push((id, stat, rank)),
                        _ => break,
                    }
                }
                let rest = &extra[q + 2 + 7 * stones.len()..];
                // After the stones: `<u32> 00 00 <server u16> <u8> 03`, then the Theostone's effect.
                theostone = u32_at(rest, 10).filter(|v| (19_000_000..20_000_000).contains(v)).unwrap_or(0);
                soul = soul_binding(rest);
                if let Some((at, list)) = skill_list(rest) {
                    skills = list;
                    if soul.is_empty() {
                        stats = stat_list_before(rest, at);
                    }
                }
            }
            DepotItem { uid: u32_at(b, i - 8).unwrap_or(0), storage, slot, item: u32_at(b, i).unwrap_or(0), amount: u64_at(b, i + 4).unwrap_or(0), enchant, level, stones, soul, skills, stats, theostone }
        })
        .collect()
}

/// An equipment's soul binding, in the bytes after its stones: the first `<n>` (1-4) stats of `<code
/// u16> <value u32>` followed by `<n>` again with the same codes.
fn soul_binding(x: &[u8]) -> Vec<(u16, u32)> {
    for q in 0..x.len() {
        let n = x[q] as usize;
        if !(1..=4).contains(&n) || q + 2 + 12 * n > x.len() {
            continue;
        }
        let list: Vec<(u16, u32)> = (0..n).map(|s| (u16_at(x, q + 1 + 6 * s).unwrap_or(0), u32_at(x, q + 3 + 6 * s).unwrap_or(0))).collect();
        let again = q + 1 + 6 * n;
        if x[again] as usize == n && list.iter().enumerate().all(|(s, &(c, _))| c > 0 && c < 0x400 && u16_at(x, again + 1 + 6 * s) == Some(c)) {
            return list;
        }
    }
    Vec::new()
}

/// The skills an equipment raises: `<n>` (1-6) of `<skill u32> <levels u8>`, then `<n>` again with
/// the same skills and the levels they add on top (the owner's bow: Tempest Shot, 14340000, 1 + 0;
/// his Chalice of Vigor: Deadshot 1 + 1, +2 in game). Where it starts, and each skill's levels in all.
fn skill_list(x: &[u8]) -> Option<(usize, Vec<(u32, u8)>)> {
    (0..x.len()).find_map(|q| {
        let n = x[q] as usize;
        if !(1..=6).contains(&n) || q + 2 + 10 * n > x.len() {
            return None;
        }
        let list: Vec<(u32, u8)> = (0..n).map(|s| (u32_at(x, q + 1 + 5 * s).unwrap_or(0), x[q + 5 + 5 * s])).collect();
        let again = q + 1 + 5 * n;
        let ok = x[again] as usize == n && list.iter().enumerate().all(|(s, &(id, lv))| (10_000_000..30_000_000).contains(&id) && (1..=10).contains(&lv) && u32_at(x, again + 1 + 5 * s) == Some(id));
        ok.then(|| (q, list.iter().enumerate().map(|(s, &(id, lv))| (id, lv + x[again + 5 + 5 * s])).collect()))
    })
}

/// An Arcana's stats, just before its skills: `<n>` of `<code u16> <value u32>`, then a few zeros
/// (two on the owner's Chalice of Vigor).
fn stat_list_before(x: &[u8], skills: usize) -> Vec<(u16, u32)> {
    for (n, gap) in (1..=4usize).flat_map(|n| (1..=3usize).map(move |g| (n, g))) {
        let Some(q) = skills.checked_sub(1 + 6 * n + gap) else { continue };
        if x[q] as usize == n && x[skills - gap..skills].iter().all(|&v| v == 0) {
            let list: Vec<(u16, u32)> = (0..n).map(|s| (u16_at(x, q + 1 + 6 * s).unwrap_or(0), u32_at(x, q + 3 + 6 * s).unwrap_or(0))).collect();
            if list.iter().all(|&(c, v)| c > 0 && c < 0x400 && v < 1_000_000) {
                return list;
            }
        }
    }
    Vec::new()
}

/// Every item of the login's list (`11 56`), in its order.
pub fn depot(frame: &[u8]) -> Vec<DepotItem> {
    body(frame, OP_ITEM_LIST).map(|b| depot_records(b, false)).unwrap_or_default()
}

/// The slots an item record (`1B 56`) says anew: an item moved to the account's warehouse is its
/// new slot there and its old one in the bag at 0 (the owner's 2026-11-23 transfers).
pub fn item_slots(frame: &[u8]) -> Vec<DepotItem> {
    body(frame, OP_ITEM).map(|b| depot_records(b, true)).unwrap_or_default()
}

/// A party member's vitals (`1B 92`), as A2Tools' `parse_hp_mp_update_packet` reads its start:
/// `<entity varint> <hp varint> <max hp varint> <mp u32> <max mp u32> <u32> <u32> <flight time u32>
/// <max flight time u32> 01`, the times in ms. The owner's 2026-11-22 Vakron run: entity 11185, HP
/// 26,672 of 26,672, MP 3,489, flight 13.1 s of 150 s. (entity, hp, max hp, flight, max flight).
pub fn party_vitals(frame: &[u8]) -> Option<(u32, u32, u32, u32, u32)> {
    let b = body(frame, OP_PARTY_VITALS)?;
    let (entity, n1) = varint(b, 0)?;
    let (hp, n2) = varint(b, n1)?;
    let (max_hp, n3) = varint(b, n1 + n2)?;
    let at = n1 + n2 + n3;
    let (mp, max_mp) = (u32_at(b, at)?, u32_at(b, at + 4)?);
    let (fp, max_fp) = (u32_at(b, at + 16)?, u32_at(b, at + 20)?);
    (entity >= 100 && max_hp > 0 && hp <= max_hp && max_hp <= 50_000_000 && mp <= max_mp && fp <= max_fp).then_some((entity, hp, max_hp, fp, max_fp))
}

/// A duty mission's rewards: `<count u8>`, then each `<item u32> <amount varint> 00 <chance u32,
/// of 100,000,000> 00 00 00 00`. The owner's 2026-11-23 Safe Hiking: Kina (Bound) x10,000 sure,
/// Yggdrasil Log 50%, Small Odyle Energy 33% and 25%, Cogni Soul Crystal x200 10%. Its rewards (item,
/// amount, chance) and where they end; None unless all read.
pub type DutyReward = (u32, u32, u32);
/// A duty mission: its quest, its place on the board, its rewards.
pub type DutyMission = (u32, u32, Vec<DutyReward>);

/// An entry's two lists of items from `at`: its items and where they end; None unless all read as
/// items, at least one (a player part's bytes can read as two empty lists).
fn board_lists(b: &[u8], mut at: usize) -> Option<(Vec<(u32, u32)>, usize)> {
    let mut items = Vec::new();
    for _ in 0..2 {
        let n = *b.get(at)? as usize;
        at += 1;
        for _ in 0..n {
            let (item, amount) = (u32_at(b, at)?, u32_at(b, at + 4)?);
            if !(100_000_000..1_000_000_000).contains(&item) || amount == 0 || amount > 100_000_000 {
                return None;
            }
            items.push((item, amount));
            at += 8;
        }
    }
    (!items.is_empty()).then_some((items, at))
}

/// Your bound Kina, the same record with item 930100001 (`21 33 70 37`): the item Abyss DPS Meter's
/// ticket roster (v4.2.8) reads beside Kina as `boundKina`.
const BOUND_KINA_ITEM: [u8; 4] = [0x21, 0x33, 0x70, 0x37];

pub fn bound_kina(frame: &[u8]) -> Option<u64> {
    currency(frame, BOUND_KINA_ITEM)
}

/// Any item of a `1B 56` record: its id and the stack's amount (an item bought lands in your bags
/// this way: the app marks it bought on the Black Cloud Merchant's list).
pub fn item_change(frame: &[u8]) -> Option<(u32, u64)> {
    let b = body(frame, OP_ITEM)?;
    if b.len() < 23 || b[0] != 0x01 {
        return None;
    }
    Some((u32_at(b, 11)?, u64_at(b, 15)?))
}

/// A currency's balance in a `1B 56`: a record of one item at its place, or in a record of several
/// (a cube opened: 28 items, equipment of varying length among them) found by its id, each followed
/// by its amount (u64), as `currencies` does.
fn currency(frame: &[u8], item: [u8; 4]) -> Option<u64> {
    let b = body(frame, OP_ITEM)?;
    if b.len() < 23 || b[0] == 0 {
        return None;
    }
    if b[0] == 0x01 {
        return if b[11..15] == item { u64_at(b, 15) } else { None };
    }
    let at = b.windows(4).position(|w| w == item)?;
    u64_at(b, at + 4)
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldBoss {
    pub id: u32,
    pub up: bool,
    /// up: when it spawned (0 since the 2026-10-14 patch); dead: when it respawns
    pub at_ms: u64,
}

fn plausible_ms(b: &[u8], at: usize) -> bool {
    u64_at(b, at).is_some_and(|v| (1_600_000_000_000..2_200_000_000_000).contains(&v))
}

/// `01 91 <u16> <world u32> <count u8>`, then per boss: up `01 <id varint>
/// <x y z f32> [1 byte] <spawned u64 ms>`, dead `00 <id varint> <respawns u64
/// ms>`: the map's field boss list, every ~3 s while the map is open. Some
/// entries carry a byte more before the time, so the time is found where an ms
/// timestamp fits, or a 0 (no time: Watcher Kaira in the Abyss's list, world
/// 20, sent as you enter it; its bosses are 2001-2008, the owner's 2026-11-03 log).
pub fn field_bosses(frame: &[u8]) -> Option<(u32, Vec<FieldBoss>)> {
    let b = body(frame, OP_FIELD_BOSSES)?;
    let world = u32_at(b, 2)?;
    let n = *b.get(6)?;
    let mut pos = 7;
    let mut out = Vec::with_capacity(n as usize);
    for _ in 0..n {
        let up = match b.get(pos)? {
            0 => false,
            1 => true,
            _ => return None,
        };
        let (id, ln) = varint(b, pos + 1)?;
        pos += 1 + ln;
        if up {
            pos += 12;
            if pos > b.len() {
                return None;
            }
        }
        pos += (0..5).find(|&k| plausible_ms(b, pos + k) || u64_at(b, pos + k) == Some(0))?;
        out.push(FieldBoss { id, up, at_ms: u64_at(b, pos)? });
        pos += 8;
    }
    Some((world, out))
}

/// A field boss id as the map's list names them (101001 Neikel of the East, 101021 Eternal Gartua...).
fn boss_id(v: u32) -> bool {
    (101_001..=101_099).contains(&v)
}

/// How many different field boss ids a frame names, as varints or u32s: a diagnostic, to find the
/// messages that carry the bosses besides the list `field_bosses` reads.
pub fn boss_ids_in(frame: &[u8]) -> usize {
    let mut seen: Vec<u32> = Vec::new();
    for i in 0..frame.len() {
        let as_u32 = u32_at(frame, i).filter(|&v| boss_id(v));
        let as_varint = varint(frame, i).map(|(v, _)| v).filter(|&v| boss_id(v));
        for v in [as_u32, as_varint].into_iter().flatten() {
            if !seen.contains(&v) {
                seen.push(v);
            }
        }
    }
    seen.len()
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ShopItem {
    pub slot: u32,
    pub item: u32,
    pub quantity: u64,
    pub currency: u8,
    pub base: u64,
    pub price: u64,
}

const SHOP_RECORD: usize = 34;

fn shop_record(b: &[u8], o: usize) -> Option<ShopItem> {
    if o + SHOP_RECORD > b.len() {
        return None;
    }
    let item = ShopItem {
        slot: u32_at(b, o)?,
        item: u32_at(b, o + 4)?,
        quantity: u64_at(b, o + 8)?,
        currency: b[o + 17],
        base: u64_at(b, o + 18)?,
        price: u64_at(b, o + 26)?,
    };
    let ok = (1..1 << 24).contains(&item.slot)
        && item.item >= 100_000_000
        && (1..1_000_000).contains(&item.quantity)
        && item.price > 0
        && item.price <= item.base
        && item.base < 1_000_000_000_000;
    ok.then_some(item)
}

/// `91 56 <tab u8> <count u8>`, then per item `<slot u32> <item u32> <quantity
/// u64> <discount tier u8> <currency u8> <base u64> <price u64>`, then `<next
/// restock u64 ms>`: one Black Cloud Merchant tab, as it is opened. Some
/// records start one byte later, so each is tried where expected and one on.
pub fn shop(frame: &[u8]) -> Option<(u8, Vec<ShopItem>, Option<u64>)> {
    let b = body(frame, OP_SHOP)?;
    let (tab, count) = (*b.first()?, *b.get(1)?);
    let mut o = 2;
    let mut items = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let (start, item) = [o, o + 1].into_iter().find_map(|s| shop_record(b, s).map(|r| (s, r)))?;
        items.push(item);
        o = start + SHOP_RECORD;
    }
    let next = u64_at(b, o).filter(|&t| (1_500_000_000_000..4_000_000_000_000).contains(&t));
    Some((tab, items, next))
}

/// A world object (a gadget) coming into view, a Hidden Cube among them.
/// Layouts from dr89mh/aion2-cube-radar (GPL-3.0), `ObjectMessages.cs` and
/// docs/FINDINGS.md, checked there against cubes opened in its own captures.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ObjectSpawn {
    pub id: u32,
    pub template: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// When it spawned (ms since 1970); None when the record has no time.
    pub created_ms: Option<u64>,
}

/// `34 36 <id varint> <kind u16> <template u32> <x y z f32> <f32> <heading f32>
/// <u8 u8 state u8> <created u64 ms> ...`: an object in view, sent once you are
/// within its range (about 100 m for a cube).
pub fn object_spawn(frame: &[u8]) -> Option<ObjectSpawn> {
    let b = body(frame, OP_OBJECT_SPAWN)?;
    let (id, o) = varint(b, 0)?;
    if o + 26 > b.len() {
        return None;
    }
    let (x, y, z) = (f32_at(b, o + 6)?, f32_at(b, o + 10)?, f32_at(b, o + 14)?);
    if !(x.is_finite() && y.is_finite() && z.is_finite()) {
        return None;
    }
    let created_ms = u64_at(b, o + 29).filter(|t| (1_600_000_000_000..2_600_000_000_000).contains(t));
    Some(ObjectSpawn { id, template: u32_at(b, o + 2)?, x, y, z, created_ms })
}

/// `35 36 <id varint> <reason u8> ...`: an object gone from view: 04 destroyed
/// (a cube opened), 01 out of range.
pub fn object_removed(frame: &[u8]) -> Option<(u32, u8)> {
    let b = body(frame, OP_OBJECT_REMOVED)?;
    let (id, o) = varint(b, 0)?;
    Some((id, *b.get(o)?))
}

/// A player coming into view: `45 36 <entity varint> <4 bytes> 17 <len><name>
/// <u32> <faction u8> ...`, and some 100-120 bytes on `<server u16> <2 bytes>
/// 00 00 00 00 <server u16> <len><legion>` (Nyerk 0.2.17). The faction byte is
/// 1 Elyos, 2 Asmodian, as the server's thousands are (1406 Elyos, 2406
/// Asmodian: the 2026-10-21 and 10-25 packet logs).
#[derive(Debug, Clone, PartialEq)]
pub struct Player {
    pub entity: u32,
    pub name: String,
    pub server: Option<u16>,
    pub legion: Option<String>,
    /// 1 Elyos, 2 Asmodian: the server's, else the byte after the name's u32.
    pub faction: Option<u8>,
    /// The u32 right after the name: the class number (`roster_class`), as target info has it.
    pub class: Option<u32>,
    /// Where they stand, game (x, y): 8 bytes after the name (all 8 players of the 2026-10
    /// captures; Wolf's matched his effects' position to the unit).
    pub place: Option<(f32, f32)>,
    /// Their combat power, as the game shows it (`spawn_combat_power`).
    pub combat_power: Option<u32>,
    /// Their PvP switched on as they came into view: bit 02 of the fourth byte after the entity.
    /// Set on Coby, Tributação and RazielGT (PvP on, fought), clear on ZergBR and FAT (off): the
    /// owner's 2026-10-26 and 10-28 logs. SophieGreen, Zuharïs and Yamiel came in with it clear and
    /// switched it on in view (`pvp_switch`) before their fights. Later switches come as `54 36`.
    pub pvp: bool,
    /// Where they stand everyone can fight, PvP switched on or not (the Abyss): bit 10 of the
    /// fifth byte after the entity, the one before the name's length. 17 in every spawn of the
    /// owner's Abyss logs (2026-10-26 15:07-15:42, 10-27 02:23), 07 in all of the Altgard ones.
    pub open_pvp: bool,
}

pub const ELYOS: u8 = 1;
pub const ASMODIAN: u8 = 2;

/// A server's faction: 1xxx Elyos, 2xxx Asmodian.
pub fn server_faction(server: u16) -> Option<u8> {
    match server / 1000 {
        1 => Some(ELYOS),
        2 => Some(ASMODIAN),
        _ => None,
    }
}

pub fn player(frame: &[u8]) -> Option<Player> {
    let b = body(frame, OP_PLAYER)?;
    let (entity, pos) = varint(b, 0)?;
    let (name, at, end) = (pos..(pos + 12).min(b.len())).find_map(|p| {
        let name = name_at(b, p)?;
        let end = p + 1 + name.len();
        Some((name, p, end))
    })?;
    let mut server = None;
    let mut legion = None;
    for k in end + 40..(end + 200).min(b.len().saturating_sub(10)) {
        let v = u16_at(b, k)?;
        if (1000..=9999).contains(&v) && b[k + 4..k + 8] == [0, 0, 0, 0] && u16_at(b, k + 8) == Some(v) {
            server = Some(v);
            legion = text(b, k + 10, 48).map(|(s, _)| s);
            break;
        }
    }
    let server = server.or_else(|| unguilded_server(b, end));
    let faction = server.and_then(server_faction).or_else(|| b.get(end + 4).copied().filter(|f| [ELYOS, ASMODIAN].contains(f)));
    let class = u32_at(b, end).filter(|&c| roster_class(c).is_some());
    let place = place_at(b, end + 8);
    let combat_power = spawn_combat_power(b, end);
    let pvp = at == pos + 5 && b[pos + 3] & 0x02 != 0;
    let open_pvp = at == pos + 5 && b[pos + 4] & 0x10 != 0;
    Some(Player { entity, name, server, legion, faction, class, place, combat_power, pvp, open_pvp })
}

/// What every item of a player's gear in their spawn ends with.
const SPAWN_ITEM_TAIL: [u8; 14] = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x80, 0x75, 0xd5, 0x2a, 0xbb, 0x03];

/// The server of a player in no legion: there, the server is not repeated around a legion's name
/// but sits once before their gear, `<server u16> <count u8> <10, 11 or 13> ...`, the first such
/// past the stats with the faction the spawn states (Dæps 2406 and Elyos of the 2026-10-26 logs).
fn unguilded_server(b: &[u8], name_end: usize) -> Option<u16> {
    let faction = *b.get(name_end + 4)?;
    let tail = name_end + b.get(name_end..)?.windows(SPAWN_ITEM_TAIL.len()).position(|w| w == SPAWN_ITEM_TAIL)?;
    (name_end + 40..tail.saturating_sub(4))
        .filter(|&k| (1..=40).contains(&b[k + 2]) && [0x10, 0x11, 0x13].contains(&b[k + 3]))
        .find_map(|k| u16_at(b, k).filter(|&v| server_faction(v) == Some(faction)))
}

/// The mark the combat power follows in a player's spawn, at its last place after the name.
const SPAWN_CP_MARK: [u8; 3] = [0xf4, 0xcb, 0x1f];

/// A spawn's combat power: after the last `f4 cb 1f` past the name, two u32, sometimes one more
/// byte, then the combat power as a u64 (and a byte, mostly 0: 1 and 2 seen too). Taken only when the two readings (with
/// and without that byte) agree on one believable value. From another overlay's author (MarceUY,
/// `FindSpawnCombatPower`), checked on SquarX in the owner's 2026-10-26 log: 115485, shown 115.4k.
fn spawn_combat_power(b: &[u8], name_end: usize) -> Option<u32> {
    let rest = b.get(name_end..)?;
    let mark = name_end + rest.windows(3).rposition(|w| w == SPAWN_CP_MARK)?;
    let read = |at: usize| u64_at(b, at).filter(|v| (1_000..=10_000_000).contains(v));
    let at = mark + 3 + 8;
    match (read(at), read(at + 1)) {
        (Some(a), Some(b)) if a != b => None,
        (a, b) => a.or(b).map(|v| v as u32),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlayerCard {
    pub name: String,
    pub server: u16,
    /// The class number (`roster_class`).
    pub class: u32,
    pub level: u32,
    pub gear_score: u32,
    pub combat_power: u32,
}

/// `30 97 <character u32> 00 00 <server u16> <class u32> <level u32> <gear score u32>
/// <len><name> <server u16> 00 00 00 00 <combat power u32> ...`: a player's
/// card, its numbers as the game shows them (Shiggly 1406, Lv45, 2630 gear
/// score, 123186 combat power: the owner's 2026-10-26 packet log). The
/// character id is not the one players in view go by: the card is matched by
/// name and server.
pub fn player_card(frame: &[u8]) -> Option<PlayerCard> {
    let b = body(frame, OP_PLAYER_CARD)?;
    card_at(b).map(|(_, card)| card)
}

/// A card's fields from `character u32` on, as `player_card` lays them out: the character id and the card.
fn card_at(b: &[u8]) -> Option<(u32, PlayerCard)> {
    let server = u16_at(b, 6)?;
    let level = u32_at(b, 12)?;
    let gear_score = u32_at(b, 16)?;
    let name = name_at(b, 20)?;
    let end = 21 + name.len();
    let valid = (1000..=9999).contains(&server) && (1..=99).contains(&level) && gear_score < 100_000 && u16_at(b, end) == Some(server);
    valid.then_some((u32_at(b, 0)?, PlayerCard { name, server, class: u32_at(b, 8)?, level, gear_score, combat_power: u32_at(b, end + 6)? }))
}

/// Someone asking to join your party: `07 97 <group u32>` and then the same card as `30 97`
/// (the character id first). Sent for every applicant as they apply, though the game shows only
/// the first until it is answered (the owner's 2026-11-22 logs: Tadalafila, CP 66513, GS 1446,
/// while the game showed another).
pub fn applicant(frame: &[u8]) -> Option<(u32, PlayerCard)> {
    card_at(body(frame, OP_APPLICANT)?.get(4..)?)
}

/// `25 97 <character u32> 00 00 <server u16>`: an application gone (seen once, an applicant
/// 15 s after applying; a cancel is assumed). Accepting or rejecting one sends none, and the
/// ones who cancelled (Hasagi, Biaa) left no message in the 2026-11-22 log.
pub fn applicant_gone(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_APPLICANT_GONE)?;
    (b.len() == 8 && u16_at(b, 4)? == 0 && (1000..=9999).contains(&u16_at(b, 6)?)).then(|| u32_at(b, 0))?
}

/// `0B 97 0C <slot u8> <character u32> ...`: a member who joined your party (the same character
/// id an application carries).
pub fn member_joined(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_MEMBER_JOINED)?;
    (b.first() == Some(&0x0C)).then(|| u32_at(b, 2))?
}

/// The entity you selected (`35 38 <entity varint> 00 ...`, 4 to 6 bytes after the opcode). It
/// describes your own target only; the game sends nothing for others' targets. Seen in the owner's
/// 2026-11-14 18:22 log: Saphy `bc 44`, monsters as 3-byte ids.
pub fn selection(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_SELECTION)?;
    let (entity, n) = varint(b, 0)?;
    (entity > 0 && b.len() > n).then_some(entity)
}

/// `54 36 <entity varint> <01 on | 00 off>`: a player in view (you too) switching their PvP. Seen
/// on: you, then SophieGreen, Zuharïs and Yamiel a few seconds before their fights (the owner's
/// 2026-10-26 23:02 log). Off is assumed to be 00, not seen yet.
pub fn pvp_switch(frame: &[u8]) -> Option<(u32, bool)> {
    let b = body(frame, OP_PVP_SWITCH)?;
    let (entity, n) = varint(b, 0)?;
    match b.get(n..)? {
        [on] if *on <= 1 => Some((entity, *on == 1)),
        _ => None,
    }
}

/// `47 36 <entity varint> <reason u16>`: a player out of your view (out of
/// range 01, 02, a teleport 0a...). In every capture so far it follows only
/// players' `45 36`, never a monster's (those leave with `42 36`).
pub fn player_gone(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_PLAYER_GONE)?;
    let (entity, n) = varint(b, 0)?;
    (b.len() >= n + 2).then_some(entity)
}

/// A class by the number party records and target info carry: four values a class, which differ
/// by something else about the character (A2Tools' `JobClass::from_roster_class`, matched
/// against 14 players; Wolf's 13 and Shiggly's 14 both Rangers, as the owner confirmed). Named as
/// the meter names them.
pub fn roster_class(value: u32) -> Option<&'static str> {
    Some(match value {
        5..=8 => "Gladiator",
        9..=12 => "Templar",
        13..=16 => "Ranger",
        17..=20 => "Assassin",
        21..=24 => "Spiritmaster",
        25..=28 => "Sorcerer",
        29..=32 => "Cleric",
        33..=36 => "Chanter",
        _ => return None,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct TargetInfo {
    pub name: String,
    pub server: u16,
    pub level: u32,
    pub gear_score: u32,
    /// The class number (`roster_class`).
    pub class: u32,
    pub legion: Option<String>,
    /// As read: the tracker keeps only believable values (`steady_cp`).
    pub combat_power: u32,
}

/// The combat power's place in target info: this many bytes before the end of the body.
const TARGET_CP_FROM_END: usize = 33;

/// `50 36 00 00 <u8> <len><name> <class u32> 01 01 <level u32> <u32> <gear score
/// u32> <server u16> <server u16> ... <server u16> <len><legion> ... <combat
/// power u32> <29 bytes>`, some 3 KB: a player you target, their sheet as the
/// game shows it (Wolf 1406, Lv45, 2429 gear score, 125122 combat power, the
/// owner's 2026-10-26 packet log). Read from one capture: the combat power is
/// where it was there, counted from the end.
pub fn target_info(frame: &[u8]) -> Option<TargetInfo> {
    let b = body(frame, OP_TARGET_INFO)?;
    let (name, at) = (2..6).find_map(|p| name_at(b, p).map(|n| (n, p)))?;
    let end = at + 1 + name.len();
    let class = u32_at(b, end)?;
    let level = u32_at(b, end + 6)?;
    let gear_score = u32_at(b, end + 14)?;
    // Their home server, then the one they are on: not the same for one visiting yours (Arïse of
    // 2307 on 1305, 2026-11-23); the home one is theirs.
    let server = u16_at(b, end + 18)?;
    let here = u16_at(b, end + 20)?;
    if !(1000..=9999).contains(&server) || !(1000..=9999).contains(&here) || !(1..=99).contains(&level) || gear_score >= 100_000 {
        return None;
    }
    let legion = (end + 22..(end + 60).min(b.len().saturating_sub(2)))
        .find(|&k| u16_at(b, k) == Some(server))
        .and_then(|k| text(b, k + 2, 48))
        .map(|(s, _)| s)
        .filter(|s| !s.is_empty());
    let combat_power = u32_at(b, b.len().checked_sub(TARGET_CP_FROM_END)?)?;
    Some(TargetInfo { name, server, level, gear_score, class, legion, combat_power })
}

/// `33 8A <entity varint> <legion id u48> <server u16> <len><name>`: a player's
/// legion, yours included, resent every few seconds (Nyerk 0.2.17).
pub fn legion(frame: &[u8]) -> Option<(u32, String)> {
    let b = body(frame, OP_LEGION)?;
    let (entity, n) = varint(b, 0)?;
    let server = u16_at(b, n + 6)?;
    let (name, _) = text(b, n + 8, 48)?;
    (1000..=9999).contains(&server).then_some((entity, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A2Tools DPS Meter's `abyss_points_from_the_ab_record` (Nullception, 2026-11-02): a total,
    /// then the same after a gain of 913.
    #[test]
    fn the_abyss_points_balance_is_the_item_with_byte_23() {
        let f = frame(OP_ITEM, &hex("01 01 00 91 00 04 00 00 40 00 00 23 33 70 37 e7c5030000000000 0001010000000000"));
        assert_eq!(abyss_balance(&f), Some(247_271));
        assert_eq!(kina(&f), None);
        let other = frame(OP_ITEM, &hex("01 01 00 04 43 01 00 00 c8 00 00 21 33 70 37 d8de040000000000 00"));
        assert_eq!(abyss_balance(&other), None);
    }

    #[test]
    fn selection_is_the_entity_you_target() {
        let one = selection(&frame(OP_SELECTION, &hex("bc44 0000")));
        assert!(one.is_some());
        assert_eq!(one, selection(&frame(OP_SELECTION, &hex("bc44 00 b01a"))));
        assert!(selection(&frame(OP_SELECTION, &hex("ddd001 0000"))).is_some());
        assert_eq!(selection(&frame(OP_SELECTION, &hex("bc44"))), None);
    }

    #[test]
    fn the_season_points_read_as_a_currency() {
        // The owner's 2026-11-26 11:04 log: a season mission's 900 points, 44,920 to 45,820.
        let change = frame(OP_ITEM, &hex("020100a683040000a7000033337037fcb2000000000000010800000000000088dd7da20100000200000100d572040000910000418ee91f0603000000000000011d000000000000000000000000020000"));
        assert!(currencies(&change).contains(&(SEASON_POINTS, 45_820)));
        let login = frame(OP_ITEM_LIST, &hex("1002960200 33337037 78af000000000000 00 23337037 0a00000000000000"));
        assert_eq!(balances(&login), vec![(SEASON_POINTS, 44_920), (ABYSS_POINTS, 10)]);
        // The weekly rewards' bar: 320 after the mission (84 56), 0 in the login's list after the reset (83 56).
        assert_eq!(progress(&frame(OP_PROGRESS, &hex("01e458840c40010000273b5017a201000000")), SEASON_WEEK), Some(320));
        assert_eq!(progress(&frame(OP_PROGRESS, &hex("01a86cf2118e000000bb844f17a201000003")), SEASON_WEEK), None);
        assert_eq!(progress(&frame(OP_PROGRESS_LIST, &hex("0002 a86cf2118e000000bb844f17a201000003 e458840c401f0000273b5017a201000000")), SEASON_WEEK), Some(8_000));
    }

    #[test]
    fn a_runs_states_read_as_the_game_sends_them() {
        // A2Tools' cases: Vakron (600071) entered, under way with its 60-minute limit, over 7.5 minutes after.
        assert_eq!(dungeon_state(&frame(OP_DUNGEON_STATE, &hex("07280900 01 e1afea21a1010000 0000000000000000"))), Some((600_071, 1, 1_791_570_391_009, 0)));
        let (_, state, start, deadline) = dungeon_state(&frame(OP_DUNGEON_STATE, &hex("07280900 02 d105eb21a1010000 51f42122a1010000"))).unwrap();
        assert_eq!((state, deadline - start), (2, 60 * 60 * 1000));
        let (_, state, over, _) = dungeon_state(&frame(OP_DUNGEON_STATE, &hex("07280900 03 a0e3f121a1010000 600bfb21a1010000"))).unwrap();
        assert_eq!((state, over - start), (3, 449_999));
        assert_eq!(dungeon_state(&frame(OP_DUNGEON_STATE, &hex("4ba10700 03"))), None, "cut short");
    }

    #[test]
    fn a_monsters_cast_and_target_say_who_it_is_on() {
        // The owner's 2026-11-25 23:32 log: monster 28855 (b7e101) casting at you (3511, b71b), then landing.
        let start = frame(OP_CASTS[0], &hex("b7e101007ec412000102b71bfdac2dc321b850c835076c48432a1c46904e01e807"));
        assert_eq!(cast_on(&start), Some((28_855, 3_511, 1_229_950)));
        let lands = frame(OP_CASTS[1], &hex("b7e10100b71b7ec4120001edd9ee05268a52c815746c48007c1e46d804010000000100"));
        assert_eq!(cast_on(&lands), Some((28_855, 3_511, 1_229_950)));
        // Yours on it: a player's skill (8 digits).
        let yours = frame(OP_CASTS[0], &hex("b71b0090eed5001502b7e101a9eaf740a9ff4fc8bb156c4800ac1b46bc5e0100"));
        assert_eq!(cast_on(&yours), Some((3_511, 28_855, 14_020_240)));
        assert_eq!(selection_target(&frame(OP_SELECTION, &hex("b7e10100b71b"))), Some((28_855, 3_511)));
        assert_eq!(selection_target(&frame(OP_SELECTION, &hex("b7e1010000"))), Some((28_855, 0)));
    }

    #[test]
    fn abyss_points_read_the_week_and_its_limit() {
        assert_eq!(abyss_points(&hex("13abff6805020000000000a025260000000000")), Some((132_456, 2_500_000)));
        assert_eq!(abyss_points(&hex("13abfff908020000000000a025260000000000")), Some((133_369, 2_500_000)));
        // Past its limit, or a limit of 0: not this record.
        assert_eq!(abyss_points(&hex("13abffa125260000000000a025260000000000")), None);
        assert_eq!(abyss_points(&hex("13abff68050200000000000000000000000000")), None);
        // The old `A9 FF` is not read.
        assert_eq!(abyss_points(&hex("13a9ff6805020000000000a025260000000000")), None);
    }

    #[test]
    fn the_character_list_reads_every_character() {
        let list = character_list(&frame(OP_CHARACTER_LIST, &hex(include_str!("testdata/character-list-ksix.hex")))).unwrap();
        let rows: Vec<_> = list.iter().map(|c| (c.name.as_str(), c.server, roster_class(c.class).unwrap(), c.level, c.gear_score)).collect();
        assert_eq!(
            rows,
            [
                ("Ksix", 1406, "Gladiator", 45, 2732),
                ("Ksixx", 1406, "Templar", 45, 1059),
                ("Ksixxx", 1406, "Ranger", 45, 917),
                ("Ksixxxx", 1406, "Spiritmaster", 45, 1096),
                ("TremendoHeal", 1406, "Cleric", 45, 804),
            ]
        );
        // NCSoft's keys for them, as their search and portraits have them.
        assert_eq!(list[0].key, 395753817255410831);
        assert_eq!(list[1].key, 395753817255417622);
        assert_eq!(list[2].key, 395753817255465709);
        assert_eq!(list[3].key, 395753817255486953);
        assert_eq!(list[4].key, 395753817255505632);
        assert_eq!(list[0].legion.as_deref(), Some("Lokthar"));
        assert_eq!(list[1].legion.as_deref(), Some("Lokthar\u{30c3}"));
    }

    /// The applications of 2026-11-22 (4d6ad426 log), and the join of one of them.
    #[test]
    fn an_application_reads_as_a_card_and_joins_by_character() {
        let (id, c) = applicant(&frame(OP_APPLICANT, &hex("2def0300 504e0400 0000 6409 20000000 2d000000 ae080000 08 6956656c6c617269 6409 00000000 35910100 00000000 01"))).unwrap();
        assert_eq!((id, c.name.as_str(), c.server, c.class, c.level, c.gear_score, c.combat_power), (0x44e50, "iVellari", 2404, 32, 45, 2222, 102_709));
        assert_eq!(applicant(&frame(OP_APPLICANT, &hex("2def0300 504e0400"))), None);
        assert_eq!(applicant_gone(&frame(OP_APPLICANT_GONE, &hex("33480500 0000 7905"))), Some(0x54833));
        assert_eq!(applicant_gone(&frame(OP_APPLICANT_GONE, &hex("33480500 0001 7905"))), None);
        assert_eq!(member_joined(&frame(OP_MEMBER_JOINED, &hex("0c03 504e0400 0000 6409 08 6956656c6c617269"))), Some(0x44e50));
        assert_eq!(member_joined(&frame(OP_MEMBER_JOINED, &hex("0d03 504e0400"))), None);
    }

    #[test]
    fn a_nightmare_reads_its_zone_boss_level_and_clear() {
        assert_eq!(dungeon_start(&frame(OP_DUNGEON_START, &hex("430d03000000000000000000000100"))), Some(200_003));
        assert_eq!(dungeon_clear(&frame(OP_DUNGEON_CLEAR, &hex("00430d03000100"))), Some(200_003));
        assert_eq!(dungeon_clear(&frame(OP_DUNGEON_CLEAR, &hex("0143a1070001d1e10600"))), Some(500_035));
        // Fortress Guardian Notun level 2, then Mutated Gerod level 4.
        assert_eq!(nightmare_start(&frame(OP_NIGHTMARE_START, &hex("0000d107000003000000"))), Some((2001, 2)));
        assert_eq!(nightmare_start(&frame(OP_NIGHTMARE_START, &hex("0000d207000005000000"))), Some((2002, 4)));
    }

    #[test]
    fn kina_reads_in_a_record_of_several_items() {
        // The owner's 2026-11-22 Vakron Sky Island cube: 28 items, Kina first, 4,678,749 + 600,000.
        let f = frame(OP_ITEM, &hex("1c010068620e00004301003f3370371d8c5000000000000001000000000000000000000000000000"));
        assert_eq!(kina(&f), Some(5_278_749));
    }

    #[test]
    fn a_resource_gathered_reads_its_item_and_amount() {
        assert_eq!(gather(&frame(OP_GATHER, &hex("003ab8c7015d2b652401000000000000000000000000000000"))), Some((0, 610_610_013, 1, 0)));
        // Ranked up (and doubled).
        assert_eq!(gather(&frame(OP_GATHER, &hex("013aa3b7015e2b652401000000010000000000000000000000"))), Some((1, 610_610_014, 1, 1)));
        // An invasion's board names its player with 1E after the name (the Shugo Festival's 0E).
        assert_eq!(board_name(&hex("01190500 2a1a0300 00001905 054e6179656c1e00000001".replace(' ', "").as_str())), Some("Nayel".to_string()));
        // The owner's supply requests: Silentium, then Blacksmith Weapon.
        assert_eq!(supply_done(&frame(OP_SUPPLY_DONE, &hex("3c6d5200ad6d0f000000000002233370376806000037337037a4010000"))), Some((1_011_117, vec![(930_100_003, 1640), (930_100_023, 420)])));
        assert_eq!(supply_done(&frame(OP_SUPPLY_DONE, &hex("0572520009750f0000000000012333703730070000"))), Some((1_013_001, vec![(930_100_003, 1840)])));
        // The owner's crafts: an Orichalcum Guard (recipe 111086001), then the one that procced.
        assert_eq!(craft_start(&frame(OP_CRAFT_START, &hex("0005b08701b1099f0601000304006500000065000000060070000000700000000100f3010000f3010000"))), Some((111_086_001, 1, 5200)));
        assert_eq!(
            craft_start(&frame(OP_CRAFT_START, &hex("0005b08701b1099f060d00050300eb000000eb0000000300eb000000eb000000060070000000700000000600700000007000000002008200000082000000"))),
            Some((111_086_001, 13, 16_700))
        );
        // Their starts, which already said it: gathered, ranked up, failed.
        assert_eq!(gather_start(&frame(OP_GATHER_START, &hex("0000a3b70102000000070000020000000305"))).map(|g| (g.0, g.1, g.2, g.3, g.4, g.5)), Some((23459, 2, 7, 2, false, 1120)));
        assert_eq!(gather_start(&frame(OP_GATHER_START, &hex("0000b3b20101000000000000010000000605"))).map(|g| (g.0, g.1, g.2, g.3, g.4, g.5)), Some((22835, 1, 0, 1, false, 110)));
        // Its rolls: two successes with Proficient Handling (110 + 50), then the doubling's 40: the 360 gauge.
        let rolls = gather_start(&frame(OP_GATHER_START, &hex("0000b8c701010000000100000100000003030120030000012a0300006e000000a00000000000000000000000030120030000012a0300006e000000a00000000000000000000000030158150100015a15010028000000280000000000000000000000"))).unwrap().6;
        assert_eq!(rolls.iter().map(|r| (r.success, r.failure, r.doubled)).collect::<Vec<_>>(), vec![(160, 0, false), (160, 0, false), (40, 0, true)]);
        // The skills with their levels: Proficient Handling Lv. 10 twice, Plentiful Harvest Lv. 3.
        assert_eq!(rolls.iter().map(|r| r.skills.clone()).collect::<Vec<_>>(), vec![vec![810], vec![810], vec![71_002]]);
        // Gathered twice (x2), then once.
        assert_eq!(
            gather_start(&frame(OP_GATHER_START, &hex("0000b8c701010000000100000100000003030120030000012a0300006e000000a00000000000000000000000030120030000012a0300006e000000a00000000000000000000000030158150100015a15010028000000280000000000000000000000"))).map(|g| (g.0, g.1, g.2, g.3, g.4, g.5)),
            Some((25528, 1, 1, 1, true, 5650))
        );
        assert_eq!(
            gather_start(&frame(OP_GATHER_START, &hex("0000b8c701020000000100000100000006060164000000016900000000000000000000006000000038000000040120030000012a03000032000000640000000000000000000000050164000000016900000000000000000000009000000068000000040120030000012a03000032000000640000000000000000000000040120030000012a0300003200000064000000000000000000000004000120030000012a030000320000003c0000000000000000000000"))).map(|g| (g.0, g.1, g.2, g.3, g.4, g.5)),
            Some((25528, 2, 1, 1, false, 7670))
        );
        // A failed one: nothing gathered.
        assert_eq!(gather(&frame(OP_GATHER, &hex("023ab3b2015d2b652400000000000000000000000000000000"))), Some((2, 610_610_013, 0, 0)));
        // The owner's "x2": one Odyle and one more.
        assert_eq!(gather(&frame(OP_GATHER, &hex("003afc95015d2b652401000000010000000000000000000000"))), Some((0, 610_610_013, 1, 1)));
    }

    /// The owner's 2026-11-23 duty board: two taken, 14 offered, rerolled twice.
    const BOARD_HEX: &str = "020000000200000010cf05000005de13008b01000000000000040521337037c03e0000e1f5050000000037337037f4030080f0fa02000000006826b41fc80100408af7010000000040da051e010040787d010000000021337037a08d06008096980000000000dd0500007cde1300000000000000000001056426b41fc8010000e1f5050000000037337037f4030080f0fa02000000006626b41fc80100408af7010000000037337037f4030040787d01000000002133703780f104008096980000000000de050000a4de1300000000000000000001053733703790030000e1f5050000000021337037904e0080f0fa02000000006e5265240100408af70100000000beee6524010040787d010000000037337037d00f008096980000000000df0500007bde13000000000000000000010537337037ac020000e1f5050000000021337037b06d0080f0fa0200000000dd1566240100408af7010000000041da051e010040787d010000000037337037d00f008096980000000000e00500008dde13000000000000000000010521337037c03e0000e1f505000000009bc76524010080f0fa020000000021337037c0bb0100408af7010000000021337037b0ea010040787d01000000006426b41fc801008096980000000000e105000094de13000000000000000000010537337037640000e1f5050000000021039706010080f0fa020000000021337037a09c0100408af7010000000021337037c0b8020040787d01000000006826b41fc801008096980000000000e205000084de13008c01000000000000040521337037904e0000e1f505000000009bc76524010080f0fa020000000040da051e0100408af7010000000040da051e010040787d01000000006426b41fc801008096980000000000e305000004de1300000000000000000001053733703790030000e1f505000000006826b41fc8010080f0fa020000000037337037e80700408af7010000000037337037f4030040787d01000000002133703780f104008096980000000000e405000096de13000000000000000000010537337037640000e1f5050000000021337037a09c010080f0fa0200000000434892060100408af701000000006e526524010040787d010000000021337037e0d403008096980000000000e50500005ede1300000000000000000001056626b41fc8010000e1f5050000000037337037f4030080f0fa020000000021337037f0ab0100408af7010000000037337037e8070040787d0100000000373370378827008096980000000000e60500007ade130000000000000000000105ec3c6624010000e1f5050000000037337037e8070080f0fa020000000037337037f40300408af7010000000021337037a099020040787d010000000037337037b817008096980000000000e705000006de1300000000000000000001056526b41fc8010000e1f505000000006526b41fc8010080f0fa020000000037337037f40300408af70100000000c0ee6524010040787d01000000006f52652401008096980000000000e80500006dde13000000000000000000010540da051e010000e1f505000000006826b41fc8010080f0fa020000000000b0890c0100408af701000000006426b41fc8010040787d0100000000fc88890c01008096980000000000e90500008ede13000000000000000000010543da051e010000e1f5050000000021337037d08c010080f0fa020000000037337037f40300408af701000000006e526524010040787d01000000002133703780f104008096980000000000ea0500008fde130000000000000000000105d9156624010000e1f5050000000062f18f0c010080f0fa02000000006526b41fc80100408af70100000000beee6524010040787d010000000037337037d00f008096980000000000eb050000fcdd1300000000000000000001053733703790030000e1f5050000000020039706010080f0fa02000000006826b41fc80100408af7010000000037337037d00f0040787d010000000021337037e0d40300809698000000000080553407a20100000080553407a2010000";

    #[test]
    fn a_shugo_festival_reward_board_reads_each_entry_and_its_player() {
        assert_eq!(
            box_opened(&frame(OP_BOX_OPENED, &hex("5d032f140a00002d0000159fcf1fff0100000001a27db3250006000000"))),
            Some(vec![(533700373, true, 1), (632520098, false, 6)])
        );
        // The owner's 2026-11-23 login as Nayell: 184 items, the bag's 71 (Kina 4,472,019), the
        // account's warehouse 91, worn 20, Arcana 2, her own warehouse empty.
        let items = depot(&frame(OP_ITEM_LIST, &hex("1002b8010037da080000f50100a1ed981f720000000000000001180000000000000000000000000000de0d090000cb010001b49f1f1d00000000000000012700000000000000000000000000f4c20600009902002455a71fa000000000000000012400000000000000000000000000ad4e0700009102002355a71f6900000000000000012300000000000000000000000000202b0a00004000003b55a71f5a0000000000000001260000000000000000000000000000ada90900009c0100d162991f44000000000000000115000000000000000000000000005d41090000a60100c145c11f3d00000000000000012d0000000000000000000000000051be0500006d0200373370377e83020000000000010500000000000000000000000000a243090000b401003f337037d33c4400000000000100000000000000000000000000000056c60800007c020023c59a250600000000000000014000000000000000000000000000f093090000f20100c2da992526030000000000000135000000000000000000000000007c230800004202007618a81f0a000000000000000114000000000000000000000000005bef080000c901007218a81f0a0000000000000001120000000000000000000000000000d6ed0400003002000181e61f1a00000000000000012000000000000000000000000000fdc8090000bb000040da051e38000000000000000131000000000088dd7da2010000007745080000430200418ee91f3701000000000000012100000000000000000000000000d9ae050000210200a6ed981f290000000000000001160000000000000000000000000000edf8040000f802006107aa2560040000000000000142000000000000000000000000009ce507000061020024f4cb1fcc06000000000000012e000000000000000000000000004d49070000490200a27db3251f00000000000000013c00000000000000000000000000752c0900007301007318a81f12000000000000000113000000000000000000000000000052b8090000fd0000aaed981f14000000000000000119000000000000000000000000001d540a00002a00002b337037ef01000000000000010200000000000000000000000000170f08000016020023337037052f0100000000000101000000000000000000000000012d1a070000480200123f8a12010000000000000001110000004000000000000000000000000000000000000000000000000d000000000000000000000000000003000000000000000000000000000000000000000000a95f020000940200e09dcf1f0200000000000000011e0000000000000000000000000096940800002f02005ada051e0100000000000000011d000000008099a67da20100000018eb0700000802003fda051e01000000000000000130000000008099a67da20100000100adfe080000d30100aeed981f0100000000000000011c000000000000000000000000005c32080000b20100a5ed981f0b00000000000000011b000000000000000000000000000561060000510200e192b22509000000000000000144000000000000000000000000006e71090000a10100333370378a430000000000000106000000008099a67da2010000010095180a00003a000021faa6250100000000000000014100000000000000000000000000f151090000ab010031337037930800000000000001040000000000000000000000000088a2080000f30100a133b71f0100000000000000012f000000000000000000000000001452070000af020042da051e06000000000000000133000000008099a67da2010000050053780700004c020041da051e08000000000000000132000000008099a67da2010000003f0c080000cf0200d1b77c1e1a00000000000000012c00000000000000000000000000774f090000e601002d337037030000000000000001030000000000000000000000000055240a0000650000b514991f2700000000000000011a000000000000000000000000000061590a0000360000b414991f1500000000000000011700000000000000000000000000ea5f0a00002e00003a55a71f070000000000000001250000000000000000000000000147880900007f010023bc7d12010000000000000001100000000000000000000000000700000000000000000000000000420000000004c17acd1fc70001c17acd1fc70001c17acd1f3d0102c17acd1f850001b27703000000190501030000000000000000000000000003850027000000ff0019000000c8001400000003850000000000ff0000000000c8000000000001306bd2000101306bd20000000000018bbb030000c4020022fa91060100000000000000010700000000000000000000000000000000000000000000000000000046000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000033d012900000062004d0000001a0124040000033d01000000006200000000001a010000000001907ab8000101907ab8000000000000c8f909000049010001e9ab1f1c00000000000000012800000000000000000000000000fce4070000c40100c17acd1f0f00000000000000012a00000000000000000000000000dc7d0800006e02003928761e070000000000000001220000000000000000000000000000403f0a0000280000d16bb2250100000000000000014300000000000000000000000000e2ab0900008201003d56b3250200000000000000013d00000000000000000000000001073b0700004d0200429b990601000000000000000109000000000000000000000000000000000000000000000000000046000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000049200ee020000c700a70000004b024a0000003e014400000004920000000000c700000000004b02000000003e01000000000000000000013ec2050000960200028e96060100000000000000010800000000000000000000000000000000000000000000000000000046000000000400000000000000000000000000000000000000000000000000000000b27703000000190501030000000000000000000000000004c700a00000003d01220000000500160000009200dc02000004c700000000003d010000000005000000000092000000000000000000000032aa05000046020003e9ab1f02000000000000000129000000000000000000000000007e80060000b70200c37acd1f0100000000000000012b00000000000000000000000000edc70600009202009c15a21f0600000000000000011f0000000000000000000000000000dffc0600009102005d2b65241600000000000000013f00000000000000000000000000c84f0a00004600005e2b65240a00000000000000013e000000000000000000000000001fac0600007b0200c480a8250a00000000000000013400000000000000000000000000575d080000490200d1f263241f00000000000000013b00000000000000000000000000004530070000050200a6a863240400000000000000013700000000000000000000000000e3e90600004d0200daf2632401000000000000000138000000000000000000000000001c83090000cb0100b146cc2304000000000000000139000000000000000000000000002398090000880100d5f263240100000000000000013a00000000000000000000000000011e1c0a00003d0000cb88890c0100000000000000010a00000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b2770300000019050103000000000000000000000000000263009600000029009a00000002630000000000290000000000012044d20001012044d2000000000001ec92090000cb0100cb88890c0100000000000000010b00000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b2770300000019050103000000000000000000000000000238010f0000003d0112000000023801000000003d0100000000012044d20001012044d20000000000014e6b080000050200ab1c8e0c0100000000000000010e0000000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b27703000000190501030000000000000000000000000003c70032000000aa019d00000002000c00000003c70000000000aa01000000000200000000000000000000010d19080000a40200ab1c8e0c0100000000000000010f00000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b27703000000190501030000000000000000000000000002c700320000003d010b00000002c700000000003d01000000000100f6d100010100f6d1000000000001d7240a00005500000b968c0c0100000000000000010c00000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000033d0109000000ff000e000000c80008000000033d0100000000ff0000000000c80000000000000000000001b13f0a00003200000b968c0c0100000000000000010d0000000000000000000000000000000000000000000000000000002a0000000003000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000033801090000006300650000001a0186010000033801000000006300000000001a01000000000000000000007a2d090000a20100a5a863240100000000000000013600000000000000000000000000373a030000990200beee6524010000000000000001450000000000000000000000000059590a0000400000bbee65240100000000000000014600000000000000000000000000003e3f090000f90100ec3c66241000000000000000025500000000000000000000000000a445090000da0100c3ee65240100000000000000023d00000000000000000000000000da19040000d00200ed3c6624700100000000000002560000000000000000000000000093ec090000320100f1b16624540000000000000002350000000000000000000000000000810d0700009002006e52652462000000000000000244000000000000000000000000000cb00300008a0200dd156624380000000000000002490000000000000000000000000065dd080000150200ef3c66247a000000000000000257000000000000000000000000000e4e020000860200f03c66242b0000000000000002580000000000000000000000000000a651090000e50100705265240900000000000000023c0000000000000000000000000074310700007a0200eb3c66247200000000000000025400000000000000000000000000b076080000fe01003955a71f1400000000000000021200000000000000000000000000509d0300000b0200bcee6524110000000000000002460000000000000000000000000000a0a90900003601007318a81f2000000000000000020d000000000000000000000000007d59040000c00200bdee65240a00000000000000024700000000000000000000000000844b0900001402003c55a71f1600000000000000021400000000000000000000000000afbc0900005101009bc765240e00000000000000024e0000000000000000000000000001132e090000b40100d7809306010000000000000002000000000000000000000000000000000000000000000000000000290000000004000000000000000000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000034b023a0000003e0137000000010012000000034b02000000003e0100000000010000000000019020c70001019020c70000000000010f290a00004900001ab596060100000000000000020400000000000000000000000000000000000000000000000000001700000000030000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000029200e701000062002e00000002920000000000620000000000015041e60001015041e600000000000090fd0700007f0200a5a86324030000000000000002250000000000000000000000000000fe550a00003a0000f33c66240500000000000000025900000000000000000000000001c53a0a00004b0000bcf58d0c0100000000000000020b0000000000000000000000000000000000000000000000000000240000000004000000000000000000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000039f006c010000020010000000c8000d000000039f0000000000020000000000c8000000000001c0620e010101c0620e0100000000003f3e090000830100519fc91e0900000000000000020c000000000000000000000000003af7030000c80200c47acd1f0900000000000000021c0000000000000000000000000000f545050000a002005d2b6524490a000000000000024c0000000000000000000000000068490a00004200008363a21f1e00000000000000020f0000000000000000000000000013c30900005501005e2b6524cb020000000000000243000000000000000000000000005e0c0a0000a60000515896257300000000000000025a000000000000000000000000000097140a00004900005f2b65247800000000000000023e00000000000000000000000000f91c0600007e02008730721e0e0000000000000002220000000000000000000000000067f8020000c80200bbee65243900000000000000025100000000000000000000000000a668090000000200b9ee65243500000000000000024f00000000000000000000000000005ad90900007b0100b146cc237600000000000000022a0000000000000000000000000087f8060000460200daf263240900000000000000022800000000000000000000000000f21d090000c30100d1b77c1e5b000000000000000220000000000000000000000000009f950300003b0200c480a825360300000000000002240000000000000000000000000000fba7080000040200beee65241300000000000000024800000000000000000000000000470f0a0000820000d9156624df00000000000000025200000000000000000000000000a380080000780200def263249c01000000000000023200000000000000000000000000b8ad090000420100baf66324630000000000000002340000000000000000000000000000ba5b0800006802006d526524c400000000000000024d00000000000000000000000000c89f050000350200da156624210000000000000002530000000000000000000000000078ea060000530200de1566240c00000000000000024a000000000000000000000000009193050000300200c17acd1fdb00000000000000021a000000000000000000000000000097cd09000072010003e9ab1f1600000000000000021800000000000000000000000000a3d0050000c9020001e9ab1fa700000000000000021700000000000000000000000000b9eb080000b60100602b65240d00000000000000023b00000000000000000000000000b1bf070000340200b9f663246100000000000000023300000000000000000000000000009288090000e50100d31f95251300000000000000022c00000000000000000000000000e48e070000980200d21f95252c00000000000000022f000000000000000000000000005bab0900006201009dc76524030000000000000002450000000000000000000000000093fa060000fe0100d1f263249b04000000000000023000000000000000000000000000010657090000b901001d6f8c0c0100000000000000020a000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000002ff000b00000085001500000002ff000000000085000000000002505fe1000110c3e0000102505fe1000010c3e000000000000035b7090000380100d8f263241500000000000000022b0000000000000000000000000087ff050000a90200d5f263249b00000000000000022e00000000000000000000000000007d33090000c00100dbf263248d000000000000000231000000000000000000000000019b310a00003a0000f361890c0100000000000000020600000000000000000000000000000000000000000000000000002e000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c80012000000eb00400500004c02ae00000003c80000000000eb00000000004c020000000001505fe1000101505fe100000000000018690900000f02006f5265240900000000000000023f000000000000000000000000016a470600008802003cdb870c010000000000000002080000000000000000000000000000000000000000000000000000002400000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000438011300000085001e000000c8000f00000006000800000004380100000000850000000000c80000000000060000000000000000000000a7500600006b0200a6a863240900000000000000022600000000000000000000000000caaf0900005501008630721e16000000000000000221000000000000000000000000008466070000200200baee65242600000000000000025000000000000000000000000000006ed1080000290200c0ee65240200000000000000024100000000000000000000000000d63b0a00001b00003a55a71f21000000000000000213000000000000000000000000001034090000d80100c37acd1f0100000000000000021b00000000000000000000000000bc1f060000090300218ab31f0200000000000000021d0000000000000000000000000000acef070000880200238ab31f0100000000000000021e00000000000000000000000000f0ca0500003d0200258ab31f0100000000000000021f000000000000000000000000009f2606000099020004e9ab1f1200000000000000021900000000000000000000000000efbb0900003f0100525896252000000000000000024b0000000000000000000000000000c5d8090000610100d41f9525040000000000000002290000000000000000000000000064a6080000720200d11f95252200000000000000023600000000000000000000000000903b0600003d02009c15a21f4000000000000000021000000000000000000000000001f7ee0900004c01009161890c010000000000000002070000000000000000000000000000000000000000000000000000002400000000040000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000001bc6d080000640200386f8c0c0100000000000000020900000000000000000000000000000000000000000000000000002e00000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000180000f00000001800000000000034038e10001f074e000016086e10001034038e10000f074e000006086e1000000000001e62c0a00005c0000028e9606010000000000000002020000000000000000000000000000000000000000000000000000460000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000042000d0020000050015000000010015000000c1003c01000004200000000000050000000000010000000000c10000000000000000000001ad67090000e60100760795060100000000000000020100000000000000000000000000000000000000000000000000000024000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000023e013c00000005000f000000023e010000000005000000000002a0edd500012097d9000102a0edd500002097d9000000000001bac60500007c0200018e960601000000000000000203000000000000000000000000000000000000000000000000000036000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000031a01940300003d0121000000260048000000031a01000000003d01000000002600000000000120cce500010120cce500000000000186b2090000150100e1219b060100000000000000020500000000000000000000000000000000000000000000000000003600000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000042600430000001a01770300009e00cc0600003e0140000000042600000000001a01000000009e00000000003e01000000000000000000004d00020000e4010064cfe8230100000000000000023a000000000000000000000000006b4408000047020082ac63241e00000000000000022d0000000000000000000000000013c2070000aa010001bc7a1e060000000000000002160000000000000000000000000021600a0000460000535896250a00000000000000024200000000000000000000000000009a4e040000150200d61f95250400000000000000023800000000000000000000000000eea20700003d02009fc7652401000000000000000240000000000000000000000000001fdf0700009002003928761e0100000000000000021100000000000000000000000000c27f050000660200a4bfa71e01000000000000000223000000000000000000000000000019be090000780100d9c5ab1f0200000000000000021500000000000000000000000000fe6d090000cd0100abc0671e0700000000000000020e00000000000000000000000000d6c9060000280200d51f95250a0000000000000002370000000000000000000000000002f9080000dd0100b92395250a0000000000000002390000000000000000000000000000a4df070000560200a7a8632401000000000000000227000000000000000000000000015ef20600009d020021f5871201000000000000000b170000000000000000000000000000000000000000000000000000280000001700000000000000000000030000000000000000000000000000000000000000015748070000700200bf697f1201000000000000000b0e000000000000000000000000010000000000000000000000000030000000000e03c17acd1fc10001c17acd1fc10001c17acd1f800002000000000000000000030000000000000000000000000000000000000000013111020000be020021f5871201000000000000000b18000000000000000000000000000000000000000000000000000028000000180000000000000000000003000000000000000000000000000000000000000001f66b0700001e02005f0f8b0c01000000000000000b0400000000000000000000000001000000000000000000000000002f000000040301e9ab1f80000201e9ab1f74000101e9ab1fc1000200000000000000000003000000000000000000000000000000000000000001d19e090000020200bf88890c01000000000000000b030000000000000000000000000001000000000000000000000000002f000000030301e9ab1fc1000201e9ab1f74000101e9ab1fc700020000000000000000000300000000000000000000000000000000000000000179db060000500100bf80930601000000000000000b01000000000000000000000000050000000000000000000000000037000000010401e9ab1f33010101e9ab1fc1000101e9ab1f68000101e9ab1f74000200000000000000000003000000000000000000000000000000000000000001d69c0700009302001838db0601000000000000000b02000000000000000000000000050000000000000000000000000039000000020401e9ab1f3d010201e9ab1fff000101e9ab1f68000201e9ab1f3301020000000000000000000300000000000000000000000000000000000000000161fa050000880200f1f0891201000000000000000b160000000000000000000000000000000000000000000000000000004100000016000000000000000000000300000000000000000000000000000000000000000196ac090000e800005ec9801201000000000000000b1000000000000000000000000005000000000000000000000000003e0000001004c17acd1fff0001c17acd1f800002c17acd1f330102c17acd1fff0001000000000000000000030000000000000000000000000000000000000000012ad3080000ff010051f0801201000000000000000b0f000000000000000000000000010000000000000000000000000031000000000f03c17acd1fc70001c17acd1f850002c17acd1fff0002000000000000000000030000000000000000000000000000000000000000011c19060000560200bf697f1201000000000000000b0d0000000000000000000000000100000000000000000000000000300000000d03c17acd1f740001c17acd1f680002c17acd1fc7000100000000000000000003000000000000000000000000000000000000000001986b090000e80100f66e8c0c01000000000000000b07000000000000000000000000050000000000000000000000000042000000070401e9ab1fc1000201e9ab1f33010201e9ab1f68000201e9ab1fc10001b27703000000190501030000000000000000000000000004c8000c000000290095000000800014000000c2001600000004c80000000000290000000000800000000000c20000000000000000000001d8730700008302009d1c8e0c01000000000000000b080000000000000000000000000001000000000000000000000000002e000000080301e9ab1fff000101e9ab1fff000201e9ab1f850002b27703000000190501030000000000000000000000000003290083000000800015000000c7003100000003290000000000800000000000c7000000000000000000000182c60500008d02001802880c01000000000000000b0600000000000000000000000001000000000000000000000000002c000000060301e9ab1fff000201e9ab1fc1000101e9ab1fc10002b2770300000019050103000000000000000000000000000285001c000000c7003a00000002850000000000c7000000000001f0ced1000101f0ced1000000000001a35308000018020081357c1201000000000000000b0a0000000000000000000000000700000000000000000000000000440000000a04c17acd1f800002c17acd1fc10002c17acd1f680002c17acd1f740001b27703000000190501030000000000000000000000000004ff001a00000038011a000000c2002d00000001000800000004ff0000000000380100000000c2000000000001000000000000000000000157350a00005000003126d40c01000000000000000b1100000000000000000000000000000000000000000000000000000041000000110000000000000000000003000000000000000000000000000000000000000001392a080000e501004ba38f0c01000000000000000b1300000000000000000000000000000000000000000000000000002a0000001303000000000000000000000000000000000000000000b2770300000019050103000000000000000000000000000380000e00000006000e00000004000d0000000380000000000006000000000004000000000000000000000160eb0600003302007654860c01000000000000000b0500000000000000000000000000000000000000000000000000003600000000050400000000000000000000000000000000000000000000000000000000b27703000000190501030000000000000000000000000004ff0019000000850027000000c80014000000aa011d01000004ff0000000000850000000000c80000000000aa0100000000000000000001c0de0800007d010024bc7d1201000000000000000b0c0000000000000000000000000a00000000000000000000000000560000000c04c17acd1f740001c17acd1f800002c17acd1f3d0101c17acd1f680002b277030000001905010300000000000000000000000000042a01b65a00003301f4000000c2002d00000085002c000000042a0100000000330100000000c20000000000850000000000000000000001a7ac070000b2020024bc7d1201000000000000000b0b0000000000000000000000000a00000000000000000000000000560000000b04c17acd1fff0001c17acd1fc10001c17acd1fc70002c17acd1f800002b27703000000190501030000000000000000000000000003ff001a0000008000210000002a014163000003ff00000000008000000000002a010000000001306bd2000101306bd20000000000009558090000d30100e2b5793101000000000000000e00000000000000000000000000000034f1090000210100e3b5793101000000000000000e00000000000000000000000000020811000000")));
        assert_eq!(items.len(), 184);
        let count = |s: u8| items.iter().filter(|i| i.storage == s).count();
        assert_eq!([count(1), count(2), count(11), count(14), count(15)], [71, 91, 20, 2, 0]);
        assert!(items.iter().any(|i| (i.storage, i.item, i.amount) == (1, 930100031, 4_472_019)));
        // What she wears, as the game shows it: the dagger +5 in slot 1, with its four Lesser
        // Manastones; the earrings +10; the necklace +7; the belt, never enchanted.
        let worn = |slot: u8| items.iter().find(|i| i.storage == 11 && i.slot == slot).unwrap();
        assert_eq!((worn(1).enchant, worn(1).stones.iter().map(|s| s.0).collect::<Vec<_>>()), (5, vec![531360001; 4]));
        assert_eq!([worn(11).enchant, worn(12).enchant, worn(10).enchant, worn(17).enchant, worn(3).enchant], [10, 10, 7, 0, 1]);
        // The owner's 2026-11-23 login as Nayoul: his Aulamus Bow +10, item level 91 (70 + 21), its
        // Superior Manastones Attack +10, +3, +5 and HP +50 (ranks 3, 1, 2, 1), its soul binding HP 308,
        // Combat Speed 9.72%, Critical Hit 51, as the game's window shows them; his Vakron Greaves too
        // (a zero more before their slot).
        let his = depot(&frame(OP_ITEM_LIST, &hex("10029002002f3d090000c40100a1ed981f420000000000000001190000000000000000000000000000a7bb0700003c02002455a71f3900000000000000012b00000000000000000000000000528b090000cc01003b55a71f2800000000000000012e000000000000000000000000007d1d0a00005100002355a71f3c000000000000000129000000000000000000000000001da60500008b02003733703733430400000000000106000000000000000000000000000050b70900007d0100a6ed981fdd00000000000000011600000000000000000000000000b5cf070000460200d162991f0e000000000000000115000000000000000000000000009e390a00002a00003f3370378ca2830000000000010000000000000000000000000000209b090000df0100c2da9925e8030000000000000143000000000000000000000000000060d4090000490100418ee91f8902000000000000012700000000000000000000000000ad1a090000f501000181e61f2d0000000000000001260000000000000000000000000002db060000ec02002b337037db10000000000000010200000000000000000000000000303e0a0000300000233370377bed09000000000001010000000000000000000000000000b5960500000d020023c59a25060000000000000001550000000000000000000000000014e10900007b010040da051e2900000000000000013c000000000088dd7da201000000bb7c090000e50100b514991f4f00000000000000011b00000000000000000000000000172c0700009002006107aa25600400000000000001560000000000000000000000000000693b0a00004500007318a81f100000000000000001140000000000000000000000000006c70700007a0200a27db3252f01000000000000014d000000000000000000000000002cc60900005c0100aaed981f1500000000000000011a0000000000000000000000000011a9060000b302003333703778af000000000000010700000000000088dd7da201000001b0e5060000250200123f8a120100000000000000011200000000000000000000000000000000000000000000000000000d000000000000000000000000000003000000000000000000000000000000000000000000063b0a0000450000e09dcf1f02000000000000000120000000000000000000000000008224050000110200c145c11f7c000000000000000135000000000000000000000000000015de080000bb0100313370379862000000000000010400000000000000000000000000d56e090000b301003a56b3250b00000000000000014e000000000000000000000000009ff109000070010026f4cb1f409c000000000000013800000000000000000000000000fed108000097010044da051e09000000000000000140000000000088dd7da201000000009d300a00002e0000b314991f0b000000000000000117000000000000000000000000018bcb070000660200f861890c0100000000000000010a0000000000000000000000000a000000000000000000000000003d000000000401e9ab1fc1000101e9ab1f85000101e9ab1fc7000101e9ab1f740002146303000000190501030000000000000000000000000004bb019d000000c700430000003801100000003301a800000004bb0100000000c700000000003801000000003301000000000000000000003f050a00001701002d3370371f0000000000000001030000000000000000000000000044110a0000a20000a133b71f0300000000000000013a0000000000000000000000000000d399080000580200aeed981f0f00000000000000011d0000000000000000000000000031d7060000b80200a9ed981f0500000000000000011e00000000000000000000000000fcb2090000570100a5ed981f1600000000000000011c0000000000000000000000000098150800007802003fda051e2100000000000000013b00000000000088dd7da2010000007d8e08000046020043da051e0800000000000000013f000000000088dd7da20100000068e40800008a010041da051e0f00000000000000013d000000000088dd7da201000000fae4060000400200e192b2250d0000000000000001570000000000000000000000000016030a00002e010071da051e050000000000000001390000000a008099a67da20100000017e809000031010042da051e0b00000000000000013e000000008099a67da2010000001175090000e50100b414991f1e00000000000000011800000000000000000000000000260f090000de010021f4cb1fa00f000000000000013700000000000000000000000000e6170a00003900003928761e0f0000000000000001280000002000000000000000000000d76f090000c101003a55a71f5500000000000000012d00000000000000000000000000dc9d0800004302004482f71d1e000000000000000134000000008099a67da201000000230b0a0000c200003c55a71f1600000000000000012f00000000000000000000000000a69a070000120200c2da99252a0200000000000001440000002000000000000000000000a748080000c1010001b49f1f9703000000000000013000000000000000000000000000954d0900006001007c56b3250200000000000000014f000000008099a67da201000000cd3d0800006d020001bc7a1e020000000000000001310000000000000000000000000032c4020000ad020042f2ea2301000000000000000158000000aa008099a67da201000000a55809000005020030b6ba1f0a000000000000000121000000008099a67da2010000002392060000cf020040ddba1f0a000000000000000122000000008099a67da2010000001f2d0a00002900004a04bb1f0a000000000000000123000000008099a67da201000000352c0900006101008c2bbb1f0a00000000000000012500000002008099a67da20100000128e20900005301001d6f8c0c0100000000000000010d000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000004040009000000c100580000003e011800000006000a00000004040000000000c100000000003e01000000000600000000000000000000013b12040000e602001d6f8c0c0100000000000000010e00000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000406000c0000003e0113000000800014000000630081000000040600000000003e010000000080000000000063000000000000000000000138b8080000330200d78d960601000000000000000108000000000000000000000000000000000000000000000000000000290000000004000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000003c5060000b702000eadb51f010000000000000001410000000000000000000000000085ba0900006401002f55a71f1300000000000000012a00000000000000000000000000c3b80700008d02003055a71f1300000000000000012c00000000000000000000000000005447090000760100f152fc1f0c00000000000000011300000000000000000000000000cb78040000a102006e3cb6251400000000000000015900000000000000000000000000a621080000690200353370370300000000000000010500000000000000000000000000364808000069020069399021010000000000000001360000000055f6ae8ba201000004005a1a060000fc01008a2bbb1f0c000000000000000124000000008099a67da2010000005c94090000870100b9f663240a00000000000000014b00000000000000000000000000024e080000810200dbf263240e00000000000000014900000000000000000000000000e035090000e50100baf663240e00000000000000014c00000000000000000000000000000d72050000cc0200def263241500000000000000014a0000000000000000000000000148e90500009b0200d66e8c0c0100000000000000010c00000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000001c37a0600007e0200157c8f0c01000000000000000111000000000000000000000000000000000000000000000000000024000000000004000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000030e80900005f0100d1f263246500000000000000014800000000000000000000000000c9d20700008002005d2b652479000000000000000154000000000000000000000000005d850200002403005e2b65243400000000000000015200000000000000000000000000516b060000c70100c480a825270000000000000001420000000000000000000000000000d84b0a0000380000c17acd1f1100000000000000013300000000000000000000000000feae09000040010001e9ab1f0f00000000000000013200000000000000000000000000e367090000a601005358962503000000000000000151000000000000000000000000007a090a0000d4000052589625030000000000000001530000000000000000000000000400c7d60100008e02005ada051e0100000000000000011f000000008099a67da2010000009f71090000a601005f2b65240800000000000000015000000000000000000000000000ad93090000b30100d5f263240b00000000000000014700000000000000000000000001b34c0900006501005d7c8f0c0100000000000000011000000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c8000b0000004c028a00000033018300000003c800000000004c0200000000330100000000013011e10001013011e10000000000018f63020000a60200c461890c01000000000000000109000000000000000000000000000000000000000000000000000046000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000002c800130000006300cf00000002c80000000000630000000000024038e1000110c3e00001024038e1000010c3e00000000000007d9a050000380200b146cc2306000000000000000146000000000000000000000000018f6603000028020024db870c0100000000000000010b00000000000000000000000000000000000000000000000000000046000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003850027000000040010000000c7005800000003850000000000040000000000c70000000000014038e10001014038e100000000000178b4080000340200447c8f0c0100000000000000010f00000000000000000000000000000000000000000000000000004600000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000302000f00000006000f00000004000e0000000302000000000006000000000004000000000001f074e0000101f074e00000000000003392090000e80100a6a86324010000000000000001450000000000000000000000000120b00800007a02003438db060100000000000000015b000000000000000000000000000000000000000000000000000000240000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000034b022e0000002000d10100009200e1010000034b02000000002000000000009200000000000190a8da00010190a8da0000000000013b510a00002b000022dc96060100000000000000015e000000000000000000000000000000000000000000000000000014000000000200000000000000000000000000001463030000001905010300000000000000000000000000026200230000003d0110000000026200000000003d01000000000000000000006ace040000570200d1b77c1e0300000000000000015a000000000000000000000000009f480a0000460000d8f263240200000000000000015f00000000000000000000000000019465090000d90100d8f58d0c0100000000000000015d00000000000000000000000000000000000000000000000000002e0000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000033e011d00000085001f000000040009000000033e01000000008500000000000400000000000110c3e000010110c3e0000000000000a84b0a0000560000602b6524020000000000000001600000000000000000000000000030d20900006a0100ec3c662410000000000000000255000000000000000000000000002825090000ce0100c3ee65240100000000000000023d0000000000000000000000000000185d0a0000560000ed3c66247001000000000000025600000000000000000000000000096b0700005e0200f1b1662454000000000000000235000000000000000000000000005b2d0a00004f00006e52652462000000000000000244000000000000000000000000009c75090000bc0100dd15662438000000000000000249000000000000000000000000000030c0050000640200ef3c66247a000000000000000257000000000000000000000000008baa030000110300f03c66242b00000000000000025800000000000000000000000000fb37070000450200705265240900000000000000023c0000000000000000000000000016ed080000a80100eb3c6624720000000000000002540000000000000000000000000000179e0800006602003955a71f1400000000000000021200000000000000000000000000e6310a00005f0000bcee6524110000000000000002460000000000000000000000000099780400008902007318a81f2000000000000000020d00000000000000000000000000f6c0090000510100bdee65240a0000000000000002470000000000000000000000000000ddd40400001f02003c55a71f160000000000000002140000000000000000000000000086830700006002009bc765240e00000000000000024e0000000000000000000000000195c4090000040100d780930601000000000000000200000000000000000000000000000000000000000000000000000029000000000004000000000000000000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000034b023a0000003e0137000000010012000000034b02000000003e0100000000010000000000019020c70001019020c700000000000165ba0200007302001ab596060100000000000000020400000000000000000000000000000000000000000000000000001700000000030000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000029200e701000062002e00000002920000000000620000000000015041e60001015041e6000000000000233b070000330200a5a863240400000000000000022500000000000000000000000000b46b0900006e0100f33c66240500000000000000025900000000000000000000000001d983040000950200bcf58d0c0100000000000000020b000000000000000000000000000000000000000000000000000000240000000004000000000000000000000000000000000000000000000000000000002a1a030000001905010300000000000000000000000000039f006c010000020010000000c8000d000000039f0000000000020000000000c8000000000001c0620e010101c0620e0100000000006b1d0a0000360000519fc91e0900000000000000020c00000000000000000000000000c70f060000740200c47acd1f0900000000000000021c0000000000000000000000000017160a00005100005d2b6524490a000000000000024c0000000000000000000000000000403e0900006c01008363a21f1e00000000000000020f0000000000000000000000000008ac0600001a02005e2b6524cb02000000000000024300000000000000000000000000f7eb090000010100515896257300000000000000025a0000000000000000000000000053e2080000a001005f2b65247800000000000000023e0000000000000000000000000000f0130a00006c00008730721e0e0000000000000002220000000000000000000000000014480a00005b0000bbee65243900000000000000025100000000000000000000000000a772090000550100b9ee65243500000000000000024f00000000000000000000000000bd5d060000bc0200b146cc237600000000000000022a00000000000000000000000000001eb2070000700200daf263240a00000000000000022800000000000000000000000000a1300a00003f0000d1b77c1e5b0000000000000002200000000000000000000000000094560400003a0200c480a82540030000000000000224000000000000000000000000005d36090000f70100beee652413000000000000000248000000000000000000000000000054550a00002f0000d9156624df000000000000000252000000000000000000000000009f11090000690100def263249c01000000000000023200000000000000000000000000f13e090000b00100baf663246300000000000000023400000000000000000000000000f6e7090000ff00006d526524c400000000000000024d00000000000000000000000000000aee090000160100da15662421000000000000000253000000000000000000000000001c7f090000d00100de1566240c00000000000000024a00000000000000000000000000a6860800002b0200c17acd1fdb00000000000000021a0000000000000000000000000075f309000015010003e9ab1f160000000000000002180000000000000000000000000000103f0a00005e000001e9ab1fa70000000000000002170000000000000000000000000071e1070000350200602b65240d00000000000000023b00000000000000000000000000580c0a0000a70000b9f6632461000000000000000233000000000000000000000000004242040000ed0200d31f95251300000000000000022c000000000000000000000000000062e3010000520200d21f95252c00000000000000022f000000000000000000000000005a3d0500007c02009dc7652403000000000000000245000000000000000000000000003e080a00009c0000d1f263249b04000000000000023000000000000000000000000001e3740800000f02001d6f8c0c0100000000000000020a00000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000002ff000b00000085001500000002ff000000000085000000000002505fe1000110c3e0000102505fe1000010c3e000000000000077e7080000b70100d8f263241500000000000000022b00000000000000000000000000c0100a0000930000d5f263249b00000000000000022e000000000000000000000000001861070000fe0100dbf263248d00000000000000023100000000000000000000000001907c080000600200f361890c010000000000000002060000000000000000000000000000000000000000000000000000002e000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c80012000000eb00400500004c02ae00000003c80000000000eb00000000004c020000000001505fe1000101505fe1000000000000fa760700001502006f5265240900000000000000023f00000000000000000000000001f9840700009102003cdb870c0100000000000000020800000000000000000000000000000000000000000000000000002400000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000438011300000085001e000000c8000f00000006000800000004380100000000850000000000c80000000000060000000000000000000000eccf080000b50100a6a863240d000000000000000226000000000000000000000000000022280700001302008630721e1600000000000000022100000000000000000000000000aa6b0900008c0100baee65242600000000000000025000000000000000000000000000d395080000f00100c0ee6524020000000000000002410000000000000000000000000074600600009e02003a55a71f210000000000000002130000000000000000000000000000f2cc020000620200c37acd1f0100000000000000021b000000000000000000000000008ddc0800000c0200218ab31f0200000000000000021d0000000000000000000000000049d80600003f0200238ab31f0100000000000000021e00000000000000000000000000085d070000120200258ab31f0100000000000000021f00000000000000000000000000000190080000e3010004e9ab1f120000000000000002190000000000000000000000000065a6090000a70100525896252000000000000000024b00000000000000000000000000e70f0a0000b30000d41f95250400000000000000022900000000000000000000000000ec3e090000d40100d11f952522000000000000000236000000000000000000000000000081b40600008502009c15a21f40000000000000000210000000000000000000000000017aef0900004701009161890c01000000000000000207000000000000000000000000000000000000000000000000000024000000000400000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000016fb1070000ff0100386f8c0c010000000000000002090000000000000000000000000000000000000000000000000000002e00000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000180000f00000001800000000000034038e10001f074e000016086e10001034038e10000f074e000006086e1000000000001a02a070000020200028e9606010000000000000002020000000000000000000000000000000000000000000000000000460000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000042000d0020000050015000000010015000000c1003c01000004200000000000050000000000010000000000c10000000000000000000001a0020600006502007607950601000000000000000201000000000000000000000000000000000000000000000000000024000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000023e013c00000005000f000000023e010000000005000000000002a0edd500012097d9000102a0edd500002097d9000000000001a5fd060000010200018e96060100000000000000020300000000000000000000000000000000000000000000000000000036000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000031a01940300003d0121000000260048000000031a01000000003d01000000002600000000000120cce500010120cce5000000000001b66d090000d10100e1219b0601000000000000000205000000000000000000000000000000000000000000000000000036000000000400000000000000000000000000000000000000000000000000000000b277030000001905010300000000000000000000000000042600430000001a01770300009e00cc0600003e0140000000042600000000001a01000000009e00000000003e01000000000000000000002f4f08000016020064cfe8230100000000000000023a000000000000000000000000001f42080000d4020082ac63241e00000000000000022d000000000000000000000000000042e3080000ee010001bc7a1e0600000000000000021600000000000000000000000000f10b0600008c0200535896250a00000000000000024200000000000000000000000000df00070000820200d61f9525040000000000000002380000000000000000000000000095b50900005f01009fc765240100000000000000024000000000000000000000000000000fb30700008e02003928761e01000000000000000211000000000000000000000000005413080000260200a4bfa71e01000000000000000223000000000000000000000000006235080000200200d9c5ab1f020000000000000002150000000000000000000000000012510900009d0100abc0671e0700000000000000020e00000000000000000000000000009f74070000eb0200d51f95250a000000000000000237000000000000000000000000001ebf090000360100b92395250a000000000000000239000000000000000000000000002810090000f90100a7a8632401000000000000000227000000000000000000000000000785080000c50100e192b22504000000000000000f0a00000000000000000000000000008b110900001f02003928761e01000000000000000f000000000000000000000000000009eb0900002401003a55a71f0a000000000000000f0400000000000000000000000000599b090000a701003955a71f0a000000000000000f0100000000000000000000000000c0b90900005801003055a71f0a000000000000000f030000000000000000000000000000d02b090000840100d16bb22501000000000000000f090000000000000000000000000017ee0800006b01002f55a71f0a000000000000000f0200000000000000000000000000632a0800002b02003c55a71f0a000000000000000f05000000000000000000000000002bf00900003d0100258ab31f01000000000000000f0700000000000000000000000000001006050000980200238ab31f01000000000000000f06000000000000000000000000011b3b0a00004a000023bc7d1201000000000000000f100000000000000000000000000700000000000000000000000000430000000004c17acd1f850001c17acd1fc70001c17acd1f800002c17acd1fc70002146303000000190501030000000000000000000000000004c700550000002a01a958000080001e0000003d011200000004c700000000002a01000000008000000000003d010000000000000000000114e9080000cf01006107950601000000000000000f15000000000000000000000000000a000000000000000000000000004a000000000401e9ab1f80000201e9ab1fff000201e9ab1fc7000201e9ab1f80000114630300000019050203bb69300100000000000000000004620048000000c700a40000003d01230000001a01b903000004620000000000c700000000003d01000000001a0100000000000000000001bfdc0500009802007654860c01000000000000000f19000000000000000000000000050000000000000000000000000041000000000401e9ab1fc1000101e9ab1f74000101e9ab1f74000201e9ab1fc70002146303000000190501030000000000000000000000000003bc01df00000085002c000000c2002700000003bc0100000000850000000000c200000000000170ade100010170ade1000000000000af500a00004b000071da051e01000000000000000f08000000000088dd7da2010000015303090000df010057db870c01000000000000000f0f0000000000000000000000000007000000000000000000000000003b000000000401e9ab1f74000101e9ab1fff000101e9ab1f3d010201e9ab1f800002146303000000190501030000000000000000000000000004c7004c0000006300c300000002000c000000c1009000000004c70000000000630000000000020000000000c100000000000000000000014154080000550200bcf58d0c01000000000000000f18000000000000000000000000000000000000000000000000000024000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c8000f000000c2001c0000003d010b00000003c80000000000c200000000003d010000000001f074e0000101f074e00000000000011923090000640100f6219b0601000000000000000f170000000000000000000000000000000000000000000000000000240000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000023d011a00000062003f000000023d0100000000620000000000025015170101c044130101025015170100c044130100000000015e5d090000780100178e960601000000000000000f1b0000000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000014630300000019050103000000000000000000000000000426003a0000009e00310600003d011d0000003e0137000000042600000000009e00000000003d01000000003e01000000000000000000011e14090000070200fbda870c01000000000000000f0e000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000018de7080000d701005d7c8f0c01000000000000000f1600000000000000000000000000000000000000000000000000002900000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c200170000008500170000004c029100000003c200000000008500000000004c020000000001f074e0000101f074e0000000000001f91b090000a301009773900601000000000000000f1a000000000000000000000000000000000000000000000000000029000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c7007c0000009e003e060000ff002100000003c700000000009e0000000000ff00000000000100e6aa00010100e6aa000000000001c2ac040000460200dc61890c01000000000000000f14000000000000000000000000000000000000000000000000000024000000000400000000000000000000000000000000000000000000000000000000146303000000190501030000000000000000000000000003c2001e000000bb017d00000033019d00000003c20000000000bb0100000000330100000000016086e10001016086e10000000000015e7e0500003902003207950601000000000000000f11000000000000000000000000000000000000000000000000000000240000000004000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000165be080000150200d38d960601000000000000000f0b00000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000001cc5b0a00005c000024db870c01000000000000000f0c0000000000000000000000000000000000000000000000000000460000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000039f007d020000850028000000c2002b000000039f0000000000850000000000c200000000000170ade100010170ade10000000000013856070000ba02005b73900601000000000000000f0d0000000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000001061e0800002a02001b7c8f0c01000000000000000f1300000000000000000000000000000000000000000000000000002900000000040000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000001c0f2080000ea0100f6219b0601000000000000000f12000000000000000000000000000000000000000000000000000024000000000004000000000000000000000000000000000000000000000000000000001463030000001905010300000000000000000000000000039200360200000100140000006200390000000392000000000001000000000062000000000001501517010101501517010000000001ad480a000052000021f5871201000000000000000b17000000000000000000000000010000000000000000000000000029000000170000000000000000000003000000000000000000000000000000000000000001a3750800008602001838db0601000000000000000b02000000000000000000000000070000000000000000000000000038000000020401e9ab1f85000101e9ab1f3d010101e9ab1f80000101e9ab1fff0001000000000000000000030000000000000000000000000000000000000000010b20070000ad02005ec9801201000000000000000b100000000000000000000000000007000000000000000000000000003f0000001004c17acd1f3d0102c17acd1fff0001c17acd1fc70001c17acd1fc10001000000000000000000030000000000000000000000000000000000000000013ae909000036010021f5871201000000000000000b18000000000000000000000000010000000000000000000000000029000000180000000000000000000003000000000000000000000000000000000000000001b7f8080000fc010051f0801201000000000000000b0f0000000000000000000000000900000000000000000000000000390000000f03c17acd1fff0001c17acd1fc70002c17acd1f74000200000000000000000003000000000000000000000000000000000000000001bc240900000d02007f5c7c1201000000000000000b0a000000000000000000000000000900000000000000000000000000380000000a03c17acd1f740001c17acd1f800002c17acd1f74000100000000000000000003000000000000000000000000000000000000000001a1300800008c0200f1f0891201000000000000000b160000000000000000000000000a000000000000000000000000004b000000160000000000000000000003000000000000000000000000000000000000000001581a040000ae02003126d40c01000000000000000b110000000000000000000000000a000000000000000000000000004b0000000011000000000000000000000300000000000000000000000000000000000000000105f00700009f020096f58d0c01000000000000000b08000000000000000000000000070000000000000000000000000043000000080401e9ab1f80000101e9ab1f68000201e9ab1f33010101e9ab1f3d01021463030000001905010300000000000000000000000000043d010d000000c2001f0000000200150000006300a7000000043d0100000000c200000000000200000000006300000000000000000000016323060000cd020058bc7d1201000000000000000b0c0000000000000000000000000a00000000000000000000000000550000000c04c17acd1f800002c17acd1f800001c17acd1fc10001c17acd1f68000114630300000019050103000000000000000000000000000185002f0000000185000000000003505fe1000120eae000016086e1000103505fe1000020eae000006086e10000000000018f520a00003a0000f66e8c0c01000000000000000b0700000000000000000000000000070000000000000000000000000044000000070401e9ab1f3d010201e9ab1fc1000101e9ab1fff000201e9ab1fff00021463030000001905010300000000000000000000000000029f0048010000c1006c000000029f0000000000c100000000000210c3e00001505fe100010210c3e00000505fe1000000000001ea85080000350200b554860c01000000000000000b050000000000000000000000000a0000000000000000000000000056000000050401e9ab1f3d010101e9ab1f33010201e9ab1fc1000201e9ab1f8500011463030000001905020300000000000000000000000000044c02030100004a00dc0200003301fb00000038011a000000044c02000000004a0000000000330100000000380100000000000000000001cd1b080000600200447c8f0c01000000000000000b130000000000000000000000000a0000000000000000000000000057000000130401e9ab1f33010201e9ab1f85000101e9ab1f85000201e9ab1fc10002146303000000190501030000000000000000000000000004c10085000000ff00120000003801110000006300a400000004c10000000000ff00000000003801000000006300000000000000000000011492090000000200c4427f1201000000000000000b0e000000000000000000000000000a00000000000000000000000000570000000e04c17acd1f3d0102c17acd1fc10002c17acd1fff0002c17acd1fc10001146303000000190501030000000000000000000000000003c100a50000003e012b000000c7004c00000003c100000000003e0100000000c7000000000001509bd7000101509bd70000000000016dcd080000eb010024bc7d1201000000000000000b0b0000000000000000000000000c00000000000000000000000000580000000b04c17acd1f3d0102c17acd1f850001c17acd1f680002c17acd1f850001146303000000190501030000000000000000000000000003c7005d000000c8001b0000002a01b65a000003c70000000000c800000000002a010000000001009ce0000101009ce000000000000177fa07000080020024db870c01000000000000000b060000000000000000000000000a000000000000000000000000005600000000060401e9ab1f33010101e9ab1f68000101e9ab1f3d010201e9ab1f8000021463030000001905010300000000000000000000000000034c02e80000003801170000002900e4000000034c02000000003801000000002900000000000110c3e000010110c3e00000000000010286080000910200c4427f1201000000000000000b0d0000000000000000000000000a00000000000000000000000000570000000d04c17acd1f3d0101c17acd1f800002c17acd1f800002c17acd1fc10002146303000000190501030000000000000000000000000003c7004c0000003301c80000003e012400000003c700000000003301000000003e010000000001a0cfda000101a0cfda000000000001fb4d0700007302006207950601000000000000000b010000000000000000000000000a000000000000000000000000005b000000010404e9ab1f3d010304e9ab1f3d010104e9ab1fc1000104e9ab1f3d0102146303000000190501030000000000000000000000000003c100340100001a01cc03000080003300000003c100000000001a010000000080000000000001a0cfda000101a0cfda00000000000148c0070000c20200c461890c01000000000000000b03000000000000000000000000000a0000000000000000000000000058000000030401e9ab1f80000201e9ab1f3d010201e9ab1fff000201e9ab1fff0002146303000000190501030000000000000000000000000003ff001a0000002900cf000000c7004e00000003ff0000000000290000000000c7000000000001f074e0000101f074e000000000000119240900009f0100116f4b3001000000000000000b2a0000000000000000000000000000000000000000000000000000280000002a0000000000000000000003000000000000000000000000010a000c000000000002a0cfda0001509bd7000102a0cfda0000509bd700000000000194f60700004f0200e1db4f3001000000000000000b2d00000000000000000000000000000000000000000000000000003c0000002d00000000000000000000030000000000000000000000000109001000000000000320eae00001009ce000014038e100010320eae00000009ce000004038e1000000000001aa9806000024020041554e3001000000000000000b2c0000000000000000000000000000000000000000000000000000003c0000002c00000000000000000000030000000000000000000000000107001000000000000310c3e000013011e10001f074e000010310c3e000003011e10000f074e0000000000001c286080000030200b1f54c3001000000000000000b2b00000000000000000000000003000000000000000000000000002b0000002b00000000000000000000030000000000000000000000000108000f0000000000042097d90001304dd7000190c6d5000110ffd60001042097d90001304dd7000090c6d5000010ffd6000000000001d6aa090000300100519a493001000000000000000b2900000000000000000000000001000000000000000000000000005100000000290000000000000000000003000000000000000000000000010b001500000000000490c6d500019037d800013011e1000110c3e000010490c6d500019037d800003011e1000010c3e000000000000119ed040000e6020064e88a0c01000000000000000b040000000000000000000000000a0000000000000000000000000056000000040401e9ab1f74000101e9ab1f80000201e9ab1f33010201e9ab1f800001146303000000190501030000000000000000000000000002c70040000000ff001500000002c70000000000ff00000000000270ade10001009ce000010270ade10000009ce0000000000000cae90700004d0200e2b5793101000000000000000e0000000000000000000000000001d263080000840200527c4e3001000000000000000e0000000000000000000000000000000000000000000000000000002800000000000000000000000000000003000000000000000000000000010d000c000000000002505fe1000110c3e0000102505fe1000010c3e0000000000001df5a090000f50100c11c4d3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010800080000000000012097d90001012097d9000000000001959b0800005a0200810f4a3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010b00080000000000013011e10001013011e1000000000001402e090000530100810f4a3001000000000000000e0000000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010b0008000000000001f074e0000101f074e0000000000001ecea060000810200012a503001000000000000000e000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000109000800000000000180d4e100010180d4e1000000000001d434090000dc010061a34e3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010700080000000000013011e10001013011e1000000000001b8ab070000690200b2f54c3001000000000000000e0000000000000000000000000000000000000000000000000000000028000000000000000000000000000003000000000000000000000000010e000c0000000000022097d9000110ffd60001022097d9000010ffd6000000000001d0c3080000b20200810f4a3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010b000800000000000180d4e100010180d4e10000000000017dc0060000720200c11c4d3001000000000000000e0000000000000000000000000000000000000000000000000000001400000000000000000000000000000003000000000000000000000000010800080000000000012097d90001012097d900000000000102e70900002b0100c11c4d3001000000000000000e000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000108000800000000000190c6d500010190c6d500000000000059b1080000020200e1b579310b000000000000000e0000000000000000000000000001c177080000fd0100e2db4f3001000000000000000e0000000000000000000000000000000000000000000000000000003c00000000000000000000000000000003000000000000000000000000010f00100000000000036086e1000120eae000014038e10001036086e1000020eae000004038e10000000000011573090000810100f102503001000000000000000e000000000000000000000000000000000000000000000000000000280000000000000000000000000000030000000000000000000000000109000c0000000000024038e10001009ce00001024038e10000009ce00000000000012a24090000e90100810f4a3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010b0008000000000001509bd7000101509bd700000000000154880500008b0200810f4a3001000000000000000e0000000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010b00080000000000019037d80001019037d80000000000018808090000b2010071e8493001000000000000000e00000000000000000000000000000000000000000000000000000028000000000000000000000000000003000000000000000000000000010b000c000000000002f074e000014038e1000102f074e000004038e1000000000001c2c8080000320200022a503001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010f000800000000000180d4e100010180d4e1000000000001be80090000d70100012a503001000000000000000e00000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000109000800000000000180d4e100010180d4e1000000000001aa29060000ab0200012a503001000000000000000e000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000109000800000000000180d4e100010180d4e10000000000015279090000db0100116f4b3001000000000000000e0000000000000000000000000000000000000000000000000000002800000000000000000000000000000003000000000000000000000000010a000c000000000002509bd70001a0cfda000102509bd70000a0cfda0000000000011e7b0600004c0200126f4b3001000000000000000e000000000000000000000000000000000000000000000000000000280000000000000000000000000000030000000000000000000000000110000c000000000002a0cfda0001509bd7000102a0cfda0000509bd700000000000139190700002c0200527c4e3001000000000000000e00000000000000000000000000000000000000000000000000000028000000000000000000000000000003000000000000000000000000010d000c0000000000023011e10001f074e00001023011e10000f074e00000000000018947090000ee010062a34e3001000000000000000e0000000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010d00080000000000013011e10001013011e1000000000001f31f050000ba020062a34e3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010d0008000000000001f074e0000101f074e0000000000001890007000076020062a34e3001000000000000000e00000000000000000000000000000000000000000000000000000014000000000000000000000000000003000000000000000000000000010d0008000000000001f074e0000101f074e00000000000010b2f0500000e020072e8493001000000000000000e00000000000000000000000000000000000000000000000000000000280000000000000000000000000000030000000000000000000000000111000c00000000000220eae0000190a8da00010220eae0000090a8da000000000001b23704000037020061a34e3001000000000000000e000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000107000800000000000110c3e000010110c3e0000000000001751709000046010061a34e3001000000000000000e0000000000000000000000000000000000000000000000000000001400000000000000000000000000000003000000000000000000000000010700080000000000013011e10001013011e10000000000010d8d050000a4020061a34e3001000000000000000e000000000000000000000000000000000000000000000000000000140000000000000000000000000000030000000000000000000000000107000800000000000170ade100010170ade100000000000122e9080000ea010071e8493001000000000000000e00000000000000000000000000000000000000000000000000000028000000000000000000000000000003000000000000000000000000010b000c00000000000200d8d6000120eae000010200d8d6000020eae000000000000189590a0000380000b1f54c3001000000000000000e000000000000000000000000000003000000000000000000000000002b0000000000000000000000000000030000000000000000000000000108000f000000000004304dd700012097d90001f0b0d6000190a8da000104304dd700002097d90000f0b0d6000190a8da0000000000020a11000b00")));
        let bow = his.iter().find(|i| i.storage == 11 && i.slot == 1).unwrap();
        assert_eq!((bow.enchant, bow.level), (10, 91));
        assert_eq!(bow.stones, vec![(531360004, 0x13D, 3), (531360004, 0x13D, 1), (531360004, 0xC1, 1), (531360004, 0x13D, 2)]);
        assert_eq!(bow.soul, vec![(0xC1, 308), (0x11A, 972), (0x80, 51)]);
        assert_eq!((bow.skills.clone(), bow.theostone), (vec![(14_340_000, 1)], 0));
        // His Rupture Longbow, in his own warehouse: Theostone: Zikel's Vestige engraved.
        let longbow = his.iter().find(|i| i.storage == 15 && i.item == 110430049).unwrap();
        assert_eq!((longbow.enchant, longbow.level, longbow.stones.len(), longbow.theostone), (10, 74, 4, 19_950_011));
        // His Chalice of Vigor, an Arcana worn in slot 41: +1, item level 81 (80 + 1), Time [Siel] 21,
        // four skills (Wind Vigor 14730000 among them).
        let chalice = his.iter().find(|i| i.storage == 11 && i.slot == 41).unwrap();
        assert_eq!((chalice.enchant, chalice.level, chalice.stats.clone()), (1, 81, vec![(0x0B, 21)]));
        assert_eq!(chalice.skills.len(), 4);
        assert!(chalice.skills.contains(&(14_730_000, 1)));
        assert!(chalice.skills.contains(&(14_010_000, 2)), "Deadshot +2");
        let greaves = his.iter().find(|i| i.storage == 11 && i.slot == 6).unwrap();
        assert_eq!((greaves.enchant, greaves.stones.len(), greaves.soul.len()), (10, 4, 3));
        // Her two Arcana, both in slot 0, each its own uid.
        let arcana: Vec<u32> = items.iter().filter(|i| i.storage == 14).map(|i| i.uid).collect();
        assert_eq!(arcana.len(), 2);
        assert_ne!(arcana[0], arcana[1]);
        // The owner's 2026-11-23 transfer of Lucky Auras to Nayel's own warehouse: slots 0 and 1 there.
        let moved = item_slots(&frame(OP_ITEM, &hex("0201005c18080000fb0100e192b22509000000000000000f00000000000000000000000000000000000100cd77060000690200d16bb22501000000000000000f01000000000000000000000000000000")));
        assert_eq!(moved.iter().map(|i| (i.storage, i.slot, i.amount)).collect::<Vec<_>>(), vec![(15, 0, 9), (15, 1, 1)]);
        // The owner's 2026-11-22 Vakron run: a party member's vitals, full HP; another's, low.
        assert_eq!(party_vitals(&frame(OP_PARTY_VITALS, &hex("b157b0d001b0d001a10d0000a10d0000000000000000000045330000f049020001"))), Some((11185, 26672, 26672, 13125, 150000)));
        assert_eq!(party_vitals(&frame(OP_PARTY_VITALS, &hex("a328de74a396012a1400002a1400000000000000000000f0490200f049020001"))).map(|v| (v.0, v.1, v.2)), Some((5155, 14942, 19235)));
        // The owner's 2026-11-23 duty missions: Safe Hiking taken (place 396), handed in with its
        // first reward; Wanted: Officer Barha handed in (place 395) with its first four.
        let taken = duty_taken(&frame(OP_DUTY_TAKEN, &hex("84de130002010000000000008c01000000000000000521337037904e0000e1f505000000009bc76524010080f0fa020000000040da051e0100408af7010000000040da051e010040787d01000000006426b41fc801008096980000000000"))).unwrap();
        assert_eq!((taken.0, taken.1), (1302148, 396));
        assert_eq!(taken.2, vec![(930100001, 10000, 100_000_000), (610650011, 1, 50_000_000), (503700032, 1, 33_000_000), (503700032, 1, 25_000_000), (531900004, 200, 10_000_000)]);
        assert_eq!(duty_done(&frame(OP_DUTY_DONE, &hex("00008b0100000400000000010000000200000003000000"))), Some((395, vec![0, 1, 2, 3])));
        assert_eq!(duty_done(&frame(OP_DUTY_DONE, &hex("00008c0100000100000000"))), Some((396, vec![0])));
        // The board as Safe Hiking was handed in: both missions, each at its place.
        let board = duty_board(&frame(OP_DUTY_BOARD, &hex(BOARD_HEX)));
        assert_eq!(board.iter().map(|m| (m.0, m.1, m.2.len())).collect::<Vec<_>>(), vec![(1302021, 395, 5), (1302148, 396, 5)]);
        assert_eq!(board[0].2[0], (930100001, 8000, 100_000_000));
        // The owner's 2026-11-22 login: Draupnir (Conquest) at 3 cubes of its 14, Vakron Sky Island at 2.
        let exp = expeditions(&frame(OP_EXPEDITIONS, &hex("06c12709000000cc2709000000df2709000001e02709000300072809000001082809000200"))).unwrap();
        assert_eq!(exp.len(), 6);
        assert_eq!(exp[3], (600_032, 3, 0));
        assert_eq!(exp[5], (600_072, 2, 0));
        // All of it: the two taken and the 14 offered still, rerolled twice, replaced on 2026-11-23 at 08:00.
        let full = duty_board_full(&frame(OP_DUTY_BOARD, &hex(BOARD_HEX))).unwrap();
        assert_eq!((full.rerolls, full.expires_ms), (2, Some(1_795_417_200_000)));
        assert_eq!(full.missions.iter().filter(|m| m.1 != 0).count(), 2);
        assert_eq!(full.missions.iter().filter(|m| m.1 == 0).count(), 14);
        let entries = reward_board(&frame(OP_REWARD_BOARD, &hex("000049f00000d0100000ae11a9000500082b3370371e000000fc489b060100000037337037b0040000418ee91f01000000418ee91f01000000418ee91f010000002333703720030000d1b77c1e010000000e7ca38f0c01000000a1368b0c01000000406f920601000000a3c9860c010000005e2b6524010000005d2b6524010000005d2b652401000000d1f2632401000000d1f263240100000023337037400100005d2b6524010000002b3370371e00000037337037bc0200002b3370371400000000ab01000c6129880c0100000042addb0601000000a3c9860c010000005d2b6524010000005e2b652401000000d1f2632401000000d1f263240100000023337037b80100005f2b6524010000002b3370371e00000037337037bc0200002b33703714000000011905001463030000001905064e61796f756c0e00000001000000000000000002000c00b0890c01000000825d8b0c01000000e3d6890c010000005d2b6524010000005f2b652401000000d1f2632401000000d1f263240100000023337037900100005d2b6524010000002b3370371e00000037337037bc0200002b33703714000000011905001463030000001905064e61796f756c0e00000001000000000000000003000c4248920601000000825d8b0c01000000416f9206010000005d2b6524010000005d2b652401000000d1f2632401000000d1f263240100000023337037e00100005d2b6524010000002b3370371e00000037337037bc0200002b33703714000000011905001463030000001905064e61796f756c0e00000001000000000000000004000c6129880c0100000063f18f0c01000000c0899806010000005d2b6524010000005d2b652401000000d1f2632401000000d1f263240100000023337037b80100005d2b6524010000002b3370371e00000037337037bc0200002b33703714000000000100000014630300000019050000000000000000000100010000000101000000"))).unwrap();
        assert_eq!(entries.len(), 5);
        let names: Vec<_> = entries.iter().map(|(n, _)| n.as_deref()).collect();
        assert_eq!(names, [None, Some("Nayoul"), Some("Nayoul"), Some("Nayoul"), None]);
        // The owner's three: what the game's log said they got.
        let mut got = std::collections::HashMap::new();
        for (_, items) in entries.iter().filter(|(n, _)| n.is_some()) {
            for &(item, amount) in items {
                *got.entry(item).or_insert(0) += amount;
            }
        }
        assert_eq!(got[&930_100_003], 1320);
        assert_eq!(got[&930_100_023], 2100);
        assert_eq!(got[&930_100_011], 150);
        assert_eq!(got[&610_610_013], 6);
        assert_eq!(got[&610_610_015], 2);
        assert_eq!(got[&610_530_001], 6);
    }

    #[test]
    fn a_cube_reads_each_item_and_amount() {
        let (source, items) = loot(&frame(OP_LOOT, &hex("0000021a3f337037c027090037337037a00f0000e6f5930601000000cfa7930601000000466f9206020000002f21920601000000a6e89006010000008f9a900601000000cf88890c010000002f02880c0100000006979b060100000066109a0601000000c689980601000000cb629806010000000f968c0c01000000885d8b0c01000000e8d6890c02000000d3697f12010000004fa38f0c0100000028e48c0c01000000c480a82501000000c2da99250e000000d5f2632401000000d1f2632405000000b146cc2301000000418ee91f06000000"))).unwrap();
        assert_eq!(source, 2);
        assert_eq!(items.len(), 26);
        assert_eq!(items[0], (930_100_031, 600_000));
        assert_eq!(items[1], (930_100_023, 4000));
        assert_eq!(items[20], (631_800_004, 1));
        assert_eq!(items[25], (535_400_001, 6));
    }

    #[test]
    fn an_abyss_supply_request_reads_each_item_and_amount() {
        // The owner's 2026-11-22 Abyss Supply Request: 770 Abyss Points and 200 Enhance Stones.
        let body = hex("3a6d5200c26d0f000000000002233370370203000037337037c8000000");
        assert_eq!(supply_done(&frame(OP_SUPPLY_DONE, &body)), Some((1_011_138, vec![(930_100_003, 770), (930_100_023, 200)])));
        assert_eq!(supply_done(&frame(OP_SUPPLY_DONE, &body[..body.len() - 1])), None);
    }

    #[test]
    fn the_session_currencies_are_found_among_the_items() {
        // The 2026-11-22 Abyss Supply Request's: Abyss Points, Enhance Stones (164734) and another item.
        let body = hex("030100ed2508000092010023337037052f0100000000000101000000000000000000000000003600000100e0a8090000970000373370377e83020000000000010500000000000000000000000036000001008e450900005e0100525896252000000000000000024b000000000000000000000000004b00");
        assert_eq!(currencies(&frame(OP_ITEM, &body)), vec![(930_100_023, 164_734)]);
    }

    #[test]
    fn the_wallet_is_found_among_the_items() {
        let mut body = vec![0, 0, 3];
        body.extend([9, 9, 9, 0x21, 0x33, 0x70, 0x37]);
        body.extend(377_200u64.to_le_bytes());
        body.extend([1, 2, 3, 0x3f, 0x33, 0x70, 0x37]);
        body.extend(12_800_000u64.to_le_bytes());
        body.extend([0; 6]);
        assert_eq!(wallet(&frame(OP_ITEM_LIST, &body)), Some((Some(12_800_000), Some(377_200))));
        assert_eq!(wallet(&frame(OP_ITEM_LIST, &[0, 0, 1, 5, 5, 5])), None);
    }

    #[test]
    fn subscriptions_read_each_id_and_end() {
        let mut body = vec![2];
        for (id, end) in [(1u32, 1_797_000_000_000u64), (3, 1_798_000_000_000)] {
            body.push(0);
            body.extend(id.to_le_bytes());
            body.extend(1_795_000_000_000u64.to_le_bytes());
            body.extend(end.to_le_bytes());
        }
        assert_eq!(subscriptions(&frame(OP_SUBSCRIPTIONS, &body)), Some(vec![(1, 1_797_000_000_000), (3, 1_798_000_000_000)]));
        // One byte short: not read.
        assert_eq!(subscriptions(&frame(OP_SUBSCRIPTIONS, &body[..body.len() - 1])), None);
    }

    #[test]
    fn the_counters_read_whole() {
        let list = counters(&frame(OP_COUNTERS, &hex(include_str!("testdata/counters-ksix.hex")))).unwrap();
        assert_eq!(list.len(), 73);
        let get = |id: u32| list.iter().find(|(i, _)| *i == id).map(|(_, v)| v.clone());
        assert_eq!(get(60_000_001), Some(vec![60, 155]), "Odyle energy, basic and charged");
        assert_eq!(get(1), Some(vec![20]), "Shugo Festival keys");
        assert_eq!(get(4), Some(vec![11]));
        assert_eq!(get(9), Some(vec![25_200_000]));
        assert_eq!(get(10_000_001), Some(vec![]));
    }

    /// TremendoHeal entering the Abyss after the reset, then finishing Sulfur Tree Island (2026-11-01).
    #[test]
    fn a_corridor_is_given_then_done() {
        let read = |h: &str| counter(&frame(OP_COUNTER, &hex(h)));
        assert_eq!(read("000182969800d0fb01000000000002"), Some((10_000_002, vec![130_000])));
        assert_eq!(read("00008296980003"), Some((10_000_002, vec![])));
        assert_eq!(read("00030300000080fd720000000000e0b43d000000000003"), Some((3, vec![7_536_000, 4_044_000])));
        assert_eq!(read("000182969800d0fb010000000000"), None, "cut short");
    }

    /// A friend's captures (Rawx, server 1406): a Nightmare entered with 14 daily entries and 4
    /// tickets, the Ascension Trial spent to none left, energy spent.
    #[test]
    fn runs_spent_are_told_as_they_happen() {
        let read = |h: &str| counter(&frame(OP_COUNTER, &hex(h)));
        assert_eq!(read("000c040000000d0403"), Some((4, vec![13, 4])), "Nightmare: 13 daily entries, 4 tickets");
        assert_eq!(read("000801b4c4040403"), Some((80_000_001, vec![0, 4])), "the first value left out");
        assert_eq!(read("000001b4c40403"), Some((80_000_001, vec![])), "Ascension Trial: none left");
        assert_eq!(read("000c0187930389021903"), Some((60_000_001, vec![265, 25])), "energy");
        assert_eq!(read("010c01879303c2038701010a000000"), Some((60_000_001, vec![450, 135])), "energy +10 from an item: 575 to 585");
        assert_eq!(read("010801879303280128000000"), Some((60_000_001, vec![0, 40])), "energy +40 from an item: 0 to 40");
        assert_eq!(read("000801879303820103"), Some((60_000_001, vec![0, 130])), "energy spent opening a dungeon chest: 210 to 130 (2026-11-21)");
    }

    /// The Abyss's list as you enter it (2026-11-03): one boss with no time.
    #[test]
    fn the_abyss_bosses_read_with_a_missing_time() {
        let h = "01910000140000000800d40f00c03757b3a101000000d10f00bf8da4a101000000d20f000000000000000000d80f00534caea101000000d30fc03757b3a101000000d60f00534caea101000000d50fc03757b3a101000000d70f00534caea1010000000000";
        // The log's bytes start at the opcode.
        let (world, list) = field_bosses(&frame(OP_FIELD_BOSSES, &hex(h)[2..])).unwrap();
        assert_eq!(world, 20);
        let got: Vec<_> = list.iter().map(|b| (b.id, b.up, b.at_ms)).collect();
        assert_eq!(
            got,
            vec![
                (2004, false, 1_794_010_200_000),
                (2001, false, 1_793_762_115_328),
                (2002, false, 0),
                (2008, false, 1_793_925_600_000),
                (2003, false, 1_794_010_200_000),
                (2006, false, 1_793_925_600_000),
                (2005, false, 1_794_010_200_000),
                (2007, false, 1_793_925_600_000),
            ]
        );
    }

    #[test]
    fn you_come_with_your_class_level_and_gear_score() {
        let me = character(&frame(OP_SELF, &hex("c9445f81e32b37044b7369787e0506000000012d000000ac0a0000ac0a00002d000000"))).unwrap();
        assert_eq!((me.name.as_str(), me.server, me.class, me.level, me.gear_score), ("Ksix", 1406, Some(6), Some(45), Some(2732)));
    }

    #[test]
    fn an_arena_kill_and_who_assisted() {
        // The owner's 2026-11-27 Co-op: Wolfert (a5820200) kills v45Darkside2 (d9530300), Nayel (2a1a0300) and Katunga assisting.
        let players = frame(OP_ARENA_PLAYERS, &hex("87bb0202000000 2a1a030000001905054e6179656c1e000000 d9530300000020050c7634354461726b736964653206000000"));
        assert_eq!(arena_players(&players), vec![(0x00031a2a, "Nayel".to_string()), (0x000353d9, "v45Darkside2".to_string())]);
        assert_eq!(arena_kill(&frame(OP_ARENA_KILL, &hex("a582020000001b05d953030000002005"))), Some((0x000282a5, 0x000353d9)));
        let score = frame(OP_ARENA_SCORE, &hex("05a582020000001b050001000201d953030000002005000100002a1a03000000190500010100d36c02000000030902010100f9b303000000fd080000000201"));
        assert_eq!(arena_scored(&score, &[0x000282a5, 0x000353d9, 0x00031a2a, 0x00012345]), vec![0x000282a5, 0x000353d9, 0x00031a2a]);
    }

    fn hex(s: &str) -> Vec<u8> {
        let s: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// `<length varint> <opcode> <body>`, by the game's rule (body + opcode + 4).
    pub fn frame(op: [u8; 2], body: &[u8]) -> Vec<u8> {
        let mut v = (body.len() + 2 + 4) as u32;
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
        out.extend_from_slice(&op);
        out.extend_from_slice(body);
        out
    }

    #[test]
    fn finds_boss_ids() {
        // 101001 as a varint (89 95 06) and 101021 as a u32 (9d 8a 01 00).
        assert_eq!(boss_ids_in(&[0x05, 0x10, 0x20, 0x89, 0x95, 0x06, 0x00, 0x9d, 0x8a, 0x01, 0x00]), 2);
        assert_eq!(boss_ids_in(&[0x05, 0x10, 0x20, 0x01, 0x02]), 0);
    }

    #[test]
    fn a_soul_pickup_for_two_pets_reads_both() {
        // A2Tools' decoder test: [02, pet 1015 amount 1, pet 1120 amount 1].
        let f = frame(OP_SOUL, &hex("02 f7030000 01000000 60040000 01000000"));
        assert_eq!(souls(&f), Some(vec![(1015, 1), (1120, 1)]));
        let one = frame(OP_SOUL, &hex("01 ee030000 03000000"));
        assert_eq!(souls(&one), Some(vec![(1006, 3)]));
        // A pet id no pet has: a misread, not a soul.
        assert_eq!(souls(&frame(OP_SOUL, &hex("01 f22d0100 01000000"))), None);
    }

    #[test]
    fn a_level_up_names_the_pet_and_its_level() {
        let f = frame(OP_LEVEL_UP, &hex("0000 ee030000 02000000"));
        assert_eq!(level_up(&f), Some((1006, 2)));
    }

    #[test]
    fn a_collection_reads_and_garbage_does_not() {
        let mut body = hex("00000000 02");
        body.extend(hex("ee030000 ee030000 01000000 f7030000 f7030000 03000000"));
        body.extend(hex("02 ee030000 20000000 f7030000 00000000"));
        let c = collection(&frame(OP_COLLECTION, &body)).unwrap();
        assert_eq!(c.levels, vec![(1006, 1), (1015, 3)]);
        assert_eq!(c.souls, vec![(1006, 32), (1015, 0)]);
        // The count a misread gave Pet #77298 (3,845,597,724 souls): no sync.
        let mut bad = hex("00000000 00 01");
        bad.extend(hex("f22d0100 dc0d38e5"));
        assert_eq!(collection(&frame(OP_COLLECTION, &bad)), None);
    }

    #[test]
    fn the_character_record_names_you_and_your_server() {
        let f = frame(OP_SELF, &hex("a135 0000000000 04 4b736978 5004 ff"));
        assert_eq!(character(&f), Some(Character { entity: 6817, name: "Ksix".into(), server: 1104, class: None, level: None, gear_score: None }));
    }

    #[test]
    fn a_kill_credit_names_the_killer() {
        // victim 30001, a u32, killer 1395, server 1104, "Ksix", legion "Lokthar".
        let body = hex("b1ea01 00000000 f30a 5004 04 4b736978 07 4c6f6b74686172 00");
        let f = frame(OP_KILL, &body);
        let got = kill_credits(&f);
        assert_eq!(got.len(), 1);
        assert_eq!((got[0].victim, got[0].killer, got[0].server), (30001, 1395, 1104));
        assert_eq!((got[0].name.as_str(), got[0].legion.as_deref()), ("Ksix", Some("Lokthar")));
        assert!(!got[0].player_victim);
        let mut pvp = body.clone();
        *pvp.last_mut().unwrap() = 1;
        assert!(kill_credits(&frame(OP_KILL, &pvp))[0].player_victim);
    }

    /// The two Verteron cubes of dr89mh/aion2-cube-radar's FINDINGS (B5), opened
    /// there with a key; their positions match th.gl's cube spots exactly.
    #[test]
    fn a_hidden_cube_spawn_and_its_removal_read() {
        let cube = hex("e5ff03 0400 a74f1200 001d44c7 80a5f647 00647146 00000000 00000000 010101 aae4a534a1010000");
        let s = object_spawn(&frame(OP_OBJECT_SPAWN, &cube)).unwrap();
        assert_eq!((s.id, s.template), (65509, 1_200_039));
        assert_eq!((s.x.round(), s.y.round(), s.z.round()), (-50205.0, 126283.0, 15449.0));
        assert!(s.created_ms.is_some());
        assert_eq!(object_removed(&frame(OP_OBJECT_REMOVED, &hex("e5ff03 04 0300"))), Some((65509, 4)));
    }

    #[test]
    fn kina_and_the_shop_read_as_the_python_tracker_did() {
        let f = frame(OP_ITEM, &hex("01 0100 00000000 00000000 3f337037 be86390000000000"));
        assert_eq!(kina(&f), Some(3_770_046));
        let mut body = vec![104, 1];
        body.extend(1u32.to_le_bytes());
        body.extend(150_000_001u32.to_le_bytes());
        body.extend(1u64.to_le_bytes());
        body.extend([0, 1]);
        body.extend(1000u64.to_le_bytes());
        body.extend(900u64.to_le_bytes());
        body.extend(1_792_350_000_000u64.to_le_bytes());
        let (tab, items, next) = shop(&frame(OP_SHOP, &body)).unwrap();
        assert_eq!((tab, items.len(), items[0].price, next), (104, 1, 900, Some(1_792_350_000_000)));
    }

    #[test]
    fn a_player_in_view_reads_its_faction() {
        // Two players from the 2026-10-25 packet log, their first 200 bytes: an Asmodian (2406) and an Elyos (1406).
        let asmo = player(&frame(OP_PLAYER, &hex("b1490320a401070a4c6f706572616d69646117000000020100d20cda5f48765c52c800a027456d948b4383c601826e826ef40e0000f40e00000000000000000000c80d0200c80d020000000000f049020001000000a0860100a0860100d04e0900d04e090002a467650250e56302cdd84f01660914020000000066090a53796e646963617465330200020000000000000000000000000000000a1126815ffd09ffffffffffffffff8075d52abb030000b1490f006cc35f4825d051c8001028451127017a030affff"))).unwrap();
        assert_eq!((asmo.name.as_str(), asmo.server, asmo.faction), ("Loperamida", Some(2406), Some(ASMODIAN)));
        let (x, y) = asmo.place.unwrap();
        assert!((x - 229_224.0).abs() < 1.0 && (y + 215_410.0).abs() < 1.0, "{x} {y}");
        let ely = player(&frame(OP_PLAYER, &hex("ab620320a001070659616b617a6506000000010280d214746148345c52c8bddc1e4553c57e432cb50000b3ca01dc0e0000dc0e000000000000000000005c0602004833020080890000f049020001000000a0860100a08601004a11090070d50a000100000001084ecb0138d6cc01ee1753027e052400000000007e05084f6c6450617274790100020000000000000000000000000000000d11122bc4c901ffffffffffffffff8075d52abb030000ab620100c8fb3e478ef8144800c4b94611133fc4c901ffffffff"))).unwrap();
        assert_eq!((ely.server, ely.faction), (Some(1406), Some(ELYOS)));
    }

    #[test]
    fn a_player_in_view_reads_its_pvp_switch() {
        // Coby (PvP on, 2026-10-26 23:47) and ZergBR (off, 2026-10-28): the same first byte, 03.
        let coby = player(&frame(OP_PLAYER, &hex("a00b0320a4030704436f627924000000020280d2c45e9fc7162d95c7"))).unwrap();
        let zerg = player(&frame(OP_PLAYER, &hex("ab080320a40107065a65726742521b000000020180d2bc941948a4df2248"))).unwrap();
        assert_eq!((coby.name.as_str(), coby.pvp), ("Coby", true));
        assert_eq!((zerg.name.as_str(), zerg.pvp), ("ZergBR", false));
        assert!(!coby.open_pvp && !zerg.open_pvp);
        assert_eq!(pvp_switch(&frame(OP_PVP_SWITCH, &hex("f06c01"))), Some((13936, true)));
        // The Abyss: Lag3rth4, PvP off but there to fight (the owner's 2026-10-27 02:23 log).
        let lag = player(&frame(OP_PLAYER, &hex("ce110530a00117084c616733727468340800000002020240"))).unwrap();
        assert_eq!((lag.name.as_str(), lag.pvp, lag.open_pvp), ("Lag3rth4", false, true));
    }

    #[test]
    fn a_player_in_view_reads_its_combat_power() {
        // SquarX (2308 gear score, 115.4k combat power in game), from the 2026-10-26 15:07 log.
        let squarx = player(&frame(OP_PLAYER, &hex(include_str!("testdata/spawn-squarx.hex")))).unwrap();
        assert_eq!((squarx.name.as_str(), squarx.combat_power), ("SquarX", Some(115_485)));
        // An Asmodian whose spawn ends at the combat power's zero byte (2026-10-26 15:32 log).
        let daeps = player(&frame(OP_PLAYER, &hex(include_str!("testdata/spawn-daeps.hex")))).unwrap();
        assert_eq!((daeps.name.as_str(), daeps.faction, daeps.combat_power), ("Dæps", Some(ASMODIAN), Some(86_671)));
        assert_eq!(daeps.server, Some(2406));
        // Cut before the mark: none.
        let b = hex(include_str!("testdata/spawn-squarx.hex"));
        assert_eq!(player(&frame(OP_PLAYER, &b[..200])).map(|p| p.combat_power), Some(None));
    }

    #[test]
    fn a_player_card_reads_level_gear_score_and_combat_power() {
        let card = player_card(&frame(OP_PLAYER_CARD, &hex("58b00300 0000 7e05 0e000000 2d000000 460a0000 0753686967676c79 7e05 00000000 32e10100 00000000 01000000 007c415e76a1010000"))).unwrap();
        assert_eq!(card, PlayerCard { name: "Shiggly".into(), server: 1406, class: 14, level: 45, gear_score: 2630, combat_power: 123_186 });
        // Not a card: a level of 0.
        assert_eq!(player_card(&frame(OP_PLAYER_CARD, &hex("58b00300 0000 7e05 0e000000 00000000 460a0000 0753686967676c79 7e05 00000000 32e10100"))), None);
    }

    #[test]
    fn a_chest_says_how_many_it_gave() {
        // Dartan's: the chest, then 2: his shoulders (210430099) and 8 Artwork Scraps.
        let dartan = frame(OP_BOX_OPENED, &hex("5d03c49b0800002c0300149fcf1fff010000000293e88a0c0001000000a27db3250008000000"));
        assert_eq!(box_opened(&dartan), Some(vec![(533_700_372, true, 1), (210_430_099, false, 1), (632_520_098, false, 8)]));
        // Kashapa's: the chest, then 1.
        let kashapa = frame(OP_BOX_OPENED, &hex("5d03126e0600009a0200159fcf1fff0100000001a27db3250006000000"));
        assert_eq!(box_opened(&kashapa), Some(vec![(533_700_373, true, 1), (632_520_098, false, 6)]));
    }

    #[test]
    fn target_info_reads_a_players_sheet() {
        let wolf = include_str!("testdata/target-info-wolf.hex");
        let t = target_info(&frame(OP_TARGET_INFO, &hex(wolf))).unwrap();
        assert_eq!(
            t,
            TargetInfo { name: "Wolf".into(), server: 1406, level: 45, gear_score: 2429, class: 13, legion: Some("Flexq".into()), combat_power: 125_122 }
        );
        assert_eq!(roster_class(t.class), Some("Ranger"));
        // An Asmodian visiting the owner's server: their own server first, then the one they are on.
        let arise = include_str!("testdata/target-info-arise.hex");
        let a = target_info(&frame(OP_TARGET_INFO, &hex(arise.trim()))).unwrap();
        assert_eq!((a.name.as_str(), a.server, a.level, a.gear_score), ("Arïse", 2307, 45, 2829));
    }
}
