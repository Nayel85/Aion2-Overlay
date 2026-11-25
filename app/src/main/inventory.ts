/**
 * Your characters' items (shared/inventory.ts), slot by slot: each login's whole list (the engine's
 * `inventory` event) and each change after it (`inventorySlots`). Kept in `<userData>/inventory.json`
 * (a moment after a change: loot comes in bursts), sent to the windows as they change.
 *
 * What comes in is journaled (`<userData>/inventory-log.jsonl`): each character's items held (with
 * the account's warehouse) before and after a burst of changes, the more of them an arrival, with
 * where it came from when an event said so just before or after (a Hidden Cube opened, a dungeon's
 * cube, a box, a duty mission); a login's list, against the one kept, what came while the app was off.
 */
import { dataFile } from './dataFile.ts'
import { app } from 'electron'
import { appendFile, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { characterId } from '../shared/characters.ts'
import { addChanges, applySlots, fromList, heldItems, NO_INVENTORIES, type Arrival, type ArrivalSource, type DepotItem, type Inventories } from '../shared/inventory.ts'

const SAVE_AFTER_MS = 3000
let inventories: Inventories = NO_INVENTORIES
const file = dataFile('inventory.json', SAVE_AFTER_MS)

/** The arrivals kept to show (the journal on disk keeps them all). */
const ARRIVALS_KEPT = 1000
/** A burst of changes: what moved within it nets out (an item out of one slot, into another). */
const SETTLE_MS = 2000
/** An event this close to an arrival is where it came from. */
const SOURCE_MS = 10_000
/** More kinds of items than this at once is a place listed again, not loot. */
const BURST_MAX = 30
let arrivals: Arrival[] = []
const journal = (): string => join(app.getPath('userData'), 'inventory-log.jsonl')
const arrivalListeners = new Set<(a: Arrival) => void>()
/** Where things came from, as the events said: the latest few. */
let sources: { source: ArrivalSource; at: number }[] = []
/** Each character's burst going on: what came and went, from when. */
const pending = new Map<string, { name: string; first: number; changes: Record<string, number>; timer: NodeJS.Timeout }>()

function loadArrivals(): void {
  try {
    const lines = readFileSync(journal(), 'utf8').split('\n').filter(Boolean).slice(-ARRIVALS_KEPT)
    arrivals = lines.flatMap((l) => {
      try {
        return [JSON.parse(l) as Arrival]
      } catch {
        return [] // a line cut short (closed while writing): skipped
      }
    })
  } catch {
    arrivals = [] // none yet
  }
}

function record(a: Arrival): void {
  arrivals.push(a)
  if (arrivals.length > ARRIVALS_KEPT) arrivals = arrivals.slice(-ARRIVALS_KEPT)
  appendFile(journal(), JSON.stringify(a) + '\n', () => {})
  log(`inventory: ${a.name} got ${JSON.stringify(a.items)}${a.source ? ` (${a.source})` : ''}`)
  broadcast('inventory:arrival', a)
  for (const fn of arrivalListeners) fn(a)
}

function noteSource(source: ArrivalSource): void {
  const at = Date.now()
  sources = [...sources.filter((s) => at - s.at < SOURCE_MS * 2), { source, at }]
}
/** Where what came at `at` came from: a Hidden Cube opened about then above all (its loot may come as a cube's), else the latest event about then. */
function sourceAt(at: number): ArrivalSource | null {
  const near = sources.filter((s) => Math.abs(s.at - at) <= SOURCE_MS)
  return near.find((s) => s.source === 'hiddencube')?.source ?? near.at(-1)?.source ?? null
}

/** A character's burst over: what they hold more of came. */
function settle(id: string): void {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  const items = Object.fromEntries(Object.entries(p.changes).filter(([, n]) => n > 0))
  const kinds = Object.keys(items).length
  if (!kinds) return
  if (kinds > BURST_MAX) return log(`inventory: ${p.name}'s ${kinds} kinds of items listed again, not journaled`)
  record({ at: p.first, character: id, name: p.name, items, source: sourceAt(p.first) })
}

function load(): void {
  const saved = file.read() as Partial<Inventories> | null
  if (!saved) return void (inventories = NO_INVENTORIES) // none saved yet, or unreadable: start empty
  // Lists kept before the slots were (items by place): dropped, the next login lists them again.
  const characters = Object.fromEntries(Object.entries(saved.characters ?? {}).filter(([, c]) => c && typeof c === 'object' && 'slots' in c))
  inventories = { characters, account: saved.account && 'slots' in saved.account ? saved.account : null }
}

function changed(): void {
  broadcast('inventory:changed', inventories)
  file.save(() => inventories)
}

export const inventoryStore = {
  all: (): Inventories => inventories,
  arrivals: (): Arrival[] => arrivals,
}

/** Items that came, as they are journaled. */
export function onArrival(fn: (a: Arrival) => void): () => void {
  arrivalListeners.add(fn)
  return () => arrivalListeners.delete(fn)
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
  loadArrivals()
  // Where what comes next comes from. A Hidden Cube in view opened (by you, or by someone near: only
  // what comes into your bags about then makes it yours).
  tracker.onEvent('cubeOpened', (ev) => {
    const you = tracker.nearby().position
    const at = ev['position'] as [number, number] | undefined
    log(`hidden cube ${ev['id'] as number} opened${you && at ? `, ${Math.round(Math.hypot(you[0] - at[0], you[1] - at[1]))} from you` : ''}`)
    noteSource('hiddencube')
  })
  tracker.onEvent('loot', () => noteSource('cube'))
  tracker.onEvent('boxOpened', () => noteSource('box'))
  tracker.onEvent('dutyDone', () => noteSource('duty'))
  // A login: all of it, anew.
  tracker.onEvent('inventory', (ev) => {
    const who = whose(ev)
    if (!who) return
    const at = (ev['ts'] as number | undefined) ?? Date.now()
    const { own, account } = fromList((ev['items'] as DepotItem[] | undefined) ?? [])
    // Against the list kept, what came while the app was off (theirs alone: the account's warehouse
    // changes with the other characters).
    const kept = inventories.characters[who.id]
    if (kept && Object.keys(kept.slots).length) {
      const changes: Record<string, number> = {}
      addChanges(changes, heldItems(inventories, who.id, false), heldItems({ characters: { [who.id]: { ...kept, slots: own } }, account: null }, who.id, false))
      const items = Object.fromEntries(Object.entries(changes).filter(([, n]) => n > 0))
      if (Object.keys(items).length) record({ at: Date.now(), character: who.id, name: who.name, items, source: 'away', since: kept.at })
    }
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
    const before = heldItems(inventories, who.id, true)
    inventories = applySlots(inventories, who.id, who, (ev['ts'] as number | undefined) ?? Date.now(), (ev['slots'] as DepotItem[] | undefined) ?? [])
    // A burst's changes, netted once it is over.
    const p = pending.get(who.id) ?? { name: who.name, first: Date.now(), changes: {}, timer: setTimeout(() => settle(who.id), SETTLE_MS) }
    addChanges(p.changes, before, heldItems(inventories, who.id, true))
    pending.set(who.id, p)
    changed()
  })
}
