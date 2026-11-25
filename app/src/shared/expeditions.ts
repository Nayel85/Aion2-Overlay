/**
 * Expeditions and their guaranteed chest: each cube opened at the end of a run counts, and after as
 * many as its ceiling (questlog's, the catalogue's instanceCeiling) the next chest is a pick from the
 * dungeon's set. Counted per character and per mode: Exploration (`easy`), Conquest Normal (`normal`) and
 * Conquest Hard (`advanced`), the catalogue's (shared/instances.ts).
 */
import { CONTENT, INSTANCES, instanceAt, instanceCeiling } from './instances.ts'

/** By character id: their name, when the game last said, and the cubes toward each expedition's chest (by world id). */
export type Expeditions = Record<string, { name: string; at: number; cubes: Record<string, number> }>

export type ExpeditionMode = 'easy' | 'normal' | 'advanced'
export const EXPEDITION_MODES = CONTENT.expedition.modes as { id: ExpeditionMode; label: string; short: string }[]

/** The expeditions open in the game, in its order: the rest come with later updates. */
export const OPEN_EXPEDITIONS = INSTANCES.expedition.filter((i) => i.open).map((i) => i.name)

export interface ExpeditionCell {
  /** Cubes opened toward its chest, or null: the game did not list it for this character. */
  cubes: number | null
  ceiling: number
  /** Runs (cubes) still to go; 0: the chest is due. */
  left: number | null
}

/** An expedition's mode for a character: its cubes of its ceiling, or null when it has no such mode (or no chest). */
export function expeditionCell(cubes: Record<string, number> | undefined, name: string, mode: ExpeditionMode): ExpeditionCell | null {
  const instance = INSTANCES.expedition.find((i) => i.name === name)
  const ceiling = instance && instanceCeiling(instance, mode)
  if (!instance || !ceiling) return null
  const n = cubes?.[instance.worlds[mode]!]
  return n === undefined ? { cubes: null, ceiling, left: null } : { cubes: n, ceiling, left: Math.max(0, ceiling - n) }
}

/** The expeditions to show: the open ones, and any other a character's list has (a later update's). */
export function shownExpeditions(all: Expeditions): string[] {
  const listed = new Set(
    Object.values(all)
      .flatMap((c) => Object.keys(c.cubes))
      .map((w) => instanceAt(Number(w))?.instance)
      .filter((i) => i?.kind === 'expedition')
      .map((i) => i!.name),
  )
  return [...OPEN_EXPEDITIONS, ...[...listed].filter((n) => !OPEN_EXPEDITIONS.includes(n))]
}
