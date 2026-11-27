//! A dungeon's run: let in, its state (countdown, under way, over), cleared, a Nightmare's start.

use super::*;

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
