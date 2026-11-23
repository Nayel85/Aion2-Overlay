// A gathering's or a craft's outcome, known as it starts (the engine's `gatherStart`, `craftStart`:
// seconds before the result), told to its pill (pages/GatherPage.vue) until the result comes
// (`gather`, `craftResult`), or a while. What it will give: a craft's from the game's recipes
// (shared/recipes.ts); a gathering's from its spot's kind, whose plain item each result says (kept
// in userData/gather-templates.json), at the grade the game rolled (shared/gatherables.ts).
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { craftItem, gatherItem, GATHER_TEMPLATES_SEED, type GatherForecast, type GatherTemplates } from '../shared/gather.ts'

/** Gone this long after its start, if no result came (cancelled): a long craft takes 16 s. */
const FORGET_MS = 25_000

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null
/** The spot's kind of the gathering going on, for its result to teach. */
let pendingTemplate: number | null = null
let templates: GatherTemplates = { ...GATHER_TEMPLATES_SEED }
const file = (): string => join(app.getPath('userData'), 'gather-templates.json')

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
    templates = { ...GATHER_TEMPLATES_SEED, ...(JSON.parse(readFileSync(file(), 'utf8')) as GatherTemplates) }
  } catch {
    // None learnt yet.
  }
  tracker.onEvent('gatherStart', (ev) => {
    const code = ev['outcome'] as number
    const grade = (ev['grade'] as number | undefined) ?? 1
    // 0 failed; else the grade rolled says it: above 1 ranked up (7 the code seen with it, others too).
    const outcome = code === 0 ? 'fail' : grade > 1 || code === 7 ? 'rankUp' : 'ok'
    if (code !== 0 && code !== 1 && code !== 7) log(`gathering: outcome ${code} (grade ${grade}) not known before`)
    pendingTemplate = (ev['template'] as number | null | undefined) ?? null
    const plain = pendingTemplate !== null ? templates[pendingTemplate] : undefined
    const item = gatherItem(plain, outcome === 'fail' ? 1 : grade)
    set({ kind: 'gather', outcome, doubled: ev['doubled'] === true, item, at: Date.now() })
  })
  tracker.onEvent('gather', (ev) => {
    // Its result says the spot's plain item, even failed (a ranked-up one is its next grade's).
    const item = ev['item'] as number | undefined
    if (pendingTemplate !== null && item && ev['result'] !== 1 && templates[pendingTemplate] !== item) {
      templates = { ...templates, [pendingTemplate]: item }
      try {
        writeFileSync(file(), JSON.stringify(templates))
      } catch {
        // Learnt again next time.
      }
    }
    pendingTemplate = null
    if (state) set(null)
  })
  tracker.onEvent('craftStart', (ev) => {
    const code = ev['outcome'] as number
    if (code !== 1 && code !== 13) log(`craft: outcome ${code} not known (recipe ${ev['recipe']})`)
    const proc = code === 13
    const { item, doubled } = craftItem(ev['recipe'] as number, proc)
    set({ kind: 'craft', outcome: proc ? 'proc' : 'ok', doubled, item, at: Date.now() })
  })
  tracker.onEvent('craftResult', () => {
    if (state?.kind === 'craft') set(null)
  })
}
