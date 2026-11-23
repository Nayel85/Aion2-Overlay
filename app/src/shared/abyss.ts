/**
 * Abyss Points: this session's, per hour (shared/earnings.ts, as Kina), and the rift farms.
 *
 * The engine reads the week's total the game sends with every gain (`ab ff`) and tells each gain,
 * by character (a login's total is only a start: engine/src/tracker/mod.rs `abyss_read`). Every
 * gain is kept (main/abyss.ts), so the farms can be told after the fact:
 *
 * A rift farm is what one character earned during a Spacetime Rift: from its opening (the
 * Event Alerts' rift timer, shared/timers.ts) until 1 h 10 min after, when it is really over, on the
 * continents (not the Abyss's corridors, done at the same time: RIFT_WORLDS). Only
 * those that earned at least RIFT_MIN_POINTS are listed, so a rift you skipped (a quest's few
 * points in its window) does not show.
 */
import { NO_EARNINGS, type Earnings } from './earnings.ts'
import { TIMERS } from './timers.ts'

export interface AbyssSession extends Earnings {
  /** The week's total and its limit as the game last said; null until it has. */
  points: number | null
  limit: number | null
  /** The season going on (see `currentSeason`): attached by main, null while none is. */
  season: AbyssSeason | null
}

export const NO_ABYSS: AbyssSession = { ...NO_EARNINGS, points: null, limit: null, season: null }

/**
 * A season is one stretch of earning Abyss Points: it ends when this long passes with none. It is
 * the player's own farming spell, apart from the rift farms (a rift's window).
 */
export const SEASON_GAP_MS = 15 * 60_000

export interface AbyssSeason {
  /** Earned in it. */
  points: number
  start: number
  /** The last gain: the season is over once SEASON_GAP_MS has passed since. */
  last: number
}

/** The season the last gain belongs to (that character's gains, each within SEASON_GAP_MS of the one before). */
export function currentSeason(gains: readonly AbyssGain[]): AbyssSeason | null {
  const end = gains[gains.length - 1]
  if (!end) return null
  let points = 0
  let start = end[0]
  let prev = end[0]
  for (let i = gains.length - 1; i >= 0; i--) {
    const [at, gained, name] = gains[i]!
    if (name !== end[2]) continue
    if (prev - at > SEASON_GAP_MS) break
    points += gained
    start = at
    prev = at
  }
  return { points, start, last: end[0] }
}

/** One gain as kept: when, how much, whose (null: no character known yet), and in which zone (the
 *  world id; null or missing when not known: gains kept before zones were). */
export type AbyssGain = [at: number, gained: number, name: string | null, world?: number | null]

/**
 * Where a Spacetime Rift is farmed: the continents' zones (Verteron, Eltnen, Altgard, Morheim: the
 * map data's elyos and asmodians worlds), never the Abyss (Lower and Middle Reshanta, 20 and 22),
 * where the corridors are. A gain in another known zone during a rift's window is not the rift's.
 */
export const RIFT_WORLDS: ReadonlySet<number> = new Set([1010, 1011, 1110, 1111])

/** A rift's window: from its opening until it is really over. */
export const RIFT_MS = 70 * 60_000
/** The least a rift's window must have earned to be listed as a farm. */
export const RIFT_MIN_POINTS = 1000

export interface RiftFarm {
  /** When the rift opened (ms). */
  start: number
  name: string | null
  points: number
  /** The window's first and last gain. */
  first: number
  last: number
  /** Each gain in it, as [when, how much] (the PvP page lists what each kill or assist earned). */
  gains: [number, number][]
}

const RIFT = TIMERS.find((t) => t.id === 'rift')!.schedule
if (RIFT.kind !== 'every') throw new Error('the rift timer is expected every few hours')
const PERIOD_MS = RIFT.every * 60_000
const OFFSET_MS = RIFT.offset * 60_000

/** The opening of the rift whose window `at` falls in, or null (between two rifts). */
export function riftOf(at: number): number | null {
  const start = Math.floor((at - OFFSET_MS) / PERIOD_MS) * PERIOD_MS + OFFSET_MS
  return at - start < RIFT_MS ? start : null
}

/** The rift farms in `gains` (oldest first), newest first. */
export function riftFarms(gains: readonly AbyssGain[]): RiftFarm[] {
  const farms = new Map<string, RiftFarm>()
  for (const [at, gained, name, world] of gains) {
    const start = riftOf(at)
    if (start === null) continue
    if (world !== undefined && world !== null && !RIFT_WORLDS.has(world)) continue
    const key = `${start}|${name ?? ''}`
    const farm = farms.get(key)
    if (farm) {
      farm.points += gained
      farm.first = Math.min(farm.first, at)
      farm.last = Math.max(farm.last, at)
      farm.gains.push([at, gained])
    } else farms.set(key, { start, name, points: gained, first: at, last: at, gains: [[at, gained]] })
  }
  return [...farms.values()].filter((f) => f.points >= RIFT_MIN_POINTS).sort((a, b) => b.start - a.start)
}

/** The Abyss Points follow a kill's credit by a moment: how long after it, and how long before (clocks drift). */
export const AP_AFTER_MS = 6_000
export const AP_BEFORE_MS = 1_500

/**
 * What each kill or assist earned: every gain goes to the nearest event it follows within a few
 * seconds. Gains no event explains (a quest, a monster) come back as `other`.
 */
export function attributeGains<T extends { at: number }>(gains: readonly [number, number][], events: readonly T[]): { byEvent: Map<T, number>; other: number } {
  const byEvent = new Map<T, number>()
  let other = 0
  for (const [at, gained] of gains) {
    let best: T | null = null
    let bestGap = Infinity
    for (const e of events) {
      const gap = at - e.at
      if (gap < -AP_BEFORE_MS || gap > AP_AFTER_MS) continue
      if (Math.abs(gap) < bestGap) {
        best = e
        bestGap = Math.abs(gap)
      }
    }
    if (best) byEvent.set(best, (byEvent.get(best) ?? 0) + gained)
    else other += gained
  }
  return { byEvent, other }
}
