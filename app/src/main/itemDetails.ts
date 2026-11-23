/**
 * An equipment's base stats and enchantment bonuses (shared/equipment.ts ItemDetails), from
 * questlog.gg's item database: asked the first time the Inventory page shows the item's window,
 * then kept in `<userData>/itemdetails/<id>.json`. The windows have no network (index.ts
 * blockNetwork): they ask through here, for an item id only.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './tracker.ts'
import type { ItemDetails } from '../shared/equipment.ts'

const API = 'https://questlog.gg/aion-2/api/trpc'
const HEADERS = { 'user-agent': 'aion2-drop-tracker (personal pet collection tracker)', accept: 'application/json' }
const asked = new Map<string, Promise<ItemDetails | null>>()
/** What a kept file holds: the details, as first kept (an older app's had no soulMax: asked again). */
const complete = (d: ItemDetails): boolean => d.soulMax !== undefined

interface QuestlogItem {
  equipmentInfo?: { itemLevel?: number }
  itemStats?: { mainStats?: Record<string, number>; enchants?: { level: number; stats: Record<string, { value: number }> }[]; subStats?: { id: string; maxValue: number }[] }
}

async function fetchDetails(id: string): Promise<ItemDetails | null> {
  const dir = join(app.getPath('userData'), 'itemdetails')
  const file = join(dir, `${id}.json`)
  if (existsSync(file)) {
    const kept = JSON.parse(readFileSync(file, 'utf8')) as ItemDetails
    if (complete(kept)) return kept
  }
  const res = await fetch(`${API}/database.getItem?input=${encodeURIComponent(JSON.stringify({ language: 'en', id }))}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const item = ((await res.json()) as { result?: { data?: QuestlogItem | null } }).result?.data
  if (!item) return null
  const details: ItemDetails = {
    itemLevel: item.equipmentInfo?.itemLevel ?? null,
    main: item.itemStats?.mainStats ?? {},
    enchants: Object.fromEntries((item.itemStats?.enchants ?? []).map((e) => [e.level, Object.fromEntries(Object.entries(e.stats).map(([k, s]) => [k, s.value]))])),
    soulMax: Object.fromEntries((item.itemStats?.subStats ?? []).map((s) => [s.id, s.maxValue])),
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(details))
  return details
}

/** The item's details, kept or asked once; null when questlog has none (or could not be reached). */
export function itemDetails(id: number): Promise<ItemDetails | null> {
  const key = String(Math.trunc(id))
  if (!/^\d{9}$/.test(key)) return Promise.resolve(null)
  let p = asked.get(key)
  if (!p) {
    p = fetchDetails(key).catch((err: unknown) => {
      log(`item details: ${key}: ${String(err)}`)
      asked.delete(key)
      return null
    })
    asked.set(key, p)
  }
  return p
}
