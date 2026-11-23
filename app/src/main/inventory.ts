/**
 * Your characters' items (shared/inventory.ts), slot by slot: each login's whole list (the engine's
 * `inventory` event) and each change after it (`inventorySlots`). Kept in `<userData>/inventory.json`
 * (a moment after a change: loot comes in bursts), sent to the windows as they change.
 */
import { app } from 'electron'
import { readFileSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { characterId } from '../shared/characters.ts'
import { applySlots, fromList, NO_INVENTORIES, type DepotItem, type Inventories } from '../shared/inventory.ts'

const SAVE_AFTER_MS = 3000
let inventories: Inventories = NO_INVENTORIES
let saveTimer: NodeJS.Timeout | null = null
const file = (): string => join(app.getPath('userData'), 'inventory.json')

function load(): void {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Inventories>
    // Lists kept before the slots were (items by place): dropped, the next login lists them again.
    const characters = Object.fromEntries(Object.entries(saved.characters ?? {}).filter(([, c]) => c && typeof c === 'object' && 'slots' in c))
    inventories = { characters, account: saved.account && 'slots' in saved.account ? saved.account : null }
  } catch {
    inventories = NO_INVENTORIES // none saved yet, or unreadable: start empty
  }
}

function changed(): void {
  broadcast('inventory:changed', inventories)
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    writeFile(file(), JSON.stringify(inventories), () => {})
  }, SAVE_AFTER_MS)
}

export const inventoryStore = {
  all: (): Inventories => inventories,
}

/** The character an event is about: their id, name and server. */
function whose(ev: Record<string, unknown>): { id: string; name: string; server: number | null } | null {
  const name = ev['name'] as string | null
  if (!name) return null
  const server = (ev['server'] as number | null) ?? null
  return { id: server !== null ? characterId(server, name) : name, name, server }
}

export function startInventory(): void {
  load()
  // A login: all of it, anew.
  tracker.onEvent('inventory', (ev) => {
    const who = whose(ev)
    if (!who) return
    const at = (ev['ts'] as number | undefined) ?? Date.now()
    const { own, account } = fromList((ev['items'] as DepotItem[] | undefined) ?? [])
    inventories = {
      characters: { ...inventories.characters, [who.id]: { name: who.name, server: who.server, at, slots: own } },
      // Every login lists the account's warehouse: the latest is it.
      account: Object.keys(account).length || !inventories.account ? { at, slots: account } : inventories.account,
    }
    log(`inventory: ${who.name}'s, ${Object.keys(own).length} slots; the account's warehouse, ${Object.keys(account).length}`)
    changed()
  })
  // An item moved, came or went: its slots anew.
  tracker.onEvent('inventorySlots', (ev) => {
    const who = whose(ev)
    if (!who) return
    inventories = applySlots(inventories, who.id, who, (ev['ts'] as number | undefined) ?? Date.now(), (ev['slots'] as DepotItem[] | undefined) ?? [])
    changed()
  })
}
