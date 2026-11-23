// A gathering's or a craft's outcome, known as it starts (the engine's `gatherStart`, `craftStart`:
// seconds before the result), told to its pill (pages/GatherPage.vue) until the result comes
// (`gather`, `craftResult`), or a while. What it will give comes from its spot's kind (template) or
// its recipe: each result teaches it, the plain item or the better one, kept in
// userData/gather-items.json.
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { GATHER_ITEMS_SEED, type GatherForecast, type GatherItems } from '../shared/gather.ts'

/** Gone this long after its start, if no result came (the gathering was cancelled). */
const FORGET_MS = 25_000

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null
/** The spot's kind (or `r` and the recipe) of what is going on, for its result to teach. */
let pendingTemplate: string | null = null
/** Its result's better item: ranked up, or a proc. */
let pendingUp = false
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
    const template = ev['template'] as number | null
    pendingTemplate = template !== null && template !== undefined ? String(template) : null
    pendingUp = outcome === 'rankUp'
    const known = pendingTemplate !== null ? items[pendingTemplate] : undefined
    const item = (outcome === 'rankUp' ? known?.up : known?.item) ?? null
    set({ kind: 'gather', outcome, doubled: ev['doubled'] === true, item, at: Date.now() })
  })
  tracker.onEvent('gather', (ev) => {
    // Its result says the item, even failed: the plain one, or the ranked-up one (result 1).
    learn(ev['item'] as number | undefined, ev['result'] === 1)
  })
  tracker.onEvent('craftStart', (ev) => {
    const code = ev['outcome'] as number
    if (code !== 1 && code !== 13) log(`craft: outcome ${code} not known (recipe ${ev['recipe']})`)
    const outcome = code === 13 ? 'proc' : 'ok'
    pendingTemplate = `r${ev['recipe'] as number}`
    pendingUp = outcome === 'proc'
    const known = items[pendingTemplate]
    const item = (outcome === 'proc' ? known?.up : known?.item) ?? null
    set({ kind: 'craft', outcome, doubled: false, item, at: Date.now() })
  })
  tracker.onEvent('craftResult', (ev) => learn(ev['item'] as number | undefined, pendingUp))
}

/** What came of the gathering or craft going on: its item learnt (the better one or the plain), and its pill gone. */
function learn(item: number | undefined, up: boolean): void {
  if (pendingTemplate !== null && item) {
    const known = items[pendingTemplate] ?? {}
    const learnt = up ? { ...known, up: item } : { ...known, item }
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
}
