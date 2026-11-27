// Your flight power (shared/flight.ts): the engine's `flight` events, as it changes, to the flight timer,
// in the air or not as its readings say (below).
import { broadcast } from './broadcast.ts'
import { tracker } from './tracker.ts'
import type { FlightPower } from '../shared/flight.ts'

/**
 * In the air or not, from the readings themselves (A2Tools says flying until 1.2 s after the last fall,
 * the first rise on the ground too, 2026-11-27): one higher than the last is the ground refilling, at
 * once; two lower in a row, this close, is flying (putting the wings away sends one lone lower reading);
 * the same keeps what it was.
 */
const IN_A_ROW_MS = 400

let state: FlightPower | null = null
/** The last reading: its value and time, and when the one before it fell (0: it did not). */
let last: { current: number; atMs: number } | null = null
let fellAt = 0

export const flightStore = {
  get: (): FlightPower | null => state,
}

export function startFlight(): void {
  tracker.onEvent('flight', (ev) => {
    const fp = ev.fp ?? null
    if (!fp) {
      state = null
      last = null
      fellAt = 0
    } else if (!last || fp.atMs !== last.atMs) {
      const fell = last !== null && fp.current < last.current
      const rose = last !== null && fp.current > last.current
      const flying = rose ? false : fell ? fellAt > 0 && fp.atMs - fellAt < IN_A_ROW_MS : (state?.flying ?? false)
      fellAt = fell ? fp.atMs : 0
      last = { current: fp.current, atMs: fp.atMs }
      state = { ...fp, flying }
    } else {
      // The same reading told again (its maximum or rate changed): what it was taken for.
      state = { ...fp, flying: state?.flying ?? false }
    }
    broadcast('flight:changed', state)
  })
}
