/**
 * Expeditions and their guaranteed chest: each cube opened at the end of a run counts, and after as
 * many as its ceiling (EXPEDITION_CEILINGS, questlog's) the next chest is a pick from the dungeon's
 * set. Counted per character and per mode: Exploration (`easy`), Conquest Normal (`normal`) and
 * Conquest Hard (`advanced`).
 */
import { EXPEDITION_CEILINGS } from './expeditionCeilings.ts'
import { ZONES } from './zones.ts'

/** By character id: their name, when the game last said, and the cubes toward each expedition's chest (by world id). */
export type Expeditions = Record<string, { name: string; at: number; cubes: Record<string, number> }>

export type ExpeditionMode = 'exploration' | 'conquest' | 'advanced'
export const EXPEDITION_MODES: { id: ExpeditionMode; label: string; short: string }[] = [
  { id: 'exploration', label: 'Exploration', short: 'Exp' },
  { id: 'conquest', label: 'Conquest Normal', short: 'Normal' },
  { id: 'advanced', label: 'Conquest Hard', short: 'Hard' },
]
const MODE_OF: Record<string, ExpeditionMode> = { easy: 'exploration', normal: 'conquest', advanced: 'advanced' }

/** The expeditions open in the game (the global client, 2026-11-24), in its order (its tiers): the rest come with later updates. */
export const OPEN_EXPEDITIONS = ['Krao Cave', 'Draupnir', 'Urugugu Canyon', 'Vakron Sky Island', 'Fire Temple', 'Ferocious Horn Den']

/** Each expedition's modes, by name: the world of each (those with a guaranteed chest). */
const WORLDS = new Map<string, Partial<Record<ExpeditionMode, number>>>()
for (const w of Object.keys(EXPEDITION_CEILINGS)) {
  const zone = ZONES[w]
  const mode = zone && MODE_OF[zone[3] ?? '']
  if (!zone || !mode) continue
  WORLDS.set(zone[0], { ...WORLDS.get(zone[0]), [mode]: Number(w) })
}

export interface ExpeditionCell {
  /** Cubes opened toward its chest, or null: the game did not list it for this character. */
  cubes: number | null
  ceiling: number
  /** Runs (cubes) still to go; 0: the chest is due. */
  left: number | null
}

/** An expedition's mode for a character: its cubes of its ceiling, or null when it has no such mode. */
export function expeditionCell(cubes: Record<string, number> | undefined, name: string, mode: ExpeditionMode): ExpeditionCell | null {
  const world = WORLDS.get(name)?.[mode]
  if (world === undefined) return null
  const ceiling = EXPEDITION_CEILINGS[world]!
  const n = cubes?.[world]
  return n === undefined ? { cubes: null, ceiling, left: null } : { cubes: n, ceiling, left: Math.max(0, ceiling - n) }
}

/** The expeditions to show: the open ones, and any other a character's list has (a later update's). */
export function shownExpeditions(all: Expeditions): string[] {
  const listed = new Set(
    Object.values(all)
      .flatMap((c) => Object.keys(c.cubes))
      .map((w) => ZONES[w]?.[0])
      .filter((n): n is string => !!n && WORLDS.has(n)),
  )
  return [...OPEN_EXPEDITIONS, ...[...listed].filter((n) => !OPEN_EXPEDITIONS.includes(n))]
}
