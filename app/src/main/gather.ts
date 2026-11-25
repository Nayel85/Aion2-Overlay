// A gathering's or a craft's outcome, known as it starts (the engine's `gatherStart`, `craftStart`:
// seconds before the result), told to its pill (pages/GatherPage.vue) until the result comes
// (`gather`, `craftResult`), or a while. What it will give: a craft's from the game's recipes
// (shared/recipes.ts); a gathering's from its spot's kind, whose plain item each result says (kept
// in userData/gather-spots.json), at the grade the game rolled (shared/gatherables.ts). A kind not
// gathered yet is told by the map (the app's gathering points, maps/gatherables.json): each spot of it
// that comes into view votes for the resource of the point nearest to it; the most voted one is taken,
// and kept once sure (3 votes, three in four). The owner's captures: 6 kinds told right that way.
//
// It also follows each one to its end for the sessions (main/sessions.ts): `onGathered` with a
// gathering's start and result (or none: given up), `onCrafted` with a craft's.
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resourceOf } from '../shared/sessions.ts'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { craftOutcome, gatherFlow, gatherOutcome, type CraftOver, type GatheringOver } from '../shared/gatherFlow.ts'
import { craftItem, gatherItem, GATHER_TEMPLATES_SEED, plainItem, type GatherForecast, type GatherRoll, type GatherTemplates, plainItemByName } from '../shared/gather.ts'

/** Gone this long after it should have ended, if nothing said it did. */
const FORGET_AFTER_MS = 2_000
/** And without a duration told, this long after its start (a long craft takes 16 s). */
const FORGET_MS = 25_000
const gatheredListeners: ((g: GatheringOver) => void)[] = []
const craftedListeners: ((c: CraftOver) => void)[] = []
export const onGathered = (f: (g: GatheringOver) => void): void => void gatheredListeners.push(f)
export const onCrafted = (f: (c: CraftOver) => void): void => void craftedListeners.push(f)
/** Each gathering and craft followed to its end (shared/gatherFlow.ts), told to the sessions. */
const flow = gatherFlow({
  gathered: (g) => gatheredListeners.forEach((f) => f(g)),
  crafted: (c) => craftedListeners.forEach((f) => f(c)),
  plainOf: (template) => gatherStore.plainOf(template),
})

let state: GatherForecast | null = null
let timer: NodeJS.Timeout | null = null
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
  /** The plain item a spot's kind gives, as known (learnt, seeded or told by the map). */
  plainOf: (template: number | null | undefined): number | null =>
    template === null || template === undefined ? null : (templates[String(template)] ?? voted(template)?.item ?? null),
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
  const item = plainItemByName(name)
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
    const outcome = gatherOutcome(code, grade)
    if (![0, 1, 6, 7].includes(code)) log(`gathering: outcome ${code} (grade ${grade}) not known before`)
    const template = (ev['template'] as number | null | undefined) ?? null
    const plain = gatherStore.plainOf(template) ?? undefined
    const item = gatherItem(plain, outcome === 'fail' ? 1 : grade)
    // A grade that gives the plain item more times (a plant's x3) is no rank up.
    const base = plainItem(plain)
    const times = outcome === 'rankUp' && item && base && item.id === base.id ? item.count : 1
    const rolls = (ev['rolls'] as GatherRoll[] | undefined) ?? []
    flow.gatherStart({ outcome: code, grade, doubled: ev['doubled'] === true, skills: rolls.flatMap((r) => r.skills ?? []), template })
    set({ kind: 'gather', grade, outcome: times > 1 ? 'ok' : outcome, times, doubled: ev['doubled'] === true, item, at: Date.now(), durationMs: (ev['durationMs'] as number | undefined) ?? null, rolls })
  })
  // Over: done (its result just after) or given up, walking away. The next gathering's start, coming
  // meanwhile, is left alone.
  tracker.onEvent('gatherEnd', () => {
    if (state?.kind === 'gather') set(null)
    flow.gatherEnd()
  })
  tracker.onEvent('gather', (ev) => {
    // Its result says the spot's resource, even failed or ranked up (a Fine Yggdrasil Log's plain one).
    const item = (ev['item'] as number | undefined) ?? 0
    const plain = item ? resourceOf(item) : undefined
    const result = { item, amount: (ev['amount'] as number | undefined) ?? 0, bonus: (ev['bonus'] as number | undefined) ?? 0, result: (ev['result'] as number | undefined) ?? 0 }
    const start = flow.gather(result, plain ?? null)
    const template = start?.template ?? null
    if (template !== null && plain && templates[String(template)] !== plain) {
      templates = { ...templates, [template]: plain }
      votes.delete(template)
      keep()
    }
    if (state) set(null)
  })
  tracker.onEvent('craftStart', (ev) => {
    const code = ev['outcome'] as number
    // Flags as a gathering's: 1 made; 13 (1, 4, 8) a proc. Without 1 it failed, whatever else rolled.
    if (![0, 1, 13].includes(code)) log(`craft: outcome ${code} not known (recipe ${ev['recipe']})`)
    const { made, proc } = craftOutcome(code)
    const { item, doubled } = craftItem(ev['recipe'] as number, proc)
    flow.craftStart(ev['recipe'] as number, code)
    set({ kind: 'craft', times: 1, outcome: !made ? 'fail' : proc ? 'proc' : 'ok', doubled, item, at: Date.now(), durationMs: (ev['durationMs'] as number | undefined) ?? null, rolls: [] })
  })
  // Done: a failed one made nothing (no result follows); a made one's item comes with `craftResult`.
  tracker.onEvent('craftDone', (ev) => {
    if (state?.kind === 'craft') set(null)
    flow.craftDone(ev['recipe'] as number)
  })
  tracker.onEvent('craftResult', (ev) => flow.craftResult(ev['recipe'] as number, ev['item'] as number))
}
