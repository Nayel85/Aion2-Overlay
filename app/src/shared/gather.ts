/** A gathering's outcome, known as it starts (main/gather.ts). */
export interface GatherForecast {
  outcome: 'ok' | 'rankUp' | 'fail'
  /** It gives twice as much (the game's x2). */
  doubled: boolean
  /** What it will give (the ranked-up item on a rank up), once its spot's kind is known; null before. */
  item: number | null
  /** When it started (ms). */
  at: number
}

/** What a gathering spot's kind gives, learnt from its gatherings: the item, and the ranked-up one. */
export type GatherItems = Record<string, { item?: number; up?: number }>

/** Known before any gathering: the Odyle nodes (template 1500062) give Odyle, Fine Odyle ranked up. */
export const GATHER_ITEMS_SEED: GatherItems = { '1500062': { item: 610_610_013, up: 610_610_014 } }
