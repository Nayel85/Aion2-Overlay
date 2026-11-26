/**
 * The dungeons' loot over the sessions kept (the Loot page): the runs a filter picks (characters,
 * since when, dungeon type, dungeon and mode), and what they gave by character and by item, per
 * run, per cube (the membership's second with the first: account-wide) or per hour in them.
 *
 * Only the runs whose loot was recorded count (a cube's `15 57`): not the runs from before, nor
 * field events (a Shugo Festival's chests) or field bosses (their loot chest). Beside what they
 * gave, what the game's rates (DROPS: each item's chance a cube, and how many) make of their cubes:
 * your luck is what you got against that.
 */
import { DROPS } from './drops.ts'
import { DUNGEON_BOSSES } from './dungeonBosses.ts'
import { goldKind, itemInfo, runCounts, runKindLabel, runName, type DungeonRun, type GoldKind, type LootCounts, type PlaySession } from './sessions.ts'

/** Runs whose loot is not a dungeon's cubes. */
const NOT_DUNGEON_KINDS = new Set(['shugo', 'invasion', 'fieldevent', 'fieldboss', 'hiddencube', 'arena'])
export type LootUnit = 'run' | 'cube' | 'hour'
export interface LootFilter {
  /** The characters (all when empty). */
  names: string[]
  /** Runs from this time on (0: all). */
  from: number
  /** A dungeon type (`conquest`, `transcendence`...), or null: all. */
  kind: string | null
  /** A dungeon in one mode (its zone), or null: all. */
  world: number | null
}

/** A run with its character's name. */
export interface NamedRun {
  name: string
  run: DungeonRun
}

/** Every run that counts in the stats, its character's name with it, oldest first. */
export function lootRuns(sessions: PlaySession[]): NamedRun[] {
  return sessions
    .flatMap((s) => (s.runs ?? []).filter((r) => r.loot && !NOT_DUNGEON_KINDS.has(r.kind) && runCounts(r)).map((run) => ({ name: s.name, run })))
    .sort((a, b) => a.run.start - b.run.start)
}

export const filterRuns = (runs: NamedRun[], f: LootFilter): NamedRun[] =>
  runs.filter(({ name, run }) => (!f.names.length || f.names.includes(name)) && run.start >= f.from && (f.kind === null || run.kind === f.kind) && (f.world === null || run.world === f.world))

/** The dungeon types and the dungeons (by zone, with their mode) some runs went to, the most run first. */
export function lootChoices(runs: NamedRun[]): { kinds: { id: string; label: string; count: number }[]; worlds: { id: number; label: string; kind: string; count: number }[] } {
  const kinds = new Map<string, number>()
  const worlds = new Map<number, { label: string; kind: string; count: number }>()
  for (const { run } of runs) {
    kinds.set(run.kind, (kinds.get(run.kind) ?? 0) + 1)
    const w = worlds.get(run.world)
    worlds.set(run.world, { label: w?.label ?? runName(run), kind: run.kind, count: (w?.count ?? 0) + 1 })
  }
  return {
    kinds: [...kinds].map(([id, count]) => ({ id, label: runKindLabel(id), count })).sort((a, b) => b.count - a.count),
    worlds: [...worlds].map(([id, w]) => ({ id, ...w })).sort((a, b) => b.count - a.count),
  }
}

/** How long a run was: in it (its clear time when it cleared). */
const runMs = (r: DungeonRun): number => (r.cleared !== undefined ? r.cleared - (r.started ?? r.start) : (r.end ?? r.start) - r.start)
/** A run's cubes: as recorded, else from its Kina (300,000 a cube in the runs before they were). */
const KINA_A_CUBE = 300_000
export const runCubes = (r: DungeonRun): number => r.cubes ?? Math.max(1, Math.round((r.loot?.['930100031'] ?? r.kina) / KINA_A_CUBE))

/**
 * How many of an item the game's rates make of a run's cubes, a cube each. A full run's cube rolls
 * each of its dungeon's bosses' tables; questlog's chance is of one at least over those rolls (Vakron's
 * Amplify Stone Fragment: 20% on each of its 3 bosses in game, 48.8% = 1 - 0.8^3 on questlog). So
 * each roll's chance is 1 - (1 - chance)^(1/bosses), and a cube holds bosses x that, its fewest each
 * (questlog's most is over the rolls). A sure one (chance 1) once, its mean count. 0 when the
 * dungeon's list has none.
 */
