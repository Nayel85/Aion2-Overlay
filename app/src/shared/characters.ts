/**
 * Your characters: every one the character selection screen listed, and what the game said about
 * each at its last login (its counters: Odyle energy, entry counts...), and of the one playing as
 * they change (a Nightmare or an Ascension Trial entered). Between those they are worked out from
 * the game's recharge times.
 *
 * Counter ids are the game's (the `0B 61` message at login, `0C 61` as one changes;
 * engine/src/tracker/protocol.rs `counters`), as matched against the owner's screens on 2026-10-31:
 * energy 60 + 155, Nightmare 11/14, Shugo keys 20/21. The Ascension Trial's entries left are
 * 80000001 (70000001 is its weekly cap, 3 either way) and Nightmare's values are [daily entries,
 * tickets], from a friend's captures (server 1406).
 */
import { currentRegion, lastStart, nextStart, TIMERS } from './timers.ts'

export interface CharacterCounters {
  /** When the game sent them (unix ms). */
  at: number
  /** By the game's id: its values (basic, then the recharged extra when there is any). */
  values: Record<string, number[]>
  /** By id, when the game said a counter changed since (a run entered): its value is from then. */
  changedAt?: Record<string, number>
}

export interface TrackedCharacter {
  name: string
  server: number
  /** NCSoft's key for the character (its portrait), from the character list. */
  key: string | null
  className: string | null
  level: number | null
  gearScore: number | null
  legion: string | null
  /** From NCSoft's site (the game sends only other players' combat power). */
  combatPower: number | null
  /** The portrait, as a data URL (downloaded once a day: the window loads only its own images). */
  portrait: string | null
  /** When NCSoft's site was last asked about them (combat power and portrait). */
  fetchedAt: number | null
  /** Where the character list had them (the game's order), and when it last did. */
  order: number
  listedAt: number | null
  /** Their counters at the last login the overlay saw; null until then. */
  counters: CharacterCounters | null
  /** What the game said of their Abyss corridors; missing until it said anything. */
  corridors?: CorridorLog
  /** Their Kina as last seen while they played (the balance the game sends); missing until then. */
  kina?: { balance: number; at: number }
  /** Their bound Kina, the same way. */
  boundKina?: { balance: number; at: number }
  /** The subscriptions the game listed at their last login (`3B E3`): each id and its end (unix ms). */
  subscriptions?: { list: { id: number; end: number }[]; at: number }
}

/** The subscriptions that are memberships, by id, as Abyss DPS Meter (v4.2.8) names them. */
export const MEMBERSHIPS: Record<number, string> = {
  1: 'Special Shugo Membership',
  3: 'Tsenka Membership',
  4: 'Special Quai Membership',
  5: 'Special Quai Membership',
  6: 'Special Quai Membership',
  7: 'Special Quai Membership',
}

/**
 * The account's memberships still running (one for all its characters, whatever their server), from
 * whichever character logged in last: one per name, the latest end, soonest to end first.
 */
export function membershipsNow(list: TrackedCharacter[], now: number): { name: string; end: number }[] {
  const latest = list.filter((c) => c.subscriptions).sort((a, b) => b.subscriptions!.at - a.subscriptions!.at)[0]
  const ends = new Map<string, number>()
  for (const s of latest?.subscriptions?.list ?? []) {
    const name = MEMBERSHIPS[s.id]
    if (name && s.end > now) ends.set(name, Math.max(ends.get(name) ?? 0, s.end))
  }
  return [...ends].map(([name, end]) => ({ name, end })).sort((a, b) => a.end - b.end)
}

/**
 * The Abyss's Artifact corridors, by the game's counter id: each has a passage time (130000 ms, the
 * "Passage Usage Time 02:10" the game shows) given when you enter the Abyss after a reset, and
 * taken away once you have done it ("Usage Time Expired"). Ids and order as the owner's 2026-11-01
 * logs and screens had them (Sulfur Tree Island proven, the other two by their order).
 */
