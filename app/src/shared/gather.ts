/** A gathering's or a craft's outcome, known as it starts (main/gather.ts). */
export interface GatherForecast {
  kind: 'gather' | 'craft'
  /** A craft's better item (green, where a white one is crafted) is a proc. */
  outcome: 'ok' | 'rankUp' | 'fail' | 'proc'
  /** It gives twice as much (the game's x2). */
  doubled: boolean
  /** What it will give (the ranked-up item on a rank up), once its spot's kind is known; null before. */
  item: number | null
  /** When it started (ms). */
  at: number
}

/**
 * What a gathering spot's kind (its template) or a recipe (`r` and its id) gives, learnt from what
 * they gave: the item, and the better one (ranked up, a proc).
 */
export type GatherItems = Record<string, { item?: number; up?: number }>

/**
 * Known before any: the Odyle nodes (template 1500062) give Odyle, Fine Odyle ranked up; the
 * Orichalcum Guard (recipe 111086001), Splendent ones on a proc; the Orichalcum Ingot (115016001).
 */
export const GATHER_ITEMS_SEED: GatherItems = {
  '1500062': { item: 610_610_013, up: 610_610_014 },
  r111086001: { item: 115_060_023, up: 115_050_014 },
  r115016001: { item: 610_710_001 },
}
