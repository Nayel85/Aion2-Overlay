// A gathering's outcome, known as it starts (the engine's `gatherStart`: about 7 s before the
// result), told to its pill (pages/GatherPage.vue) until the result comes (`gather`), or a while.
// What it will give comes from its spot's kind (template): each result teaches it, the plain item
// or the ranked-up one, kept in userData/gather-items.json.
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { tracker } from './tracker.ts'
import { GATHER_ITEMS_SEED, type GatherForecast, type GatherItems } from '../shared/gather.ts'

/** Gone this long after its start, if no result came (the gathering was cancelled). */
const FORGET_MS = 12_000

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null
/** The spot's kind of the gathering going on, for its result to teach. */
let pendingTemplate: number | null = null
let items: GatherItems = { ...GATHER_ITEMS_SEED }
const file = (): string => join(app.getPath('userData'), 'gather-items.json')

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
  try {
    items = { ...GATHER_ITEMS_SEED, ...(JSON.parse(readFileSync(file(), 'utf8')) as GatherItems) }
  } catch {
    // None learnt yet.
  }
  tracker.onEvent('gatherStart', (ev) => {
    const code = ev['outcome'] as number
    const outcome = code === 0 ? 'fail' : code === 7 ? 'rankUp' : 'ok'
    pendingTemplate = (ev['template'] as number | null) ?? null
    const known = pendingTemplate !== null ? items[pendingTemplate] : undefined
    const item = (outcome === 'rankUp' ? known?.up : known?.item) ?? null
    set({ outcome, doubled: ev['doubled'] === true, item, at: Date.now() })
  })
  tracker.onEvent('gather', (ev) => {
    // Its result says the item, even failed: the plain one, or the ranked-up one (result 1).
    const item = ev['item'] as number | undefined
    if (pendingTemplate !== null && item) {
      const known = items[pendingTemplate] ?? {}
      const learnt = ev['result'] === 1 ? { ...known, up: item } : { ...known, item }
      if (JSON.stringify(learnt) !== JSON.stringify(known)) {
        items = { ...items, [pendingTemplate]: learnt }
        try {
          writeFileSync(file(), JSON.stringify(items))
        } catch {
          // Learnt again next time.
        }
      }
    }
    pendingTemplate = null
    if (state) set(null)
  })
}
