// A gathering's or a craft's outcome, known as it starts (the engine's `gatherStart`, `craftStart`:
// seconds before the result), told to its pill (pages/GatherPage.vue) until the result comes
// (`gather`, `craftResult`), or a while. What it will give: a craft's from the game's recipes
// (shared/recipes.ts); a gathering's from its spot's kind, whose plain item each result says (kept
// in userData/gather-spots.json), at the grade the game rolled (shared/gatherables.ts). A kind not
// gathered yet is told by the map (the app's gathering points, maps/gatherables.json): each spot of it
// that comes into view votes for the resource of the point nearest to it; the most voted one is taken,
// and kept once sure (3 votes, three in four). The owner's captures: 6 kinds told right that way.
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATHERABLES } from '../shared/gatherables.ts'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { craftItem, gatherItem, GATHER_TEMPLATES_SEED, plainItem, type GatherForecast, type GatherRoll, type GatherTemplates } from '../shared/gather.ts'

/** Gone this long after it should have ended, if nothing said it did. */
const FORGET_AFTER_MS = 2_000
/** And without a duration told, this long after its start (a long craft takes 16 s). */
const FORGET_MS = 25_000

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null
/** The spot's kind of the gathering going on, for its result to teach. */
let pendingTemplate: string | null = null
let templates: GatherTemplates = { ...GATHER_TEMPLATES_SEED }
const file = (): string => join(app.getPath('userData'), 'gather-spots.json')

function set(next: GatherForecast | null): void {
  if (timer) clearTimeout(timer)
  timer = next ? setTimeout(() => set(null), next.durationMs !== null ? next.durationMs + FORGET_AFTER_MS : FORGET_MS) : null
  state = next
  broadcast('gather:changed', state)
}

export const gatherStore = {
  get: (): GatherForecast | null => state,
}

// ---- a spot's kind told by the map ------------------------------------------------------------

/** The map's gathering points: [resource name, zone, x, y]; loaded once, the first time needed. */
let points: [string, number, number, number][] | null = null
function mapPoints(): [string, number, number, number][] {
  if (points) return points
  points = []
  try {
    const m = JSON.parse(readFileSync(join(__dirname, '../renderer/maps/gatherables.json'), 'utf8')) as { types: { name: string; zones: Record<string, [number, number][]> }[] }
    for (const t of m.types) for (const [zone, list] of Object.entries(t.zones)) for (const [x, y] of list) points.push([t.name, Number(zone), x, y])
  } catch (e) {
    log(`gathering: the map's points not read (${String(e)})`)
  }
  return points
}
/** A resource's plain item, by its name (questlog's: every spot of one gives the same). */
const PLAIN_BY_NAME = new Map<string, number>()
for (const [name, , groups] of Object.values(GATHERABLES)) if (groups['1'] && !PLAIN_BY_NAME.has(name)) PLAIN_BY_NAME.set(name, groups['1'][0])
/** Nearer than this to a point (the map's units, ~cm): its resource. */
const NEAR = 800
/** Each unknown kind's votes, by resource name. */
const votes = new Map<number, Map<string, number>>()
/** The resource most voted for a kind, if any: its plain item, and whether it is sure (to keep). */
function voted(template: number): { item: number; sure: boolean } | null {
  const v = votes.get(template)
  if (!v) return null
  const all = [...v.values()].reduce((a, b) => a + b, 0)
  const [name, n] = [...v].sort((a, b) => b[1] - a[1])[0]!
  const item = PLAIN_BY_NAME.get(name)
  if (!item || n / all < 0.6) return null
  return { item, sure: n >= 3 && n / all >= 0.75 }
}
function keep(): void {
  try {
    writeFileSync(file(), JSON.stringify(templates))
  } catch {
    // Learnt again next time.
  }
}

