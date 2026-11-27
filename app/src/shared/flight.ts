/**
 * Your flight power, for the flight timer (pages/FlightPage.vue): as A2Tools reads it (`00 8D`), in
 * hundredths of the game's FP, with how fast it refills on the ground and drains in the air.
 */
export interface FlightPower {
  current: number
  /** Unknown until the game sends its whole sheet (at login). */
  max: number | null
  ratePerS: number
  flying: boolean
  drainPerS: number
  /** When `current` was read (ms). */
  atMs: number
}

/**
 * In the air the game sends a reading about every 0.1 s; with none for this long you have landed,
 * though the last reading still says flying (the next, on the ground, comes up to a second later).
 * 250 ms flickered between flying and refilling when readings came less often (2026-11-27).
 */
const LANDED_MS = 600

/** In the air now: the last reading says so, and is recent. */
export function airborne(fp: FlightPower, now: number): boolean {
  return fp.flying && now - fp.atMs < LANDED_MS
}

/** What it is now, from the last reading: down while flying, up on the ground, within 0..max. */
export function flightNow(fp: FlightPower, now: number): number {
  const s = Math.max(0, now - fp.atMs) / 1000
  // Landed: held where it was until the ground's first reading (the game waits a moment to refill).
  const v = fp.flying ? fp.current - fp.drainPerS * Math.min(s, LANDED_MS / 1000) : fp.current + fp.ratePerS * s
  return Math.max(0, fp.max !== null ? Math.min(fp.max, v) : v)
}

/** Seconds of flight left at the way you fly now (null on the ground). */
export function flightLeft(fp: FlightPower, now: number): number | null {
  return airborne(fp, now) && fp.drainPerS > 0 ? flightNow(fp, now) / fp.drainPerS : null
}

/** Seconds until full on the ground (null in the air, at full, or with the maximum unknown). */
export function flightRefill(fp: FlightPower, now: number): number | null {
  if (airborne(fp, now) || fp.max === null || fp.ratePerS <= 0) return null
  const missing = fp.max - flightNow(fp, now)
  return missing > 0 ? missing / fp.ratePerS : null
}
