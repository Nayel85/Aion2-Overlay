//! What dungeons, duty missions and chests give: a reward cube's loot, the reward board, a box
//! opened, and duty missions taken, offered and done.

use super::*;

/// What a reward cube gave as you open it (`15 57 00 00 <source u8> <count u8> (<item u32> <amount
/// u32>)*`), the loot window's list: the owner's 2026-11-22 Vakron Sky Island cube, source 2, 26
/// items from 600,000 Kina to an Amplify Stone Fragment (Unique). (source, items).
pub fn loot(frame: &[u8]) -> Option<(u8, Vec<(u32, u32)>)> {
    let b = body(frame, OP_LOOT)?;
    let count = *b.get(3)? as usize;
    if b.len() != 4 + 8 * count {
        return None;
    }
    let items = (0..count).map(|i| Some((u32_at(b, 4 + 8 * i)?, u32_at(b, 8 + 8 * i)?))).collect::<Option<Vec<_>>>()?;
    Some((b[2], items))
}

/// A field event's reward board (`0A 57`, a Shugo Festival's end): `<u16> <u32> <u32> <u32> <count
/// u8>`, then each entry `<index u8>` and two lists `<count u8> (<item u32> <amount u32>)*`, then
/// what it says of its player, of varying length, with their name (`<len u8><name> 0E 00 00 00`)
/// when there is one. The owner's 2026-11-22 "Up! Up! Up!": 5 entries, three with their name, whose
/// items are what they got (1,320 Abyss Points, 2,100 Enhance Stones, 150 Centuryroot Tokens...).
/// Each entry: (its player's name, its items).
pub fn reward_board(frame: &[u8]) -> Option<Vec<(Option<String>, Vec<(u32, u32)>)>> {
    let b = body(frame, OP_REWARD_BOARD)?;
    let count = *b.get(14)? as usize;
    let mut entries = Vec::with_capacity(count);
    let mut at = 15;
    for index in 0..count {
        if b.get(at) != Some(&(index as u8)) {
            return None;
        }
        let (items, end) = board_lists(b, at + 1)?;
        // The player part runs to the next entry: the first place its index starts lists that read.
        let next = (end..b.len()).find(|&q| index + 1 < count && b[q] == (index + 1) as u8 && board_lists(b, q + 1).is_some()).unwrap_or(b.len());
        entries.push((board_name(&b[end..next]), items));
        at = next;
    }
    Some(entries)
}

/// A player's name in a reward board's entry: `<len u8><name>` followed by a small u32 (`0E 00 00 00`
/// on the Shugo Festival's of 2026-11-22, `1E 00 00 00` on the Incursion of the Spirits' of the 23rd).
pub(super) fn board_name(part: &[u8]) -> Option<String> {
    (0..part.len()).find_map(|q| {
        let len = part[q] as usize;
        let name = part.get(q + 1..q + 1 + len)?;
        let after = part.get(q + 1 + len..q + 5 + len)?;
        ((2..=16).contains(&len) && after[0] > 0 && after[1..] == [0, 0, 0])
            .then(|| std::str::from_utf8(name).ok().filter(|s| s.chars().all(|c| c.is_alphanumeric())).map(str::to_string))
            .flatten()
    })
}

