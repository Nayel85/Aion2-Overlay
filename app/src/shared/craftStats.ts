/**
 * The crafts over the sessions kept, for the Crafts page (components/dashboard/CraftsView.vue): picked
 * by character, since when and craft, then by character and by recipe: how many, how many procced,
 * against what the game's proc chances (shared/recipes.ts, questlog's) make of them, your luck.
 */
import { RECIPES } from './recipes.ts'
import type { CraftDone, PlaySession } from './sessions.ts'

export interface NamedCraft {
  name: string
  craft: CraftDone
}

export interface CraftFilter {
  names: string[]
  from: number
  /** A craft (blacksmithing...), null for all. */
  kind: string | null
}

/** Every craft kept, the oldest first, with whose it was. */
export function allCrafts(sessions: PlaySession[]): NamedCraft[] {
  return sessions.flatMap((s) => (s.crafts ?? []).map((craft) => ({ name: s.name, craft }))).sort((a, b) => a.craft.at - b.craft.at)
}

/** A recipe's craft (blacksmithing...), 'other' when not known. */
export const craftKind = (recipe: number): string => RECIPES[String(recipe)]?.[3] ?? 'other'

export const filterCrafts = (crafts: NamedCraft[], f: CraftFilter): NamedCraft[] =>
  crafts.filter(({ name, craft }) => (!f.names.length || f.names.includes(name)) && craft.at >= f.from && (f.kind === null || craftKind(craft.recipe) === f.kind))

/** The crafts (blacksmithing...) some crafts were of, the most done first. */
export function craftKinds(crafts: NamedCraft[]): { id: string; count: number }[] {
  const n = new Map<string, number>()
  for (const { craft } of crafts) n.set(craftKind(craft.recipe), (n.get(craftKind(craft.recipe)) ?? 0) + 1)
  return [...n].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count)
}

export interface CraftSummary {
  /** The character, '' for all of them. */
  name: string
  crafts: number
  /** Of those whose recipe can proc. */
  canProc: number
  procs: number
  /** The procs the game's chances make of those crafts. */
  expected: number
}

function summary(name: string, list: CraftDone[]): CraftSummary {
  let canProc = 0
  let expected = 0
  for (const c of list) {
    const chance = RECIPES[String(c.recipe)]?.[2] ?? 0
    if (chance > 0) {
      canProc++
      expected += chance
    }
  }
  return { name, crafts: list.length, canProc, procs: list.filter((c) => c.proc).length, expected }
}

/** By character (by name), then all of them (named ''). */
export function craftSummaries(crafts: NamedCraft[]): CraftSummary[] {
  const by = new Map<string, CraftDone[]>()
  for (const { name, craft } of crafts) by.set(name, [...(by.get(name) ?? []), craft])
  return [...[...by].map(([name, list]) => summary(name, list)).sort((a, b) => b.crafts - a.crafts), summary('', crafts.map((c) => c.craft))]
}

export interface RecipeStats {
  recipe: number
  kind: string
  name: string
  grade: number
  icon: string | null
  crafts: number
  procs: number
  /** The game's chance of a proc, 0 for a recipe without one. */
  chance: number
  /** Its proc's item and count, null without one. */
  proc: { name: string; grade: number; icon: string | null; count: number; doubled: boolean } | null
  /** What came of them: the plain items and the procs' items. */
  madePlain: number
  madeProc: number
}

/** By recipe, the most crafted first. */
export function recipeStats(crafts: NamedCraft[]): RecipeStats[] {
  const by = new Map<number, CraftDone[]>()
  for (const { craft } of crafts) by.set(craft.recipe, [...(by.get(craft.recipe) ?? []), craft])
  return [...by]
    .map(([recipe, list]) => {
      const def = RECIPES[String(recipe)]
      const plain = def?.[0]
      const better = def?.[1] ?? null
      return {
        recipe,
        kind: craftKind(recipe),
        name: plain?.[2] ?? `#${recipe}`,
        grade: plain?.[3] ?? 11,
        icon: plain?.[4] ?? null,
        crafts: list.length,
        procs: list.filter((c) => c.proc).length,
        chance: def?.[2] ?? 0,
        proc: better ? { name: better[2], grade: better[3], icon: better[4], count: better[1], doubled: better[0] === plain?.[0] } : null,
        madePlain: list.filter((c) => !c.proc).reduce((n, c) => n + c.count, 0),
        madeProc: list.filter((c) => c.proc).reduce((n, c) => n + c.count, 0),
      }
    })
    .sort((a, b) => b.crafts - a.crafts || a.name.localeCompare(b.name))
}
