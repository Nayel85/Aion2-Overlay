// Your flight power (shared/flight.ts): the engine's `flight` events, as it changes, to the flight timer.
// In the air the game sends a reading about every 0.1 s, each one lower; putting the wings away sends
// one lone lower reading too, which the engine takes for flying. So flying counts from the second
// such reading in a row, close after the first.
import { broadcast } from './broadcast.ts'
import { tracker } from './tracker.ts'
import type { FlightPower } from '../shared/flight.ts'

/** Two readings this close, both flying: in the air. */
const IN_A_ROW_MS = 400
/** In the air, a lone reading not flying this soon after a flying one does not land you (it flickered, 2026-11-27). */
const STAY_UP_MS = 800

let state: FlightPower | null = null
/** When the last reading saying flying came (its own time), 0 after one that did not. */
let flyingAt = 0
/** When the last reading taken as in the air came. */
let upAt = 0

export const flightStore = {
  get: (): FlightPower | null => state,
}

export function startFlight(): void {
  tracker.onEvent('flight', (ev) => {
    const fp = ev.fp ?? null
    if (!fp) {
      state = null
      flyingAt = 0
    } else {
      // The same reading told again (something else in it changed) keeps what it was taken for.
      const again = fp.atMs === flyingAt && state !== null
      const inARow = fp.flying && flyingAt > 0 && fp.atMs > flyingAt && fp.atMs - flyingAt < IN_A_ROW_MS
      // Already in the air: flying still, and a lone ground reading right after does not land you.
      const stillUp = state?.flying === true && (fp.flying || fp.atMs - upAt < STAY_UP_MS)
      const flying = again ? state!.flying : inARow || stillUp
      if (fp.atMs !== flyingAt) flyingAt = fp.flying ? fp.atMs : 0
      if (flying && fp.flying) upAt = fp.atMs
      state = { ...fp, flying }
    }
    broadcast('flight:changed', state)
  })
}