export const CORRIDORS = [
  { id: '10000001', name: "Reshanta's Root" },
  { id: '10000002', name: 'Sulfur Tree Island' },
  { id: '10000003', name: "Archipelago of Siel's Wings" },
] as const
/** Your time in the Abyss: it ticks only while you are there. */
export const ABYSS_TIME = '3'
/**
 * The corridors come back as the Artifact siege starts: its days and hour on the server's clock
 * (Thursday and Saturday 21:00 in Europe; Monday too elsewhere), shared/timers.ts.
 */
const SIEGE = TIMERS.find((t) => t.id === 'siege')!.schedule

export interface CorridorLog {
  /** By corridor id: its passage time left (ms; 0 when there is none) and when the game said so. */
  left: Record<string, { ms: number; at: number }>
  /** When you were last in the Abyss (your Abyss time ticking). */
  abyssAt: number | null
}

/** When the corridors last came back (the player's region). */
export function corridorReset(now: number): number {
  return lastStart(SIEGE, now)
}

/** When they come back next. */
export function nextCorridorReset(now: number): number {
  return nextStart(SIEGE, now + 1, currentRegion())
}

/**
 * A corridor now: open (its passage time is there), done (none, and you were in the Abyss since
 * the reset, where it would have been given, or another corridor has its time), or unknown (not seen since the reset: likely open).
 */
export type CorridorState = 'open' | 'done' | 'unknown'

export function corridorStates(log: CorridorLog | undefined, now: number): CorridorState[] {
  const since = corridorReset(now)
  // The passage times are all given at once: one seen since the reset means they were, and one
  // without its time since then has been done.
  const given = (log?.abyssAt ?? 0) >= since || CORRIDORS.some(({ id }) => (log?.left[id]?.at ?? 0) >= since && log!.left[id]!.ms > 0)
  return CORRIDORS.map(({ id }) => {
    const seen = log?.left[id]
    if (!seen || seen.at < since) return 'unknown'
    if (seen.ms > 0) return 'open'
    return given ? 'done' : 'unknown'
  })
}

/** By `<server>:<name>`. */
export type Characters = Record<string, TrackedCharacter>

export const characterId = (server: number, name: string): string => `${server}:${name}`

export const portraitUrl = (server: number, key: string): string =>
  `https://profileimg.plaync.com/game_profile_images/aion2global/images?gameServerKey=${server}&charKey=${key}`

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * A counter that refills on a schedule: `per` every `every` ms from `offset` past 1970-01-01 00:00
 * UTC, up to `max` (a counter above it, from a purchase or an event, is left as it is).
 */
export interface Refill {
  id: string
  label: string
  max: number
  per: number
  every: number
  offset: number
  /** What the refill is called in the tooltip ("every 3 h"). */
  when: string
}

/**
 * Odyle energy: +15 every 3 hours at 01:00, 04:00, 07:00... UTC (the owner's countdowns pointed at
 * 19:00 UTC; 840 is 56 refills, one week), up to 840. Its second value, the charged energy, does not
 * refill.
 */
export const ENERGY: Refill = { id: '60000001', label: 'Odyle Energy', max: 840, per: 15, every: 3 * HOUR, offset: 1 * HOUR, when: 'every 3 h' }
/** Nightmare: +2 at the daily reset (07:00 UTC), up to 14. */
export const NIGHTMARE: Refill = { id: '4', label: 'Nightmare', max: 14, per: 2, every: DAY, offset: 7 * HOUR, when: 'daily' }
/** The Ascension Trial: +3 at the weekly reset (Wednesday 07:00 UTC: 1970-01-07 was one), up to 3. */
export const ASCENSION: Refill = { id: '80000001', label: 'Ascension Trial', max: 3, per: 3, every: 7 * DAY, offset: 6 * DAY + 7 * HOUR, when: 'weekly' }

/*
 * The counters shared by a server's characters (one value for all of them), as Abyss DPS Meter's
 * ticket table has them for the global servers (v4.2.8): the Daily Dungeon 101, refilled to 14 at the
 * weekly reset; the Shugo Festival keys 1, +3 a day up to 21 with a membership (12 without); the
 * invasion keys 8, +1 a day up to 7.
 */