export function expectedOf(run: DungeonRun, id: string): number {
  const d = DROPS[run.world]?.[id]
  if (!d) return 0
  const [chance, fewest, most] = d
  const bosses = DUNGEON_BOSSES[run.world]?.length || 1
  const perCube = chance >= 1 ? (fewest + most) / 2 : bosses * (1 - (1 - chance) ** (1 / bosses)) * fewest
  return perCube * runCubes(run)
}
/** The family a count of an item goes to, or null. */
const familyOf = (id: string): keyof LootCounts | null => (itemInfo(id)?.kind === 'arcana' ? 'cards' : goldKind(id))

/** Some runs together (a character's, or all of them): how many, their cubes, their time, Kina and loot, and the loot the game's rates make of them. */
export interface LootSummary extends LootCounts {
  /** The character, or '' for all of them. */
  name: string
  runs: number
  cubes: number
  ms: number
  /** Their clears' mean time (the runs that cleared), or null. */
  clearMs: number | null
  kina: number
  expected: LootCounts
}
export function summarize(name: string, runs: DungeonRun[]): LootSummary {
  const out: LootSummary = { name, runs: runs.length, cubes: 0, ms: 0, clearMs: null, kina: 0, equipment: 0, craft: 0, wings: 0, cards: 0, expected: { equipment: 0, craft: 0, wings: 0, cards: 0 } }
  let clears = 0
  let clearSum = 0
  for (const r of runs) {
    out.cubes += runCubes(r)
    out.ms += runMs(r)
    out.kina += Math.max(r.kina, r.loot?.['930100031'] ?? 0)
    if (r.cleared !== undefined) {
      clears++
      clearSum += runMs(r)
    }
    for (const [id, n] of Object.entries(r.loot ?? {})) {
      const family = familyOf(id)
      if (family) out[family] += n
    }
    for (const id of Object.keys(DROPS[r.world] ?? {})) {
      const family = familyOf(id)
      if (family) out.expected[family] += expectedOf(r, id)
    }
  }
  out.clearMs = clears ? clearSum / clears : null
  return out
}
/** Each character's, most runs first, then all of them. */
export function summaries(runs: NamedRun[]): LootSummary[] {
  const by = new Map<string, DungeonRun[]>()
  for (const { name, run } of runs) by.set(name, [...(by.get(name) ?? []), run])
  return [...[...by].map(([name, list]) => summarize(name, list)).sort((a, b) => b.runs - a.runs), summarize('', runs.map((r) => r.run))]
}

/** How many of `unit` some runs hold. */
export const unitsOf = (s: Pick<LootSummary, 'runs' | 'cubes' | 'ms'>, unit: LootUnit): number => (unit === 'run' ? s.runs : unit === 'cube' ? s.cubes : s.ms / 3_600_000)

/** An item the runs gave, or that their dungeons' cubes can give: how many in all, in how many runs (its chance a run), and how many the game's rates make of their cubes. */
export type ItemFamily = GoldKind | 'cards' | 'other'
export interface ItemStat {
  id: string
  name: string
  grade: number
  icon: string | null
  family: ItemFamily
  total: number
  runs: number
  expected: number
}
export function itemStats(runs: DungeonRun[]): ItemStat[] {
  const by = new Map<string, ItemStat>()
  const stat = (id: string): ItemStat | null => {
    const item = itemInfo(id)
    if (!item || item.kind === 'currency') return null
    const s = by.get(id) ?? { id, name: item.name.replace(' (Bound)', ''), grade: item.grade, icon: item.icon, family: familyOf(id) ?? 'other', total: 0, runs: 0, expected: 0 }
    by.set(id, s)
    return s
  }
  for (const r of runs) {
    for (const [id, n] of Object.entries(r.loot ?? {})) {
      const s = n > 0 ? stat(id) : null
      if (!s) continue
      s.total += n
      s.runs++
    }
    for (const id of Object.keys(DROPS[r.world] ?? {})) {
      const s = stat(id)
      if (s) s.expected += expectedOf(r, id)
    }
  }
  return [...by.values()].sort((a, b) => b.grade - a.grade || b.runs - a.runs || b.expected - a.expected || a.name.localeCompare(b.name))
}

/** Your luck: what you got against what the game's rates make of your cubes (1: just that), or null with nothing to expect. */
export const luck = (got: number, expected: number): number | null => (expected > 0 ? got / expected : null)
