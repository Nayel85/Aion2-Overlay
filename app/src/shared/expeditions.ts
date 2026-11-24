/**
 * Expeditions and their guaranteed chest: each cube opened at the end of a run counts, and after as
 * many as its ceiling (EXPEDITION_CEILINGS, questlog's) the next chest is a pick from the dungeon's
 * set. Counted per character and per mode: Exploration (`easy`), Conquest (`normal`), Advanced.
 */
import { EXPEDITION_CEILINGS } from './expeditionCeilings.ts'
import { ZONES } from './zones.ts'

/** By character id: their name, when the game last said, and the cubes toward each expedition's chest (by world id). */
export type Expeditions = Record<string, { name: string; at: number; cubes: Record<string, number> }>

export type ExpeditionMode = 'exploration' | 'conquest' | 'advanced'
export const EXPEDITION_MODES: { id: ExpeditionMode; label: string }[] = [
  { id: 'exploration', label: 'Exploration' },
  { id: 'conquest', label: 'Conquest' },
  { id: 'advanced', label: 'Advanced' },
]
const MODE_OF: Record<string, ExpeditionMode> = { easy: 'exploration', normal: 'conquest', advanced: 'advanced' }

export interface ExpeditionRow {
  name: string
  /** By mode: its world, the cubes opened toward its chest, how many it takes, how many more. */
  modes: Partial<Record<ExpeditionMode, { world: number; cubes: number; ceiling: number; left: number }>>
}

/** A character's expeditions by dungeon, in the game's order (by world id), each mode the game listed. */
export function expeditionRows(cubes: Record<string, number>): ExpeditionRow[] {
  const rows = new Map<string, ExpeditionRow>()
  for (const [w, n] of Object.entries(cubes).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const ceiling = EXPEDITION_CEILINGS[w]
    const zone = ZONES[w]
    const mode = zone && MODE_OF[zone[3] ?? '']
    if (!ceiling || !zone || !mode) continue
    const row = rows.get(zone[0]) ?? { name: zone[0], modes: {} }
    row.modes[mode] = { world: Number(w), cubes: n, ceiling, left: Math.max(0, ceiling - n) }
    rows.set(zone[0], row)
  }
  return [...rows.values()]
}
