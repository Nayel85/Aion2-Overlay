//! The pets: souls picked up, a pet levelled or unlocked, crystals and the collection.

use super::*;

/// Pet ids are four digits (1001-1299 in the game's table): anything else in a
/// pet field is a misread, not a pet.
pub const PET_IDS: std::ops::RangeInclusive<u32> = 1000..=9999;
/// The most a pet's count can be (75 at Lv2): a count past it is a misread.
pub(super) const MAX_SOULS: u32 = 1000;

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
