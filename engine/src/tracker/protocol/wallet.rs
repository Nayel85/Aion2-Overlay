//! Your balances: Kina, Abyss Points, the season's Oath Coins and weekly progress, the currencies.

use super::*;

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

pub(super) const KINA_ITEM: [u8; 4] = [0x3f, 0x33, 0x70, 0x37];

/// Your Kina balance: `1B 56 01 01 00 <u32> <u32> 3f 33 70 37 <balance u64>`.
/// The same opcode carries other stacks with other item bytes.
pub fn kina(frame: &[u8]) -> Option<u64> {
    currency(frame, KINA_ITEM)
}

/// The Abyss Points balance, the same record as Kina's with the item byte 0x23: in the owner's
/// 2026-11-14 19:12 corridor log it rose 200 to 270 with every kill (247271, 247524, 247776...)
/// while the weekly figure `ab ff` stayed still. The item before it, 0x21, rose 70 to 200 a kill.
pub(super) const ABYSS_ITEM: [u8; 4] = [0x23, 0x33, 0x70, 0x37];

pub fn abyss_balance(frame: &[u8]) -> Option<u64> {
    currency(frame, ABYSS_ITEM)
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
/// The balances each character's row shows (with Kina): the Oath Coins, the Abyss Points, the
/// Phantasmal Fragments (the Nightmares') and the Centuryroot Tokens.
pub const BALANCES: [u32; 4] = [SEASON_POINTS, ABYSS_POINTS, 930_100_017, 930_100_011];

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

/// Your bound Kina, the same record with item 930100001 (`21 33 70 37`): the item Abyss DPS Meter's
/// ticket roster (v4.2.8) reads beside Kina as `boundKina`.
pub(super) const BOUND_KINA_ITEM: [u8; 4] = [0x21, 0x33, 0x70, 0x37];

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
pub(super) fn currency(frame: &[u8], item: [u8; 4]) -> Option<u64> {
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
