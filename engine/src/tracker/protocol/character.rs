//! Your characters: the one logged in, the selection list, their counters and subscriptions.

use super::*;

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
pub(super) fn counter_at(b: &[u8], start: usize) -> Option<(u32, Vec<u64>, usize)> {
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
