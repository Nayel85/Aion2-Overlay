/**
 * The gatherings over the sessions kept (components/dashboard/GatherStatsView.vue): picked by
 * character, since when and resource, then by character and resource: how many, failed, ranked up,
 * doubled (Plentiful Harvest), a plant's x3, Lady Luck's triggers, and the skills' levels seen, with
 * the x2 its Plentiful Harvest level makes expected.
 */
import { gatherSkill } from './gatherSkills.ts'
import type { GatheringDone, PlaySession } from './sessions.ts'
import { ITEMS } from './items.ts'

export interface NamedGathering {
  name: string
  gathering: GatheringDone
}

export interface GatherFilter {
  names: string[]
  from: number
  /** A resource (its plain item), null for all. */
  resource: number | null
}

/** Every gathering kept, the oldest first, with whose it was. */
export function allGatherings(sessions: PlaySession[]): NamedGathering[] {
  return sessions.flatMap((s) => (s.gatherings ?? []).map((gathering) => ({ name: s.name, gathering }))).sort((a, b) => a.gathering.at - b.gathering.at)
}

export const filterGatherings = (list: NamedGathering[], f: GatherFilter): NamedGathering[] =>
  list.filter(({ name, gathering }) => (!f.names.length || f.names.includes(name)) && gathering.at >= f.from && (f.resource === null || gathering.resource === f.resource))

/** The resources some gatherings were of, the most gathered first: [plain item, name, count]. */
export function gatherResources(list: NamedGathering[]): [number, string, number][] {
  const n = new Map<number, number>()
  for (const { gathering } of list) n.set(gathering.resource, (n.get(gathering.resource) ?? 0) + 1)
  return [...n].map(([id, count]): [number, string, number] => [id, (ITEMS[id]?.[0] ?? `#${id}`).replace(' (Bound)', ''), count]).sort((a, b) => b[2] - a[2])
}

export interface GatherRow {
  name: string
  resource: number
  resourceName: string
  icon: string | null
  done: number
  failed: number
  /** Made at a better grade (a Fine, Pure, Radiant one). */
  rankUps: number
  /** Made more than once at once by a better grade (a plant's x3). */
  multiplied: number
  /** Doubled (Plentiful Harvest). */
  doubled: number
  /** Lady Luck's triggers in all. */
  luck: number
  /** Each skill seen, its highest level: [name, level]. */
  skills: [string, number][]
  /** The doublings Plentiful Harvest's level makes expected of the successes, null without it seen. */
  expectedDoubled: number | null
}

function row(name: string, resource: number, list: GatheringDone[]): GatherRow {
  const levels = new Map<string, number>()
  let luck = 0
  // A doubling's chance: Plentiful Harvest's, at its highest level seen. It shows only when it fires,
  // so its level is known from one doubling on, and its chance holds for every success.
  let chance: number | null = null
  for (const g of list) {
    for (const id of g.skills) {
      const s = gatherSkill(id)
      if (!s) continue
      levels.set(s.skill.name, Math.max(levels.get(s.skill.name) ?? 0, s.level))
      if (s.skill.name === 'Lady Luck') luck++
      if (s.skill.chancePerLevel) chance = Math.max(chance ?? 0, Math.min(1, s.skill.chancePerLevel * s.level))
    }
  }
  const made = list.filter((g) => !g.failed)
  const expected = chance === null ? null : made.length * chance
  const info = ITEMS[resource]
  return {
    name,
    resource,
    resourceName: (info?.[0] ?? `#${resource}`).replace(' (Bound)', ''),
    icon: info?.[2] ?? null,
    done: list.length,
    failed: list.length - made.length,
    rankUps: made.filter((g) => g.item !== resource).length,
    multiplied: made.filter((g) => g.item === resource && g.amount > (g.doubled ? 2 : 1)).length,
    doubled: made.filter((g) => g.doubled).length,
    luck,
    skills: [...levels].sort((a, b) => a[0].localeCompare(b[0])),
    expectedDoubled: expected,
  }
}

/** By character and resource, the most gathered first; then each resource for all the characters picked (name ''). */
export function gatherRows(list: NamedGathering[]): GatherRow[] {
  const by = new Map<string, GatheringDone[]>()
  for (const { name, gathering } of list) {
    const key = `${name}\u0000${gathering.resource}`
    by.set(key, [...(by.get(key) ?? []), gathering])
  }
  return [...by]
    .map(([key, gs]) => {
      const [name, resource] = key.split('\u0000')
      return row(name!, Number(resource), gs)
    })
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name))
}

/** All of them together. */
export function gatherTotal(list: NamedGathering[]): Pick<GatherRow, 'done' | 'failed' | 'rankUps' | 'multiplied' | 'doubled' | 'luck'> {
  const made = list.filter((g) => !g.gathering.failed)
  return {
    done: list.length,
    failed: list.length - made.length,
    rankUps: made.filter((g) => g.gathering.item !== g.gathering.resource).length,
    multiplied: made.filter((g) => g.gathering.item === g.gathering.resource && g.gathering.amount > (g.gathering.doubled ? 2 : 1)).length,
    doubled: made.filter((g) => g.gathering.doubled).length,
    luck: list.reduce((n, g) => n + g.gathering.skills.filter((id) => gatherSkill(id)?.skill.name === 'Lady Luck').length, 0),
  }
}