/// A box opened from your bags (`47 56`): 9 bytes, then each item `<index u8> <item u32> <flag
/// u8> <amount u32>`, the index from 0; flag FF the box spent, else what it gave. The owner's
/// 2026-11-22 Kashapa's Loot Chest, opened 5 s after the boss fell: the chest (FF) x1, Artwork Scrap:
/// Field Boss I x6. After the box itself, how many it gave and those, one after the other; an entry
/// read otherwise (an index before each, an equipment's running longer) is looked for as before.
/// Its items (id, spent, amount), or None unless at least one reads.
pub fn box_opened(frame: &[u8]) -> Option<Vec<(u32, bool, u32)>> {
    let b = body(frame, OP_BOX_OPENED)?;
    // An item at `at`: its index, a known id, a sane amount.
    let item_at = |at: usize, index: usize| -> Option<(u32, bool, u32)> {
        let (item, amount) = (u32_at(b, at + 1)?, u32_at(b, at + 6)?);
        (*b.get(at)? as usize == index && (100_000_000..1_000_000_000).contains(&item) && amount > 0 && amount <= 100_000_000).then(|| (item, b[at + 5] == 0xFF, amount))
    };
    let mut items = vec![item_at(9, 0)?];
    // Then how many it gave, and each `<item u32> <flag u8> <amount u32>` (Dartan's chest of
    // 2026-11-23: 2, its shoulders and 8 Artwork Scraps; Kashapa's: 1, read as an index before).
    let count = *b.get(19)? as usize;
    let gave: Option<Vec<(u32, bool, u32)>> = (0..count)
        .map(|k| {
            let at = 20 + 9 * k;
            let (item, flag, amount) = (u32_at(b, at)?, *b.get(at + 4)?, u32_at(b, at + 5)?);
            ((100_000_000..1_000_000_000).contains(&item) && amount > 0 && amount <= 100_000_000).then_some((item, flag == 0xFF, amount))
        })
        .collect();
    if let Some(gave) = gave.filter(|g| (1..=20).contains(&g.len()) && 20 + 9 * g.len() <= b.len()) {
        items.extend(gave);
        return Some(items);
    }
    let mut at = 19;
    // The next item where its index reads: an equipment's entry runs longer (its enchantment...).
    while let Some(q) = (at..b.len().saturating_sub(9)).find(|&q| item_at(q, items.len()).is_some()) {
        items.push(item_at(q, items.len())?);
        at = q + 10;
    }
    Some(items)
}

fn duty_rewards(b: &[u8], at: usize) -> Option<(Vec<DutyReward>, usize)> {
    let n = *b.get(at)? as usize;
    if n == 0 || n > 12 {
        return None;
    }
    let mut p = at + 1;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let item = u32_at(b, p)?;
        let (amount, len) = varint(b, p + 4)?;
        let q = p + 4 + len;
        let chance = u32_at(b, q + 1)?;
        if !(100_000_000..1_000_000_000).contains(&item) || *b.get(q)? != 0 || chance > 100_000_000 || u32_at(b, q + 5)? != 0 {
            return None;
        }
        out.push((item, amount, chance));
        p = q + 9;
    }
    Some((out, p))
}

/// A duty mission taken (`11 8D`): `<quest u32> ...` its place at 12, its rewards at 21.
pub fn duty_taken(frame: &[u8]) -> Option<DutyMission> {
    let b = body(frame, OP_DUTY_TAKEN)?;
    Some((u32_at(b, 0)?, u32_at(b, 12)?, duty_rewards(b, 21)?.0))
}

/// The duty board (`1C 8D`, as you open it and as you hand one in): each mission's `<quest u32>
/// <place u32>`, its rewards a few bytes on. Those on the board (taken or not).
pub fn duty_board(frame: &[u8]) -> Vec<DutyMission> {
    let Some(b) = body(frame, OP_DUTY_BOARD) else { return Vec::new() };
    let mut out = Vec::new();
    let mut p = 0;
    while p + 8 < b.len() {
        let (quest, place) = (u32_at(b, p).unwrap_or(0), u32_at(b, p + 4).unwrap_or(0));
        if (1_000_000..2_000_000).contains(&quest) && (1..100_000).contains(&place) {
            if let Some((rewards, end)) = (p + 8..p + 24).find_map(|q| duty_rewards(b, q)) {
                out.push((quest, place, rewards));
                p = end;
                continue;
            }
        }
        p += 1;
    }
    out
}

/// A duty mission handed in (`0F 8D`): `00 00 <place u32> <count u8> <index u32>*`, the indexes of
/// the rewards it gave in its list. The owner's 2026-11-23 Wanted: Officer Barha: place 395, rewards
/// 0 to 3. (place, indexes).
pub fn duty_done(frame: &[u8]) -> Option<(u32, Vec<u32>)> {
    let b = body(frame, OP_DUTY_DONE)?;
    let n = *b.get(6)? as usize;
    Some((u32_at(b, 2)?, (0..n).map(|i| u32_at(b, 7 + 4 * i)).collect::<Option<Vec<_>>>()?))
}
