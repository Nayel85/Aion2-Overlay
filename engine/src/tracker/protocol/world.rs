//! Where you are and what is around: the map loaded, teleports, field bosses, objects in view.

use super::*;

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
pub(super) const MAX_HEIGHT: f32 = 100_000.0;

/// An x, y, z at `off` that reads as a place: x and y within ±500,000 and past
/// ±1,000 (smaller values are other fields read as floats), z under MAX_HEIGHT.
pub(super) fn place_at(b: &[u8], off: usize) -> Option<(f32, f32)> {
    let (x, y, z) = (f32_at(b, off)?, f32_at(b, off + 4)?, f32_at(b, off + 8)?);
    let coord = |v: f32| (1000.0..500_000.0).contains(&v.abs());
    (coord(x) && coord(y) && z.abs() < MAX_HEIGHT).then_some((x, y))
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldBoss {
    pub id: u32,
    pub up: bool,
    /// up: when it spawned (0 since the 2026-10-14 patch); dead: when it respawns
    pub at_ms: u64,
}

pub(super) fn plausible_ms(b: &[u8], at: usize) -> bool {
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
pub(super) fn boss_id(v: u32) -> bool {
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
