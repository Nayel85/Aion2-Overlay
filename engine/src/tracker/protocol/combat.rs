//! Combat: spawns and deaths, kill credits, casts and their targets, effects, the party's vitals.

use super::*;

/// `42 36`'s flag for a monster killed in combat (1: out of range, 7: gone).
pub const DEATH_FLAG_COMBAT: u32 = 3;
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

pub(super) fn kill_credit_at(b: &[u8], at: usize) -> Option<KillCredit> {
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
pub(super) const EFFECT_MS: std::ops::Range<u64> = 1_580_000_000_000..5_000_000_000_000;

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

/// The entity you selected (`35 38 <entity varint> 00 ...`, 4 to 6 bytes after the opcode). It
/// describes your own target only; the game sends nothing for others' targets. Seen in the owner's
/// 2026-11-14 18:22 log: Saphy `bc 44`, monsters as 3-byte ids.
pub fn selection(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_SELECTION)?;
    let (entity, n) = varint(b, 0)?;
    (entity > 0 && b.len() > n).then_some(entity)
}
