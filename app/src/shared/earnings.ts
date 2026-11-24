/**
 * Something earned this session, and per hour: what Kina (shared/kina.ts) and Abyss Points
 * (shared/abyss.ts) both count. Each gain adds up; the hour counts active time only: a gap between
 * gains counts up to IDLE_MS, so a break in town does not drag the rate down, and the rate stops
 * falling once you stop.
 */

import { compact } from './format.ts'

export interface Earnings {
  earned: number
  /** Active time between the gains so far (see IDLE_MS). */
  activeMs: number
  /** When the last gain came: the active time runs on from here. */
  lastAt: number | null
  /** Each gain as [when, how much], the last HISTORY_MS of them: the timeline. */
  gains: [number, number][]
}

export const NO_EARNINGS: Earnings = { earned: 0, activeMs: 0, lastAt: null, gains: [] }

/** How far back the timeline goes. */
export const HISTORY_MS = 30 * 60_000
/** Each point of the timeline is the rate over this long before it. */
export const WINDOW_MS = 5 * 60_000
const STEP_MS = 60_000

/** The most a gap between gains counts towards the hour. */
export const IDLE_MS = 5 * 60_000
/** No rate before this much active time: one kill's worth is not an hourly rate. */
export const MIN_MS = 60_000

/** A gain of `gain` at `now`. */
export function earn<S extends Earnings>(s: S, gain: number, now: number): S {
  if (gain <= 0) return s
  const gap = s.lastAt === null ? 0 : Math.min(Math.max(now - s.lastAt, 0), IDLE_MS)
  const gains = [...s.gains.filter(([at]) => at > now - HISTORY_MS - WINDOW_MS), [now, gain] as [number, number]]
  return { ...s, earned: s.earned + gain, activeMs: s.activeMs + gap, lastAt: now, gains }
}

/**
 * Up to `amount` of the gains from `from` to `to` were a reward (a supply request's, a duty
 * mission's), not farming: taken off, the latest first. The rates count farming only.
 */
export function unearn<S extends Earnings>(s: S, amount: number, from: number, to: number): S {
  let left = amount
  const gains = s.gains.map(([at, g]): [number, number] => [at, g])
  for (let i = gains.length - 1; i >= 0 && left > 0; i--) {
    const [at, g] = gains[i]!
    if (at < from || at > to) continue
    const off = Math.min(g, left)
    gains[i] = [at, g - off]
    left -= off
  }
  const taken = amount - left
  return taken ? { ...s, earned: Math.max(0, s.earned - taken), gains: gains.filter(([, g]) => g > 0) } : s
}

/** Earned per hour at `now`, or null before there is enough to tell. */
export function perHour(s: Earnings, now: number): number | null {
  if (!s.earned || s.lastAt === null) return null
  const ms = s.activeMs + Math.min(Math.max(now - s.lastAt, 0), IDLE_MS)
  return ms < MIN_MS ? null : (s.earned / ms) * 3_600_000
}

/** The live rate looks back this far. */
export const LIVE_MS = 15_000

/** The pace of the last LIVE_MS as an hourly rate: what an hour at that speed would earn; 0 when nothing came in it. */
export function livePerHour(s: Earnings, now: number): number {
  const sum = s.gains.reduce((n, [at, g]) => (at > now - LIVE_MS && at <= now ? n + g : n), 0)
  return (sum / LIVE_MS) * 3_600_000
}

export interface EarnedPoint {
  at: number
  /** Earned per hour over the WINDOW_MS before `at`. */
  perHour: number
}

/**
 * The timeline: a point a minute over the last HISTORY_MS (from the first gain, if later), each
 * the rate over the 5 minutes before it, so a lull shows as a dip and a break as zero. Empty until
 * there are two points.
 */
export function series(s: Earnings, now: number): EarnedPoint[] {
  const first = s.gains[0]?.[0]
  if (first === undefined) return []
  const out: EarnedPoint[] = []
  for (let at = now; at >= Math.max(now - HISTORY_MS, first); at -= STEP_MS) {
    const sum = s.gains.reduce((n, [t, g]) => (t > at - WINDOW_MS && t <= at ? n + g : n), 0)
    out.push({ at, perHour: (sum / WINDOW_MS) * 3_600_000 })
  }
  return out.length < 2 ? [] : out.reverse()
}

/** 950, 12.3k, 1.25M. */
/** Amounts as every number in short (shared/format.ts): 1.92K, 12.3M. */
export const formatAmount = compact
