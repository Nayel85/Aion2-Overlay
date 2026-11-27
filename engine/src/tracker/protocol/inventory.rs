//! Your bags and warehouses: each slot's item, its enchantment, stones and soul binding.

use super::*;

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
pub(super) fn depot_records(b: &[u8], empty: bool) -> Vec<DepotItem> {
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
pub(super) fn soul_binding(x: &[u8]) -> Vec<(u16, u32)> {
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
pub(super) fn skill_list(x: &[u8]) -> Option<(usize, Vec<(u32, u8)>)> {
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
pub(super) fn stat_list_before(x: &[u8], skills: usize) -> Vec<(u16, u32)> {
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
