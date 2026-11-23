import { GATHERABLES, type GatherDrop } from './gatherables.ts'
import { RECIPES } from './recipes.ts'

/** What a gathering or a craft will give: the item, how many, and how it shows. */
export interface ForecastItem {
  id: number
  count: number
  name: string
  grade: number
  /** A path under questlog's Texture/ (main/icons.ts) or a bundled icon's name; null for none. */
  icon: string | null
}

/** A gathering's or a craft's outcome, known as it starts (main/gather.ts). */
export interface GatherForecast {
  kind: 'gather' | 'craft'
  /** A craft's better item (green, where a white one is crafted) or its double is a proc. */
  outcome: 'ok' | 'rankUp' | 'fail' | 'proc'
  /** It gives twice as much (a gathering's x2, or a craft whose proc is its item twice). */
  doubled: boolean
  /** What it will give (on a failed gathering, what it would have); null while not known. */
  item: ForecastItem | null
  /** When it started (ms), and how long it takes, as its steps say (null when not told). */
  at: number
  durationMs: number | null
  /** A gathering's rolls, as the game rolled them (the engine's `gather_rolls`); none for a craft. */
  rolls: GatherRoll[]
}

/** One roll of a gathering: how long it plays, what it adds to each gauge, Lady Luck's or the doubling. */
export interface GatherRoll {
  ms: number
  success: number
  failure: number
  luck: boolean
  doubled: boolean
}

/**
 * A gathering spot's kind -> the plain item it gives, learnt from its results. The kind is its
 * template and the number its spawn ends with (`template:number`): the template alone is shared by
 * spots of other resources (1500000), the number is the same on every spot of one (0x1f6fa332 Odyle).
 */
export type GatherTemplates = Record<string, number>

/** Known before any gathering: the Odyle spots. */
export const GATHER_TEMPLATES_SEED: GatherTemplates = { '1500062:527409970': 610_610_013, '1500000:527409970': 610_610_013 }

/** A spot's kind as learnt by: its template and its spawn's number, or the template alone without one. */
export const spotKind = (template: number | null | undefined, kind: number | null | undefined): string | null =>
  template === null || template === undefined ? null : kind === null || kind === undefined ? String(template) : `${template}:${kind}`

const asItem = (d: GatherDrop): ForecastItem => ({ id: d[0], count: d[1], name: d[2], grade: d[3], icon: d[4] })

/** Each plain item's grades (1 plain, 2 ranked up...): every spot that gives one gives the same. */
const BY_PLAIN = new Map<number, Record<string, GatherDrop>>()
for (const [, , groups] of Object.values(GATHERABLES)) if (groups['1']) BY_PLAIN.set(groups['1'][0], groups)

/** What a gathering gives: its spot's plain item, at the grade the game rolled (1 plain, 2 ranked up...). */
export function gatherItem(plain: number | undefined, grade: number): ForecastItem | null {
  if (!plain) return null
  const groups = BY_PLAIN.get(plain)
  const drop = groups?.[String(grade)] ?? groups?.['1']
  return drop ? asItem(drop) : null
}

/** What a craft makes, plain or on a proc; and whether its proc is the same item twice. */
export function craftItem(recipe: number, proc: boolean): { item: ForecastItem | null; doubled: boolean } {
  const r = RECIPES[String(recipe)]
  if (!r) return { item: null, doubled: false }
  const [plain, better] = r
  if (!proc || !better) return { item: asItem(plain), doubled: false }
  return { item: asItem(better), doubled: better[0] === plain[0] && better[1] > plain[1] }
}
