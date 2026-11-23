// Your flight power (shared/flight.ts): the engine's `flight` events, as it changes, to the flight timer.
import { broadcast } from './broadcast.ts'
import { tracker } from './tracker.ts'
import type { FlightPower } from '../shared/flight.ts'

let state: FlightPower | null = null

export const flightStore = {
  get: (): FlightPower | null => state,
}

export function startFlight(): void {
  tracker.onEvent('flight', (ev) => {
    state = (ev['fp'] as FlightPower | null) ?? null
    broadcast('flight:changed', state)
  })
}
