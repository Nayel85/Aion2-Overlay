/**
 * The instances' catalogue, the one list every page builds on (the Personal bests' grids, the Characters
 * page's expeditions, a run's mode): each kind of content's instances in the game's order, their modes
 * (each one's world, the item level it asks, its guaranteed chest), their bosses (the final one last), and
 * the Nightmares' season. Only data under it to update:
 * - zones.ts (scripts/fetch-zones.mjs): the worlds, their names and modes;
 * - dungeonBosses.ts (scripts/fetch-dungeon-bosses.mjs): the bosses the end cube counts;
 * - expeditionCeilings.ts (scripts/fetch-expeditions.mjs): the guaranteed chests;
 * - dungeons.ts: the bosses' order in a run (and the Ascension Trials', questlog has none);
 * - instanceLevels.ts: the item levels;
 * - the lists below: which are open, the game's order, the Nightmares' season.
 */
import { DUNGEON_BOSSES as CUBE_BOSSES } from './dungeonBosses.ts'
import { DUNGEONS } from './dungeons.ts'
import { EXPEDITION_CEILINGS } from './expeditionCeilings.ts'
import { NIGHTMARE_ILVL, REQUIRED_ILVL, TRIAL_ILVL } from './instanceLevels.ts'
import { ZONES } from './zones.ts'

export type ContentKind = 'expedition' | 'transcendence' | 'trial' | 'raid'

export interface ContentMode {
  /** As instanceLevels.ts keys it: a zone's difficulty (`easy`, `normal`, `advanced`), a stage (`s1`), a trial's difficulty (`Hard`). */
  id: string
  label: string
  short: string
  /** A stage's number, for its label ("Stage {n}"). */
  n?: number
}

export interface ContentDef {
  label: string
  /** Its instances' column header. */
  head: string
  modes: ContentMode[]
}

const STAGES = [1, 2, 3, 4].map((n) => ({ id: `s${n}`, label: 'Stage {n}', short: 'Stage {n}', n }))
const TRIAL_DIFFICULTIES = ['Easy', 'Normal', 'Hard', 'Challenge', 'Insane', 'Hell', 'Doom']

export const CONTENT: Record<ContentKind, ContentDef> = {
  expedition: {
    label: 'Expeditions',
    head: 'Expedition',
    modes: [
      { id: 'easy', label: 'Exploration', short: 'Exp' },
      { id: 'normal', label: 'Conquest Normal', short: 'Normal' },
      { id: 'advanced', label: 'Conquest Hard', short: 'Hard' },
    ],
  },
  transcendence: { label: 'Transcendence', head: 'Dungeon', modes: [{ id: 'easy', label: 'Exploration', short: 'Exp' }, ...STAGES] },
  trial: { label: 'Ascension Trials', head: 'Trial', modes: TRIAL_DIFFICULTIES.map((d) => ({ id: d, label: d, short: d })) },
  raid: {
    label: 'Raids',
    head: 'Raid',
    modes: [
      { id: 'easy', label: 'Easy', short: 'Easy' },
      { id: 'normal', label: 'Normal', short: 'Normal' },
      { id: 'advanced', label: 'Hard', short: 'Hard' },
    ],
  },
}

/** Each kind's instances in the game's order, and those open on the global client (2026-11-25): the rest come later. */
const ORDER: Record<ContentKind, { all: string[]; open: string[] }> = {
  expedition: {
    all: Object.keys(DUNGEONS.expedition),
    open: ['Krao Cave', 'Draupnir', 'Urugugu Canyon', 'Vakron Sky Island', 'Fire Temple', 'Ferocious Horn Den'],
  },
  transcendence: { all: Object.keys(DUNGEONS.transcendence), open: ['Deus Research Base', 'Shattered Arkanis'] },
  trial: {
    all: ['Nightmare Altar', "Tyrant's Hideout", 'Sanctum of Loathing', 'Depository of Fates', 'Forgotten Repository', 'Chamber of the Dead'],
    open: ['Nightmare Altar', 'Sanctum of Loathing'],
  },
  raid: { all: Object.keys(DUNGEONS.sanctuary), open: ['Abyssal Forge: Ludra'] },
}
/** The bosses' order in a run where dungeons.ts's is not (aion2pilot's Conquest route). */
const RUN_ORDER: Record<string, string[]> = { 'Urugugu Canyon': ['Judge Urahum', 'Guardian Captain Raur', 'Divine Auldor'] }
const ORDER_OF: Record<ContentKind, Record<string, string[]>> = {
  expedition: DUNGEONS.expedition,
  transcendence: DUNGEONS.transcendence,
  trial: DUNGEONS.awakening,
  raid: DUNGEONS.sanctuary,
}

