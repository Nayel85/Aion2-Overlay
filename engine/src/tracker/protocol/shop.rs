//! The Black Cloud Merchant's shop.

use super::*;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ShopItem {
    pub slot: u32,
    pub item: u32,
    pub quantity: u64,
    pub currency: u8,
    pub base: u64,
    pub price: u64,
}

pub(super) const SHOP_RECORD: usize = 34;

pub(super) fn shop_record(b: &[u8], o: usize) -> Option<ShopItem> {
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
