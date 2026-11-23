/**
 * Your characters' items (shared/inventory.ts), from each login's whole item list (the engine's
 * `inventory` event): kept in `<userData>/inventory.json`, sent to the windows as they change.
 */
import { app } from 'electron'
import { readFileSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { characterId } from '../shared/characters.ts'
import { NO_INVENTORIES, sortItems, type Inventories } from '../shared/inventory.ts'

let inventories: Inventories = NO_INVENTORIES
const file = (): string => join(app.getPath('userData'), 'inventory.json')

function load(): void {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Inventories>
    inventories = { characters: saved.characters ?? {}, account: saved.account ?? null }
  } catch {
    inventories = NO_INVENTORIES // none saved yet, or unreadable: start empty
  }
}

export const inventoryStore = {
  all: (): Inventories => inventories,
}

export function startInventory(): void {
  load()
  tracker.onEvent('inventory', (ev) => {
    const name = ev['name'] as string | null
    if (!name) return
    const server = (ev['server'] as number | null) ?? null
    const at = (ev['ts'] as number | undefined) ?? Date.now()
    const { own, account } = sortItems((ev['items'] as { storage: number; item: number; amount: number }[] | undefined) ?? [])
    const id = server !== null ? characterId(server, name) : name
    inventories = {
      characters: { ...inventories.characters, [id]: { name, server, at, items: own } },
      // Every login lists the account's warehouse: the latest is it.
      account: Object.keys(account).length || !inventories.account ? { at, items: account } : inventories.account,
    }
    log(`inventory: ${name}'s, ${Object.values(own).reduce((n, p) => n + Object.keys(p ?? {}).length, 0)} items; the account's warehouse, ${Object.keys(account).length}`)
    broadcast('inventory:changed', inventories)
    writeFile(file(), JSON.stringify(inventories), () => {})
  })
}
