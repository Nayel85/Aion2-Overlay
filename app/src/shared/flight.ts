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
 * In the air: as the last reading says (main/flight.ts: until the ground's first one, a rise). Not by
 * the time since it: the readings reach the app in bursts about a second apart (2026-11-27), and
 * between two the timer took you for landed and flickered.
 */
export function airborne(fp: FlightPower, _now: number): boolean {
  return fp.flying
}

/** In the air, what it is now is drawn down from the last reading this long at most: then held (gliding uses another gauge). */
const DRAIN_FOR_MS = 1_500

/** What it is now, from the last reading: down while flying, up on the ground, within 0..max. */
export function flightNow(fp: FlightPower, now: number): number {
  const s = Math.max(0, now - fp.atMs) / 1000
  // Landed: held where it was until the ground's first reading (the game waits a moment to refill).
  const v = fp.flying ? fp.current - fp.drainPerS * Math.min(s, DRAIN_FOR_MS / 1000) : fp.current + fp.ratePerS * s
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
