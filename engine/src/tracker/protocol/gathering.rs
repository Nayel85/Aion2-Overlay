//! Gathering, crafting and supply requests: a gathering's or a craft's start (its outcome, rolls
//! and length already in it), its end, its result, and a supply request handed in.

use super::*;

/// A gathering starting (`31 8D 00 00 <node varint> <try u32> <outcome u8> ...`), about 7 s before its
/// outcome (`33 8D`), which it already says, as flags: 1 gathered, 2 and 4 a better grade rolled. So 0
/// failed, 1 gathered, 7 ranked up, 6 a rank up rolled but failed (a Pure Diamond on 2026-11-23). Its doubling too: a
/// roll firing Plentiful Harvest (action 71000, its level in the second id: Nayel's Lv. 3 71002;
/// Nayoul's another, so not a fixed run of bytes) is in the start of every gathering that doubled,
/// and of no other. All 17 of the owner's gatherings of 2026-11-22 (3 failed, 4 ranked
/// up, 6 doubled) had what their start said. The grade rolled follows: 1 plain, 2 ranked up...
/// (node, try, outcome, grade, doubled, how long it takes in ms, its rolls).
pub fn gather_start(frame: &[u8]) -> Option<(u32, u32, u8, u8, bool, u32, Vec<GatherRoll>)> {
    let b = body(frame, OP_GATHER_START)?;
    let (node, n) = varint(b, 2)?;
    let at = 2 + n;
    let tries = u32_at(b, at)?;
    let outcome = *b.get(at + 4)?;
    // The grade rolled: 1 the plain item, 2 ranked up (Fine), 3, 4 (questlog's drop groups).
    let grade = *b.get(at + 7)?;
    let rolls = gather_rolls(&b[at..]);
    let doubled = rolls.iter().any(|r| r.doubled);
    let ms = gather_ms(&rolls, grade);
    // Outcomes other than 0, 1 and 7 come too (a Fine Odyle on 2026-11-23 had one): told as they are.
    (grade >= 1 && grade <= 9).then_some((node, tries, outcome, grade, doubled, ms, rolls))
}

/// A supply request handed in (`3F E2 <u32> <request u32> <u32> <n u8> (<item u32> <amount u32>)×n`):
/// its rewards, the game's set ones. The owner's 2026-11-23 Silentium (1011117): 1640 Abyss Points
/// and 420 Enhance Stones; Blacksmith Weapon (1013001): 1840 Abyss Points. (request, rewards).
pub fn supply_done(frame: &[u8]) -> Option<(u32, Vec<(u32, u32)>)> {
    let b = body(frame, OP_SUPPLY_DONE)?;
    let request = u32_at(b, 4)?;
    let n = *b.get(12)? as usize;
    let rewards = (0..n).map(|i| Some((u32_at(b, 13 + 8 * i)?, u32_at(b, 17 + 8 * i)?))).collect::<Option<Vec<_>>>()?;
    (n > 0 && n <= 16).then_some((request, rewards))
}

/// A craft starting (`6F 8D 00 05 <you varint> <recipe u32> <outcome u8> 00 <steps>...`), its outcome
/// in it as a gathering's is: 0 failed (nothing made), 1 the plain item, 13 the better one (a proc: the green Splendent
/// Orichalcum Guard where an Orichalcum Guard is crafted). The owner's 2026-11-23 crafts: 24 plain
/// and 1 proc, each as its start said. (recipe, outcome, how long it takes in ms).
pub fn craft_start(frame: &[u8]) -> Option<(u32, u8, u32)> {
    let b = body(frame, OP_CRAFT_START)?;
    let (_, n) = varint(b, 2)?;
    let recipe = u32_at(b, 2 + n)?;
    let outcome = *b.get(2 + n + 4)?;
    // Its steps: <count u8>, then each <kind u16> <u32> <u32>. Each takes 2 s, kinds 4 and 6 1.6 s:
    // the owner's 23 plain crafts of 2026-11-23 took that to 0.06 s. A proc plays 7.5 s more (one seen).
    let at = 2 + n + 6;
    let steps = *b.get(at)? as usize;
    let mut ms = 0;
    for i in 0..steps {
        let kind = u16::from_le_bytes([*b.get(at + 1 + 10 * i)?, *b.get(at + 2 + 10 * i)?]);
        ms += if kind == 4 || kind == 6 { 1600 } else { 2000 };
    }
    if outcome == 13 {
        ms += 7500;
    }
    Some((recipe, outcome, ms))
}

