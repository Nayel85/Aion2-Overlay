/**
 * What your characters have, as the game lists it at each login (the engine's `inventory` event,
 * `11 56`): each character's bag, what they wear, their Arcana and their own warehouse, and the
 * account's shared warehouse (the same for all, the latest login's). Kept as of each one's last
 * login, by item id with how many.
 */

/** Where an item lies: the storage byte of the game's list (engine DEPOT_STORAGES). */
export type Storage = 'bag' | 'worn' | 'arcana' | 'warehouse'
export const STORAGE_OF: Record<number, Storage | 'account'> = { 1: 'bag', 2: 'account', 11: 'worn', 14: 'arcana', 15: 'warehouse' }
/** The places, as the Inventory page names them, in its order. */
export const PLACES: { id: Storage | 'account'; label: string }[] = [
  { id: 'bag', label: 'Bag' },
  { id: 'worn', label: 'Equipped' },
  { id: 'warehouse', label: 'Personal warehouse' },
  { id: 'arcana', label: 'Arcana' },
  { id: 'account', label: 'Account warehouse' },
]

/** A character's items as of their last login: by place, then item id, how many. */
export interface CharacterInventory {
  name: string
  server: number | null
  at: number
  items: Partial<Record<Storage, Record<string, number>>>
}
export interface Inventories {
  /** By character id (characters.ts characterId). */
  characters: Record<string, CharacterInventory>
  /** The account's shared warehouse, as the latest login listed it. */
  account: { at: number; items: Record<string, number> } | null
}
export const NO_INVENTORIES: Inventories = { characters: {}, account: null }

/** A login's list, sorted into its places: the character's own, and the account's warehouse. */
export function sortItems(items: { storage: number; item: number; amount: number }[]): { own: CharacterInventory['items']; account: Record<string, number> } {
  const own: CharacterInventory['items'] = {}
  const account: Record<string, number> = {}
  for (const { storage, item, amount } of items) {
    const place = STORAGE_OF[storage]
    if (!place) continue
    const into = place === 'account' ? account : (own[place] ??= {})
    into[item] = (into[item] ?? 0) + amount
  }
  return { own, account }
}

/** Where an item is, everywhere: [character name or null for the account's warehouse, place, how many], the most first. */
export function whereIs(inv: Inventories, id: string): [string | null, Storage | 'account', number][] {
  const out: [string | null, Storage | 'account', number][] = []
  for (const c of Object.values(inv.characters))
    for (const [place, items] of Object.entries(c.items) as [Storage, Record<string, number>][]) if (items[id]) out.push([c.name, place, items[id]!])
  if (inv.account?.items[id]) out.push([null, 'account', inv.account.items[id]!])
  return out.sort((a, b) => b[2] - a[2])
}
