/**
 * The gathering skills a roll can fire (pages' stats: components/dashboard/GatherStatsView.vue), read
 * from the second id of each of its actions, which carries the skill's level: each skill numbers its
 * levels from a base of its own. Nayel's of 2026-11-23: Proficient Handling Lv. 10 810, Delicate
 * Touch Lv. 5 105, Lady Luck Lv. 10 310, Plentiful Harvest Lv. 3 71002 (its Lv. 1 is 71000).
 */
export interface GatherSkill {
  /** Its name, as the game's. */
  name: string
  /** The id of its level 0: the id less this is the level. */
  base: number
  /** The highest level a base takes ids up to. */
  levels: number
  /** What it does, in short. */
  about: string
  /** Its chance a level (0-1) when it rolls one, as far as known. */
  chancePerLevel?: number
}

export const GATHER_SKILLS: GatherSkill[] = [
  { name: 'Delicate Touch', base: 100, levels: 20, about: 'Less failure gauge on a failed roll' },
  { name: 'Lady Luck', base: 300, levels: 20, about: 'A chance of x2.5 or x4 success gauge, the failure gauge at half or more' },
  { name: 'Proficient Handling', base: 800, levels: 20, about: 'More success gauge on every successful roll' },
  // Lv. 3: 30% (the game's text), taken as 10% a level.
  { name: 'Plentiful Harvest', base: 70_999, levels: 20, about: 'A chance of twice the gathered material', chancePerLevel: 0.1 },
]

/** A fired skill's name and level, from its id; null for one not known (its id shown instead). */
export function gatherSkill(id: number): { skill: GatherSkill; level: number } | null {
  for (const skill of GATHER_SKILLS) {
    const level = id - skill.base
    if (level >= 1 && level <= skill.levels) return { skill, level }
  }
  return null
}
