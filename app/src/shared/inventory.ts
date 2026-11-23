/**
 * What your characters have, slot by slot: each login lists all of it (the engine's `inventory`
 * event, `11 56`), and each item that moves says its slots anew (`inventorySlots`, `1B 56`: a
 * transfer, loot, a sale; an amount of 0 empties a slot). Each character's bag, what they wear,
 * their Arcana and their own warehouse; the account's shared warehouse, the same for all.
 */

/** Where an item lies: the storage byte of the game's lists (engine DEPOT_STORAGES). */
export type Storage = 'bag' | 'worn' | 'arcana' | 'warehouse'
export type Place = Storage | 'account'
export const STORAGE_OF: Record<number, Place> = { 1: 'bag', 2: 'account', 11: 'worn', 14: 'arcana', 15: 'warehouse' }
const STORAGE_BYTE: Record<Place, number> = { bag: 1, account: 2, worn: 11, arcana: 14, warehouse: 15 }
/** The places, as the Inventory page names them, in its order. */
export const PLACES: { id: Place; label: string }[] = [
  { id: 'worn', label: 'Equipped' },
  { id: 'bag', label: 'Bag' },
  { id: 'warehouse', label: 'Personal warehouse' },
  { id: 'arcana', label: 'Arcana' },
  { id: 'account', label: 'Account warehouse' },
]

/** What a slot holds: the item, how many, and an equipment's enchantment and stones. */
export interface SlotItem {
  item: number
  amount: number
  enchant?: number
  stones?: number[]
}
/** Slots by `<storage>:<slot>` (a character's) or `<slot>` (the account's warehouse). */
export type Slots = Record<string, SlotItem>
export interface CharacterInventory {
  name: string
  server: number | null
  /** The last login's list, or the last change after it. */
  at: number
  slots: Slots
}
export interface Inventories {
  /** By character id (characters.ts characterId). */
  characters: Record<string, CharacterInventory>
  /** The account's shared warehouse, as the latest list or change had it. */
  account: { at: number; slots: Slots } | null
}
export const NO_INVENTORIES: Inventories = { characters: {}, account: null }

/** An item where it lies, as the engine tells it. */
export interface DepotItem {
  storage: number
  slot: number
  item: number
  amount: number
  enchant?: number
  stones?: number[]
}
const held = (d: DepotItem): SlotItem => ({ item: d.item, amount: d.amount, ...(d.enchant ? { enchant: d.enchant } : {}), ...(d.stones?.length ? { stones: d.stones } : {}) })

/** A login's list, sorted into the character's own slots and the account's warehouse's. */
export function fromList(items: DepotItem[]): { own: Slots; account: Slots } {
  const own: Slots = {}
  const account: Slots = {}
  for (const d of items) {
    const place = STORAGE_OF[d.storage]
    if (!place || d.amount <= 0) continue
    if (place === 'account') account[d.slot] = held(d)
    else own[`${d.storage}:${d.slot}`] = held(d)
  }
  return { own, account }
}

/** Slots said anew (`inventorySlots`): set, or emptied at 0. The character's and the account's. */
export function applySlots(inv: Inventories, id: string, who: { name: string; server: number | null }, at: number, changes: DepotItem[]): Inventories {
  const own: Slots = { ...(inv.characters[id]?.slots ?? {}) }
  const account: Slots = { ...(inv.account?.slots ?? {}) }
  let accountChanged = false
  for (const d of changes) {
    const place = STORAGE_OF[d.storage]
    if (!place) continue
    const into = place === 'account' ? account : own
    const key = place === 'account' ? String(d.slot) : `${d.storage}:${d.slot}`
    if (place === 'account') accountChanged = true
    if (d.amount > 0) into[key] = held(d)
    else delete into[key]
  }
  return {
    characters: { ...inv.characters, [id]: { name: who.name, server: who.server, at, slots: own } },
    account: accountChanged ? { at, slots: account } : inv.account,
  }
}

/** The slots of one place: a character's (worn, bag...) or the account's warehouse. By slot number. */
export function placeSlots(inv: Inventories, c: CharacterInventory | null, place: Place): Record<number, SlotItem> {
  if (place === 'account') return Object.fromEntries(Object.entries(inv.account?.slots ?? {}).map(([k, v]) => [Number(k), v]))
  const prefix = `${STORAGE_BYTE[place]}:`
  return Object.fromEntries(Object.entries(c?.slots ?? {}).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [Number(k.slice(prefix.length)), v]))
}

/** A place's items together: by item id, how many (the stacks of one item added up). */
export function placeItems(slots: Record<number, SlotItem>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of Object.values(slots)) out[s.item] = (out[s.item] ?? 0) + s.amount
  return out
}

/** Where an item is, everywhere: [character name or null for the account's warehouse, place, how many], the most first. */
export function whereIs(inv: Inventories, id: string): [string | null, Place, number][] {
  const out: [string | null, Place, number][] = []
  for (const c of Object.values(inv.characters))
    for (const p of PLACES) {
      if (p.id === 'account') continue
      const n = placeItems(placeSlots(inv, c, p.id))[id]
      if (n) out.push([c.name, p.id, n])
    }
  const n = placeItems(placeSlots(inv, null, 'account'))[id]
  if (n) out.push([null, 'account', n])
  return out.sort((a, b) => b[2] - a[2])
}

/**
 * What you wear, laid out as the game's equipment window: two columns, row by row, each slot by its
 * number (the owner's Nayell, 2026-11-23): weapon and off-hand, helm and pauldrons, breastplate and
 * belt, greaves and gloves, cloak and boots, the earrings, necklace and amulet, the rings, the
 * bracelets, the runes.
 */
export const WORN_LAYOUT: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 17],
  [6, 7],
  [19, 8],
  [11, 12],
  [10, 22],
  [13, 14],
  [15, 16],
  [23, 24],
]
