// Your flight power (shared/flight.ts): the engine's `flight` events, as it changes, to the flight timer,
// in the air or not as its readings say (below).
import { broadcast } from './broadcast.ts'
import { dataFile } from './dataFile.ts'
import { tracker } from './tracker.ts'
import type { FlightPower } from '../shared/flight.ts'

/**
 * In the air or not, from the readings themselves (A2Tools says flying until 1.2 s after the last fall,
 * the first rise on the ground too, 2026-11-27): one higher than the last is the ground refilling, at
 * once; two lower in a row, this close, is flying (putting the wings away sends one lone lower reading);
 * the same keeps what it was. Each reading timed as it comes here: the game's own time is off the
 * PC's by some hundreds of ms, and the timer, counting from it, flickered.
 */
const IN_A_ROW_MS = 400

let state: FlightPower | null = null
/** The last reading: its value, the game's time of it, and when the one before it fell (0: it did not). */
let last: { current: number; gameAt: number; at: number } | null = null
let fellAt = 0
/**
 * Each character's flight power maximum, as last told: the game sends it only in the login's sheet,
 * so an app started since would have none (no refill to show).
 */
const maxFile = dataFile('flight-max.json', 2000)
let maxes: Record<string, number> = {}

export const flightStore = {
  get: (): FlightPower | null => state,
}

export function startFlight(): void {
  maxes = (maxFile.read() as Record<string, number> | null) ?? {}
  tracker.onEvent('flight', (ev) => {
    const fp = ev.fp ?? null
    const who = tracker.status().character
    if (fp?.max != null && who && maxes[who] !== fp.max) {
      maxes = { ...maxes, [who]: fp.max }
      maxFile.save(() => maxes)
    }
    // None told since the app started: the one kept, else the highest seen (full, it is the maximum).
    if (fp && fp.max == null && who && fp.current > (maxes[who] ?? 0)) {
      maxes = { ...maxes, [who]: fp.current }
      maxFile.save(() => maxes)
    }
    const max = fp?.max ?? (who ? (maxes[who] ?? null) : null)
    if (!fp) {
      state = null
      last = null
      fellAt = 0
    } else if (!last || fp.atMs !== last.gameAt) {
      const at = Date.now()
      const fell = last !== null && fp.current < last.current
      const rose = last !== null && fp.current > last.current
      // In the air until the ground's first reading (a rise); taken off on a second fall in a row.
      const flying = rose ? false : fell ? (state?.flying ?? false) || (fellAt > 0 && at - fellAt < IN_A_ROW_MS) : (state?.flying ?? false)
      fellAt = fell ? at : 0
      last = { current: fp.current, gameAt: fp.atMs, at }
      state = { ...fp, max, atMs: at, flying }
    } else {
      // The same reading told again (its maximum or rate changed): what it was taken for, when it came.
      state = { ...fp, max, atMs: last.at, flying: state?.flying ?? false }
    }
    broadcast('flight:changed', state)
  })
}
