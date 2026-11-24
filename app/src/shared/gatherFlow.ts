/**
 * A gathering or a craft followed from its start to its end (main/gather.ts feeds it the engine's
 * events): a gathering's start, then its result, or none (given up: over with no result
 * GIVEN_UP_MS after); a craft's start, then its item, or none (failed: over with nothing). What is
 * over goes to `gathered` / `crafted` (the sessions). Kept apart from main to be tested.
 */

/** A gathering over with no result this long after: given up (a done one's result comes just after). */
export const GIVEN_UP_MS = 1_500

/** What a gathering's start said: its outcome code, grade, the skills its rolls fired, its spot's kind. */
export interface GatheringStart {
  outcome: number
  grade: number
  doubled: boolean
  skills: number[]
  template: number | null
}
/** A gathering over: its start (null when it began before the app saw it) and its result, or null: given up. */
export interface GatheringOver {
  at: number
  start: GatheringStart | null
  result: { item: number; amount: number; bonus: number; result: number } | null
  /** The spot's plain item, as known (for a given up one, which says none). */
  plain: number | null
}
/** A craft over: made (its item) or failed (none). */
export interface CraftOver {
  at: number
  recipe: number
  proc: boolean
  failed: boolean
  item: number | null
}

/**
 * A gathering's outcome from its start's code and the grade rolled. Flags: 1 made, 2 and 4 a better
 * grade rolled: 0 failed, 1 made, 7 ranked up, 6 a rank up rolled and failed (2026-11-23: a Pure
 * Diamond, nothing gathered). A grade above 1 is a rank up too.
 */
export const gatherOutcome = (code: number, grade: number): 'fail' | 'rankUp' | 'ok' =>
  (code & 1) === 0 ? 'fail' : grade > 1 || (code & 6) !== 0 ? 'rankUp' : 'ok'

/** A craft's: 1 made; 13 (1, 4, 8) a proc. Without 1 it failed, whatever else rolled. */
export const craftOutcome = (code: number): { made: boolean; proc: boolean } => {
  const made = (code & 1) === 1
  return { made, proc: made && (code & 12) !== 0 }
}

export interface FlowOptions {
  gathered: (g: GatheringOver) => void
  crafted: (c: CraftOver) => void
  /** A spot's plain item, as known, for a gathering given up. */
  plainOf: (template: number | null) => number | null
  /** The clock and the timer: Date.now and setTimeout, or a test's. */
  now?: () => number
  later?: (f: () => void, ms: number) => void
}

export function gatherFlow(o: FlowOptions) {
  const now = o.now ?? Date.now
  const later = o.later ?? ((f: () => void, ms: number): void => void setTimeout(f, ms))
  /** The gathering going on, as its start said. */
  let gathering: GatheringStart | null = null
  /** The craft going on. */
  let crafting: { recipe: number; proc: boolean; failed: boolean } | null = null
  return {
    gatherStart(start: GatheringStart): void {
      gathering = start
    },
    /** Over: done (its result just after) or given up. The next gathering's start, coming meanwhile, is left alone. */
    gatherEnd(): void {
      const over = gathering
      if (!over) return
      later(() => {
        if (gathering !== over) return
        gathering = null
        o.gathered({ at: now(), start: over, result: null, plain: o.plainOf(over.template) })
      }, GIVEN_UP_MS)
    },
    /** Its result: the start it closes (null if none was seen), for the spot's kind to learn from. */
    gather(result: GatheringOver['result'] & object, plain: number | null): GatheringStart | null {
      const start = gathering
      gathering = null
      o.gathered({ at: now(), start, result, plain })
      return start
    },
    craftStart(recipe: number, code: number): void {
      const { made, proc } = craftOutcome(code)
      crafting = { recipe, proc, failed: !made }
    },
    /** Done: a failed one made nothing (no result follows); a made one's item comes with `craftResult`. */
    craftDone(recipe: number): void {
      const c = crafting
      if (!c?.failed || c.recipe !== recipe) return
      crafting = null
      o.crafted({ at: now(), recipe, proc: false, failed: true, item: null })
    },
    craftResult(recipe: number, item: number): void {
      const c = crafting
      crafting = null
      if (!c || c.failed || c.recipe !== recipe) return
      o.crafted({ at: now(), recipe, proc: c.proc, failed: false, item })
    },
  }
}