export const DAILY_DUNGEON: Refill = { id: '101', label: 'Daily Dungeon', max: 14, per: 14, every: 7 * DAY, offset: 6 * DAY + 7 * HOUR, when: 'weekly' }
export const SHUGO_KEYS: Refill = { id: '1', label: 'Shugo keys', max: 21, per: 3, every: DAY, offset: 7 * HOUR, when: 'daily' }
export const INVASION_KEYS: Refill = { id: '8', label: 'Invasion keys', max: 7, per: 1, every: DAY, offset: 7 * HOUR, when: 'daily' }

/** A shared counter now: from whichever of the server's characters the game told it last. */
export function sharedNow(r: Refill, list: (CharacterCounters | null)[], now: number): CounterNow | null {
  const readAt = (c: CharacterCounters): number => c.changedAt?.[r.id] ?? c.at
  const latest = list.filter((c): c is CharacterCounters => !!c?.values[r.id]).sort((a, b) => readAt(b) - readAt(a))[0]
  return latest ? counterNow(r, latest, now) : null
}

/** How many refills came between two times. */
export const refillsBetween = (r: Refill, from: number, to: number): number =>
  Math.max(0, Math.floor((to - r.offset) / r.every) - Math.floor((from - r.offset) / r.every))

/** When the next refill comes. */
export const nextRefill = (r: Refill, now: number): number => (Math.floor((now - r.offset) / r.every) + 1) * r.every + r.offset
/** When the last refill came (the weekly counters': the weekly reset). */
export const lastRefill = (r: Refill, now: number): number => nextRefill(r, now) - r.every
/** The weekly reset (Wednesday 07:00 UTC): the Daily Dungeon's refill. */
export const WEEKLY_RESET = DAILY_DUNGEON

/**
 * The weekly season mission Festival-Loving Daeva (from the 2026-11-11 patch): 20,000 Abyss Points at
 * 3, 6 and 9 Shugo Festival games in a week. Aion2Maps' Season 1 guide (2026-11-26); NC's notes say a
 * weekly Shugo Festival mission came, not its steps.
 */
export const SHUGO_MISSION = { name: 'Festival-Loving Daeva', steps: [3, 6, 9], reward: '20,000 Abyss Points' } as const

export interface CounterNow {
  /** As the game last said (at login, or as it changed since). */
  read: number
  /** When it said so; later than the login when it changed since. */
  readAt: number
  changed: boolean
  /** Worked out for now. */
  now: number
  /** The extra (charged energy), which does not refill. */
  extra: number
  max: number
  /** When it is full (now, if it is), and the next refill. */
  fullAt: number
  nextAt: number
}

/** A counter of `c` now, from its last login's value; null when that login said nothing of it. */
export function counterNow(r: Refill, c: CharacterCounters | null, now: number): CounterNow | null {
  const values = c?.values[r.id]
  if (!c || !values) return null
  // A counter at 0 is left out of the game's list: present as [], or as [0, extra].
  const read = values[0] ?? 0
  const extra = values[1] ?? 0
  const readAt = c.changedAt?.[r.id] ?? c.at
  const value = read >= r.max ? read : Math.min(r.max, read + refillsBetween(r, readAt, now) * r.per)
  const missing = Math.max(0, r.max - value)
  const nextAt = nextRefill(r, now)
  const fullAt = missing === 0 ? now : nextAt + (Math.ceil(missing / r.per) - 1) * r.every
  return { read, readAt, changed: readAt !== c.at, now: value, extra, max: r.max, fullAt, nextAt }
}

/** NCSoft's region code for a server, by its hundreds digit (shared/servers.ts `serverRegion`). */
export function ncsoftRegion(server: number): string | null {
  return ({ 1: 'na', 2: 'na', 3: 'eu', 4: 'la' } as Record<number, string>)[Math.floor(server / 100) % 10] ?? null
}
