import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addChanges, applySlots, fromList, heldItems, placeItems, placeSlots, whereIs, type Inventories } from '../src/shared/inventory.ts'
import { itemIcon, lesserEquipment, notableLoot } from '../src/shared/sessions.ts'

test("a login's list into slots; items moving say their slots anew; an item found everywhere it is", () => {
  // The owner's 2026-11-23 login as Nayel, in part: Kina and two stacks of Silentium in the bag,
  // Mela in the account's warehouse, Seeds of Detection in her own, the mace +10 she wears.
  const { own, account } = fromList([
    { storage: 1, slot: 0, item: 930100031, amount: 17108694 },
    { storage: 2, slot: 36, item: 610610013, amount: 368 },
    { storage: 1, slot: 52, item: 630840002, amount: 731 },
    { storage: 1, slot: 53, item: 630840002, amount: 1000 },
    { storage: 15, slot: 0, item: 511490001, amount: 11 },
    { storage: 11, slot: 1, item: 110550049, amount: 1, enchant: 10, stones: [[531360001, 0x13d, 2], [531360001, 0xc1, 1]] },
    { storage: 99, slot: 0, item: 610610013, amount: 1 },
    // Two Arcana, both in slot 0: each its own.
    { uid: 120171, storage: 14, slot: 0, item: 810160002, amount: 1 },
    { uid: 598828, storage: 14, slot: 0, item: 810560002, amount: 1 },
  ])
  let inv: Inventories = { characters: { '1305:Nayel': { name: 'Nayel', server: 1305, at: 0, slots: own } }, account: { at: 0, slots: account } }
  const nayel = (): NonNullable<Inventories['characters'][string]> => inv.characters['1305:Nayel']!
  assert.deepEqual(placeItems(placeSlots(inv, nayel(), 'bag')), { '930100031': 17108694, '630840002': 1731 })
  assert.equal(Object.keys(placeSlots(inv, nayel(), 'arcana')).length, 2)
  assert.deepEqual(placeSlots(inv, nayel(), 'worn')[1], { item: 110550049, amount: 1, enchant: 10, stones: [[531360001, 0x13d, 2], [531360001, 0xc1, 1]] })

  // Her Silentium stack of 731 moved to the account's warehouse: slot 40 there, slot 52 of the bag emptied.
  inv = applySlots(inv, '1305:Nayel', { name: 'Nayel', server: 1305 }, 5, [
    { storage: 2, slot: 40, item: 630840002, amount: 731 },
    { storage: 1, slot: 52, item: 630840002, amount: 0 },
  ])
  assert.deepEqual(placeItems(placeSlots(inv, nayel(), 'bag')), { '930100031': 17108694, '630840002': 1000 })
  assert.deepEqual(whereIs(inv, '630840002'), [['Nayel', 'bag', 1000], [null, 'account', 731]])
  assert.equal(inv.account!.at, 5)
})

test('the lesser equipment is listed for the inventory, never kept as loot; every item has its icon', () => {
  // Fierce Battle Amulet (green, an amulet): a name, not loot; Vakron Greaves (gold): loot.
  assert.equal(lesserEquipment(311050002), true)
  assert.equal(lesserEquipment(210230052), false)
  assert.deepEqual(notableLoot([{ item: 311050002, amount: 1 }, { item: 210230052, amount: 1 }]), { '210230052': 1 })
  // A bundled icon by its name; one not bundled through the main process (main/icons.ts).
  assert.equal(itemIcon('Icon_Equip_AR_L_0028_T05_Pants'), 'items/loot/Icon_Equip_AR_L_0028_T05_Pants.webp')
  assert.equal(itemIcon('Item/Armor/Icon_GM_0111_T04_Helmet'), 'itemicon://icon/Item/Armor/Icon_GM_0111_T04_Helmet.webp')
})

test('an item moved between places, or through the account warehouse, is no arrival; a new one is', () => {
  const bag = (slots: Record<string, { item: number; amount: number }>) => ({ name: 'Nayel', server: 1305, at: 0, slots })
  const before: Inventories = { characters: { a: bag({ '1:3': { item: 512400017, amount: 1 }, '1:4': { item: 7, amount: 5 } }) }, account: null }
  // The wings to the account warehouse, 2 more of item 7, a new item 9.
  const after: Inventories = { characters: { a: bag({ '1:4': { item: 7, amount: 7 }, '1:8': { item: 9, amount: 1 } }) }, account: { at: 0, slots: { '2': { item: 512400017, amount: 1 } } } }
  const changes: Record<string, number> = {}
  addChanges(changes, heldItems(before, 'a', true), heldItems(after, 'a', true))
  assert.deepEqual(changes, { '7': 2, '9': 1 })
})