/// How long a gathering takes, from its rolls (`gather_rolls`): a roll of kind 1, 2, 3 or 5 plays
/// 1.51 s, of kind 0, 4 or 6 1.21 s, the doubling 1.01 s more, a rank up 1.01 s more, and 0.11 s
/// besides. The owner's 17 gatherings of 2026-11-22: within 0.04 s each.
fn gather_ms(rolls: &[GatherRoll], grade: u8) -> u32 {
    110 + rolls.iter().map(|r| r.ms).sum::<u32>() + if grade > 1 { 1010 } else { 0 }
}

/// One roll of a gathering (its start lists them): how long it plays (ms), what it adds to the success
/// gauge and to the failure one (after the skills: Proficient Handling's +50 on a success, Delicate
/// Touch's -40 on a failure), and whether it was Lady Luck's (action 300) or the doubling (71000).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatherRoll {
    pub ms: u32,
    pub success: u32,
    pub failure: u32,
    pub luck: bool,
    pub doubled: bool,
    /// The skills that fired, each the second id of its action, which carries its level: Nayel's
    /// Proficient Handling Lv. 10 810 (800 + 10), Delicate Touch Lv. 5 105, Lady Luck Lv. 10 310,
    /// Odyle's Plentiful Harvest Lv. 3 71002 (71000 its Lv. 1).
    pub skills: Vec<u32>,
}

/// A gathering start's rolls (`b` from its try counter on): `<count u8>` at 11, then each `<kind u8>
/// [00] <actions u8> (<skill u32> 01 <skill u32>)×actions <success u32> <success after skills u32>
/// <failure u32> <failure after skills u32>`. The skills are those that fired: 800 a success (with
/// Proficient Handling 810), 100 a failure (Delicate Touch 105), 300 Lady Luck, 71000 the doubling;
/// none, a roll as it fell. The `00` comes before the actions' count on some later rolls. The owner's
/// gatherings filled their gauge to 360 (Odyle) or 630 with them.
pub fn gather_rolls(b: &[u8]) -> Vec<GatherRoll> {
    let u = |at: usize| b.get(at..at + 4).map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]));
    let count = b.get(11).copied().unwrap_or(0);
    let mut rolls = Vec::new();
    let mut p = 12;
    for _ in 0..count {
        let (Some(&kind), Some(&next)) = (b.get(p), b.get(p + 1)) else { break };
        let (actions, at) = match b.get(p + 2) {
            Some(&k) if next == 0 && k <= 4 => (k as usize, p + 3),
            _ => (next as usize, p + 2),
        };
        if actions > 4 {
            break;
        }
        let skills: Vec<u32> = (0..actions).filter_map(|m| u(at + 9 * m)).collect();
        let levels: Vec<u32> = (0..actions).filter_map(|m| u(at + 9 * m + 5)).collect();
        let values = at + 9 * actions;
        let (Some(success), Some(failure)) = (u(values + 4), u(values + 12)) else { break };
        let doubled = skills.contains(&71_000);
        rolls.push(GatherRoll {
            ms: if matches!(kind, 0 | 4 | 6) { 1210 } else { 1510 } + if doubled { 1010 } else { 0 },
            success,
            failure,
            luck: skills.contains(&300),
            doubled,
            skills: levels,
        });
        p = values + 16;
    }
    rolls
}

/// The object an interaction ended with (`OP_INTERACTION_OVER`).
pub fn interaction_over(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_INTERACTION_OVER)?;
    varint(b, 0).map(|(object, _)| object)
}

/// A gathering's outcome (`33 8D <result u8> <u32> <item u32> <amount u32> <bonus u32> ...`), sent
/// with the bags' change: the owner's 2026-11-22 Odyle (610610013) and Fine Odyle (610610014), one
/// each; the result 0 gathered, 1 ranked up (the Fine Odyle, from an Odyle node), 2 failed (amount
/// 0); the bonus 1 when the gathering doubled (their "x2" Odyle: amount 1, bonus 1). (result, item,
/// amount, bonus).
pub fn gather(frame: &[u8]) -> Option<(u8, u32, u32, u32)> {
    let b = body(frame, OP_GATHER)?;
    let item = u32_at(b, 5)?;
    (item > 0).then_some((*b.first()?, item, u32_at(b, 9)?, u32_at(b, 13)?))
}
