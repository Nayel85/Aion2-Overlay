import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sortItems, whereIs, type Inventories } from '../src/shared/inventory.ts'
import { lesserEquipment, notableLoot } from '../src/shared/sessions.ts'

test("a login's items sorted into their places; an item found everywhere it is", () => {
  // The owner's 2026-11-23 login as Nayel, in part: Kina in the bag, Mela in the account's warehouse,
  // two stacks of Silentium in the bag, Seeds of Detection and a Clash Rune in her own warehouse.
  const { own, account } = sortItems([
    { storage: 1, item: 930100031, amount: 17108694 },
    { storage: 2, item: 610610013, amount: 368 },
    { storage: 1, item: 630840002, amount: 731 },
    { storage: 1, item: 630840002, amount: 1000 },
    { storage: 15, item: 511490001, amount: 11 },
    { storage: 15, item: 310900001, amount: 1 },
    { storage: 99, item: 610610013, amount: 1 },
  ])
  assert.deepEqual(own, { bag: { '930100031': 17108694, '630840002': 1731 }, warehouse: { '511490001': 11, '310900001': 1 } })
  assert.deepEqual(account, { '610610013': 368 })
  const inv: Inventories = {
    characters: { '1305:Nayel': { name: 'Nayel', server: 1305, at: 0, items: own }, '1305:Nayell': { name: 'Nayell', server: 1305, at: 0, items: { bag: { '610610013': 22 } } } },
    account: { at: 0, items: account },
  }
  assert.deepEqual(whereIs(inv, '610610013'), [[null, 'account', 368], ['Nayell', 'bag', 22]])
})

test('the lesser equipment is listed for the inventory, never kept as loot', () => {
  // Fierce Battle Amulet (green, an amulet): a name, not loot; Vakron Greaves (gold): loot.
  assert.equal(lesserEquipment(311050002), true)
  assert.equal(lesserEquipment(210230052), false)
  assert.deepEqual(notableLoot([{ item: 311050002, amount: 1 }, { item: 210230052, amount: 1 }]), { '210230052': 1 })
})