export interface Instance {
  name: string
  kind: ContentKind
  open: boolean
  /** Its bosses: the sub-bosses that unlock the end cube's rewards, then the final one. */
  bosses: string[]
  /** Each mode's world. */
  worlds: Record<string, number>
}

/** A zone's instance and mode, or null: no instance of the catalogue's. */
function zonePlace(world: string): { kind: ContentKind; name: string; mode: string } | null {
  const z = ZONES[world]
  if (!z) return null
  if (z[2] === 'awaken') {
    const m = /^(.*) \((\w+)\)$/.exec(z[0])
    return m ? { kind: 'trial', name: m[1]!, mode: m[2]! } : null
  }
  const mode = z[4] !== null ? `s${z[4]}` : z[3]
  if (!mode) return null
  if (z[2] === 'party') return { kind: DUNGEONS.transcendence[z[0]] ? 'transcendence' : 'expedition', name: z[0], mode }
  if (z[2] === 'raid') return { kind: 'raid', name: z[0], mode }
  return null
}

const PLACES = new Map<number, { kind: ContentKind; name: string; mode: string }>()
for (const w of Object.keys(ZONES)) {
  const p = zonePlace(w)
  if (p && CONTENT[p.kind].modes.some((m) => m.id === p.mode)) PLACES.set(Number(w), p)
}

/** An instance's bosses: those every mode's end cube counts (questlog's), in the run's order; else dungeons.ts's. */
function bossesOf(kind: ContentKind, name: string, worlds: number[]): string[] {
  const order = RUN_ORDER[name] ?? ORDER_OF[kind][name] ?? []
  const lists = worlds.map((w) => CUBE_BOSSES[w]).filter((l): l is string[] => !!l)
  if (!lists.length) return order
  const common = [...new Set(lists.reduce((a, b) => a.filter((x) => b.includes(x))))]
  const at = (b: string): number => (order.includes(b) ? order.indexOf(b) : 99)
  return common.sort((a, b) => at(a) - at(b))
}

/** Each kind's instances, the open ones first, in the game's order. */
export const INSTANCES = Object.fromEntries(
  (Object.keys(CONTENT) as ContentKind[]).map((kind) => {
    const { all, open } = ORDER[kind]
    const names = [...new Set([...open, ...all, ...[...PLACES.values()].filter((p) => p.kind === kind).map((p) => p.name)])]
    return [
      kind,
      names.map((name): Instance => {
        const worlds = Object.fromEntries([...PLACES].filter(([, p]) => p.kind === kind && p.name === name).map(([w, p]) => [p.mode, w]))
        return { name, kind, open: open.includes(name), bosses: bossesOf(kind, name, Object.values(worlds)), worlds }
      }),
    ]
  }),
) as Record<ContentKind, Instance[]>

/** A zone's instance and mode, or null. */
export function instanceAt(world: number): { instance: Instance; mode: ContentMode } | null {
  const p = PLACES.get(world)
  if (!p) return null
  const instance = INSTANCES[p.kind].find((i) => i.name === p.name)!
  return { instance, mode: CONTENT[p.kind].modes.find((m) => m.id === p.mode)! }
}

/** The item level an instance's mode asks to enter, when a source gives it. */
export const instanceIlvl = (instance: Instance, mode: string): number | undefined =>
  instance.kind === 'trial' ? TRIAL_ILVL[mode] : REQUIRED_ILVL[instance.name]?.[mode]

/** An instance's mode's guaranteed chest: cubes opened before it (the expeditions'), when it has one. */
export const instanceCeiling = (instance: Instance, mode: string): number | undefined => {
  const w = instance.worlds[mode]
  return w === undefined ? undefined : EXPEDITION_CEILINGS[w]
}

// ---- the Nightmares --------------------------------------------------------------------------------

export type NightmareGrade = keyof typeof NIGHTMARE_ILVL

/**
 * The Nightmares of the season (the global client's first, 2026-09-30 to 12-16), in the game's order,
 * with their grade: four common, two rare (each unlocked by two commons at level 10), the legend last
 * (by the two rares). Fextralife's Nightmare Dungeons.
 */
export const NIGHTMARE_SEASON: { boss: string; grade: NightmareGrade }[] = [
  { boss: 'Gatekeeper Pinopi', grade: 'common' },
  { boss: 'Furious Feruk', grade: 'common' },
  { boss: "Fafnir's Poison Blood", grade: 'common' },
  { boss: 'Wraith Giselle', grade: 'common' },
  { boss: 'Fortress Guardian Notun', grade: 'rare' },
  { boss: 'Mutated Gerod', grade: 'rare' },
  { boss: "Zikel's Apparition", grade: 'legend' },
]

/** A Nightmare level's suggested item level for a boss of a grade. */
export const nightmareIlvl = (grade: NightmareGrade | null, level: number): number | undefined => (grade ? NIGHTMARE_ILVL[grade][level - 1] : undefined)
