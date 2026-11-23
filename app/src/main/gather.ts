// A gathering's outcome, known as it starts (the engine's `gatherStart`: about 7 s before the
// result): told to the CC banner (pages/CcPage.vue) until the result comes (`gather`), or a while.
import { broadcast } from './broadcast.ts'
import { tracker } from './tracker.ts'
import type { GatherForecast } from '../shared/gather.ts'

/** Gone this long after its start, if no result came (the gathering was cancelled). */
const FORGET_MS = 12_000

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null

function set(next: GatherForecast | null): void {
  if (timer) clearTimeout(timer)
  timer = next ? setTimeout(() => set(null), FORGET_MS) : null
  state = next
  broadcast('gather:changed', state)
}

export const gatherStore = {
  get: (): GatherForecast | null => state,
}

export function startGather(): void {
  tracker.onEvent('gatherStart', (ev) => {
    const outcome = ev['outcome'] as number
    set({ outcome: outcome === 0 ? 'fail' : outcome === 7 ? 'rankUp' : 'ok', doubled: ev['doubled'] === true, at: Date.now() })
  })
  tracker.onEvent('gather', () => {
    if (state) set(null)
  })
}