export function startGather(): void {
  try {
    templates = { ...GATHER_TEMPLATES_SEED, ...(JSON.parse(readFileSync(file(), 'utf8')) as GatherTemplates) }
  } catch {
    // None learnt yet.
  }
  tracker.onEvent('spot', (ev) => {
    const template = ev['template'] as number
    const world = ev['world'] as number | null
    const [x, y] = ev['position'] as [number, number]
    if (templates[template] || world === null) return
    let best: [string, number] | null = null
    for (const [name, zone, px, py] of mapPoints()) {
      if (zone !== world) continue
      const d = Math.hypot(px - x, py - y)
      if (d < NEAR && (!best || d < best[1])) best = [name, d]
    }
    if (!best) return
    const v = votes.get(template) ?? new Map<string, number>()
    v.set(best[0], (v.get(best[0]) ?? 0) + 1)
    votes.set(template, v)
    const told = voted(template)
    if (told?.sure) {
      templates = { ...templates, [template]: told.item }
      votes.delete(template)
      log(`gathering: spots ${template} told by the map: ${best[0]}`)
      keep()
    }
  })
  tracker.onEvent('gatherStart', (ev) => {
    const code = ev['outcome'] as number
    const grade = (ev['grade'] as number | undefined) ?? 1
    // 0 failed; else the grade rolled says it: above 1 ranked up (7 the code seen with it, others too).
    // Flags: 1 made, 2 and 4 a better grade rolled. 0 failed, 1 made, 7 ranked up, 6 a rank up
    // rolled and failed (2026-11-23: a Pure Diamond, nothing gathered).
    const outcome = (code & 1) === 0 ? 'fail' : grade > 1 || (code & 6) !== 0 ? 'rankUp' : 'ok'
    if (![0, 1, 6, 7].includes(code)) log(`gathering: outcome ${code} (grade ${grade}) not known before`)
    const template = ev['template'] as number | null | undefined
    pendingTemplate = template === null || template === undefined ? null : String(template)
    const plain = pendingTemplate !== null ? (templates[pendingTemplate] ?? voted(Number(pendingTemplate))?.item) : undefined
    const item = gatherItem(plain, outcome === 'fail' ? 1 : grade)
    // A grade that gives the plain item more times (a plant's x3) is no rank up.
    const base = plainItem(plain)
    const times = outcome === 'rankUp' && item && base && item.id === base.id ? item.count : 1
    const rolls = (ev['rolls'] as GatherRoll[] | undefined) ?? []
    set({ kind: 'gather', outcome: times > 1 ? 'ok' : outcome, times, doubled: ev['doubled'] === true, item, at: Date.now(), durationMs: (ev['durationMs'] as number | undefined) ?? null, rolls })
  })
  // Over: done (its result just after) or given up, walking away. Its spot's kind waits for a result.
  tracker.onEvent('gatherEnd', () => {
    if (state?.kind === 'gather') set(null)
  })
  tracker.onEvent('gather', (ev) => {
    // Its result says the spot's plain item, even failed (a ranked-up one is its next grade's).
    const item = ev['item'] as number | undefined
    if (pendingTemplate !== null && item && ev['result'] !== 1 && templates[pendingTemplate] !== item) {
      templates = { ...templates, [pendingTemplate]: item }
      votes.delete(Number(pendingTemplate))
      keep()
    }
    pendingTemplate = null
    if (state) set(null)
  })
  tracker.onEvent('craftStart', (ev) => {
    const code = ev['outcome'] as number
    // Flags as a gathering's: 1 made; 13 (1, 4, 8) a proc. Without 1 it failed, whatever else rolled.
    if (![0, 1, 13].includes(code)) log(`craft: outcome ${code} not known (recipe ${ev['recipe']})`)
    const made = (code & 1) === 1
    const proc = made && (code & 12) !== 0
    const { item, doubled } = craftItem(ev['recipe'] as number, proc)
    set({ kind: 'craft', times: 1, outcome: !made ? 'fail' : proc ? 'proc' : 'ok', doubled, item, at: Date.now(), durationMs: (ev['durationMs'] as number | undefined) ?? null, rolls: [] })
  })
  tracker.onEvent('craftDone', () => {
    if (state?.kind === 'craft') set(null)
  })
}
