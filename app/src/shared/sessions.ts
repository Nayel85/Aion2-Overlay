/**
 * Play sessions: one per character's login, from it until the next login (of any character). Each
 * keeps its Abyss Points and its Kina by where they came from; the past ones are listed on the
 * Session page (main/sessions.ts keeps them).
 *
 * Where a gain of Abyss Points came from is told as it comes, by what is known then: a PvP kill or
 * assist of yours just before it, the zone you are in (world ids as the map data and the owner's
 * 2026-11-22 logs have them; the instances named by zones.ts, scripts/fetch-zones.mjs) and a
 * Spacetime Rift's window. A quest's rewards come a moment after their gains (`3F E2`, after the
 * items' `1B 56`): `questReward` moves them to the quests then.
 */
import { characterId } from './characters.ts'
import { riftOf, RIFT_WORLDS } from './abyss.ts'
import { ABYSS_WORLDS, CONTINENT_WORLDS, DUNGEON_WORLDS } from './worlds.ts'
import { LOOT } from './loot.ts'
import { ITEMS } from './items.ts'
import { QUESTS } from './quests.ts'
import { SUPPLIES } from './supplies.ts'
import { GATHERABLES } from './gatherables.ts'
import { itemIcon, type ItemTuple } from './itemRef.ts'
import { RECIPES } from './recipes.ts'
import { ZONES } from './zones.ts'
import { instanceAt, NIGHTMARE_BOSSES } from './instances.ts'

export { ABYSS_WORLDS }

/** The arenas: every kind of them (combat, capture the flag, domination...). */
const isArena = (world: number | null): boolean => world !== null && !!ZONES[world]?.[1]?.startsWith('arena')

/** The Artifact corridors' instances (Reshanta's Root, Sulfur Tree Island, Siel's Wings): ~32k AP in their 2 min 10. */
export const CORRIDOR_WORLDS: readonly number[] = [503001, 503002, 503003]
/** The items a quest's rewards name: Abyss Points and Kina (the same ids as in your bags). */
export const AP_ITEM = 930100003
export const KINA_ITEM = 930100031
/** The other currencies a session counts (the engine's SESSION_CURRENCIES), by item id. */
export const ENHANCE_STONE = 930100023
export const PHANTASMAL_FRAGMENT = 930100017
/** The Centuryroot Tokens (each character's). */
export const CENTURYROOT_TOKEN = 930100011
/** The season's Oath Coins, its points (each character's; the engine's SEASON_POINTS). */
export const SEASON_POINTS = 930100019
/** The Abyss Points, as an item (the engine's ABYSS_POINTS). */
export const ABYSS_POINTS = 930100003
export const CURRENCY_LABELS: Record<string, string> = {
  [ENHANCE_STONE]: 'Enhance Stones',
  [PHANTASMAL_FRAGMENT]: 'Phantasmal Fragments',
  [SEASON_POINTS]: 'Oath Coins',
}
/** A quest's reward is the gain it came with, this long before it at most (they come together). */
export const QUEST_WITHIN_MS = 3_000
/** A gain this soon after a PvP kill or assist of yours is that kill's (as the PvP page has it). */
export const PVP_AFTER_MS = 6_000

/** Where Abyss Points came from; `dungeon:<id>` a dungeon's, `zone:<id>` another instance's (by their names). */
export type ApSource = 'abyssPvp' | 'rift' | 'arena' | 'pvp' | 'corridor' | 'reward' | 'supply' | 'abyssMobs' | 'continentMobs' | 'other' | `dungeon:${number}` | `zone:${number}`

export const SOURCE_LABELS: Record<string, string> = {
  abyssPvp: 'Abyss PvP',
  rift: 'Spacetime Rift',
  arena: 'Arenas',
  pvp: 'PvP elsewhere',
  corridor: 'Corridors',
  reward: 'Quests',
  supply: 'Supply requests',
  abyssMobs: 'Abyss monsters',
  continentMobs: 'Monsters on the continents',
  other: 'Unknown',
}

/** A gain's source: `pvpAt` is your last PvP kill or assist (ms), `world` your zone (null: not known). */
export function apSource(gained: number, at: number, world: number | null, pvpAt: number | null): ApSource {
  const afterPvp = pvpAt !== null && at - pvpAt >= 0 && at - pvpAt <= PVP_AFTER_MS
  const continent = world !== null && RIFT_WORLDS.has(world)
  const rift = continent && riftOf(at) !== null
  if (afterPvp) return world !== null && ABYSS_WORLDS.includes(world) ? 'abyssPvp' : isArena(world) ? 'arena' : rift ? 'rift' : 'pvp'
  if (world !== null && CORRIDOR_WORLDS.includes(world)) return 'corridor'
  if (isArena(world)) return 'arena'
  return zoneSource(at, world)
}

/** A rise of Kina's source: by zone, as Abyss Points', but no PvP (kills give none); a quest's says so after it (questReward). */
export function kinaSource(at: number, world: number | null): ApSource {
  if (world !== null && CORRIDOR_WORLDS.includes(world)) return 'corridor'
  if (isArena(world)) return 'arena'
  return zoneSource(at, world)
}

/** Where you were: the Abyss, a rift, a continent, a dungeon, another zone, or not known (unknown). */
function zoneSource(at: number, world: number | null): ApSource {
  if (world === null) return 'other'
  if (ABYSS_WORLDS.includes(world)) return 'abyssMobs'
  if (RIFT_WORLDS.has(world) && riftOf(at) !== null) return 'rift'
  if (CONTINENT_WORLDS.includes(world)) return 'continentMobs'
  if (DUNGEON_WORLDS.includes(world) || dungeonOf(world)) return `dungeon:${world}`
  return `zone:${world}`
}

/** A source's name, for the page: a dungeon or another instance by the game's name for it (by its id if not known). */
export function sourceLabel(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source]
  const [kind, id] = source.split(':')
  if (kind === 'dungeon') return `Dungeon: ${ZONES[id!]?.[0] ?? id}`
  if (kind === 'zone') return ZONES[id!]?.[0] ?? `Zone ${id}`
  return source
}

/**
 * A dungeon run: from entering a zone the game calls a dungeon (questlog's dungeon type) to leaving
 * it, with what it gave. Its kind is the zone's type, or what a counter said as you entered it (a
 * Nightmare's entry, an Ascension Trial's, a Daily Dungeon's).
 */
export interface DungeonRun {
  world: number
  name: string
  kind: string
  start: number
  /** Null while you are in it. */
  end: number | null
  /** When the game let you in (`01 40`) and when its last boss fell (`01 61`): the clear time. */
  started?: number
  cleared?: number
  /** A Nightmare's boss (its id: NIGHTMARE_BOSSES) and level. */
  boss?: number
  level?: number
  ap: number
  kina: number
  /** The other currencies (CURRENCY_LABELS), by item id. */
  currencies: Record<string, number>
  /** What its cubes gave worth keeping (LOOT: all but the lesser equipment), by item id. */
  loot?: Record<string, number>
  /** How many cubes it gave (the membership's second one with the first: `15 57`'s source). */
  cubes?: number
  /** Your deaths in it, and the group's (yours with them). */
  deaths?: number
  partyDeaths?: number
  /** An arena's match: your group's size in it, at most (one, or none: Solo; more: Co-op), and your kills, deaths and assists. */
  team?: number
  kda?: { kills: number; deaths: number; assists: number }
}

/**
 * Runs of one dungeon and mode (one zone) as one: their Abyss Points, Kina, currencies, loot and
 * deaths together, timed from the first's start to the last's end; `count` of them.
 */
export function mergeRuns(runs: DungeonRun[]): DungeonRun & { count: number } {
  const sum = (a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> => {
    const out = { ...a }
    for (const [id, n] of Object.entries(b ?? {})) out[id] = (out[id] ?? 0) + n
    return out
  }
  const first = runs[0]!
  return runs.slice(1).reduce<DungeonRun & { count: number }>(
    (m, r) => ({
      ...m,
      end: r.end,
      ap: m.ap + r.ap,
      kina: m.kina + r.kina,
      currencies: sum(m.currencies, r.currencies),
      loot: sum(m.loot, r.loot),
      deaths: (m.deaths ?? 0) + (r.deaths ?? 0),
      partyDeaths: (m.partyDeaths ?? 0) + (r.partyDeaths ?? 0),
      count: m.count + 1,
    }),
    { ...first, count: 1 },
  )
}
/** A session's runs by zone and name (one dungeon in one mode; one field boss), in the order first run: each group's runs, oldest first. */
export function runGroups(runs: DungeonRun[]): DungeonRun[][] {
  const by = new Map<string, DungeonRun[]>()
  // By zone and its name as shown (an arena's Solo and Co-op apart).
  for (const r of runs) by.set(`${r.world}:${runName(r)}`, [...(by.get(`${r.world}:${runName(r)}`) ?? []), r])
  return [...by.values()]
}
/**
 * What a session did, in a few words: its dungeons by zone and mode with how many runs ("Vakron Sky
 * Island · Normal ×9"), its Shugo Festival's and invasions' games, then its field bosses by name
 * ("Kashapa, Dartan"), then its duty missions ("3 duty missions"); the counted runs only, in the
 * order first done.
 */
export function sessionDigest(s: PlaySession, tr: Translate = untranslated): string[] {
  const runs = (s.runs ?? []).filter(runCounts)
  const parts = runGroups(runs.filter((r) => !runIsOneOff(r))).map((g) => (g.length > 1 ? `${runName(g[0]!, tr)} ×${g.length}` : runName(g[0]!, tr)))
  const bosses = [...new Set(runs.filter((r) => r.kind === 'fieldboss').map((r) => r.name))]
  const cubes = runs.filter((r) => r.kind === 'hiddencube').length
  if (cubes) bosses.push(tr(cubes === 1 ? '{n} Hidden Cube' : '{n} Hidden Cubes', { n: cubes }))
  const duties = s.duties?.length ? [tr(s.duties.length === 1 ? '{n} duty mission' : '{n} duty missions', { n: s.duties.length })] : []
  const supplies = s.supplies?.length ? [tr(s.supplies.length === 1 ? '{n} supply request' : '{n} supply requests', { n: s.supplies.length })] : []
  const crafts = s.crafts?.length ? [tr(s.crafts.length === 1 ? '{n} craft' : '{n} crafts', { n: s.crafts.length })] : []
  return [...parts, ...(bosses.length ? [bosses.join(', ')] : []), ...duties, ...supplies, ...crafts]
}
/** Done at once, with what it gave: a field boss's chest, a Hidden Cube opened. Not a dungeon. */
export const runIsOneOff = (run: DungeonRun): boolean => run.kind === 'fieldboss' || run.kind === 'hiddencube'
/** A field boss is killed, not cleared, a cube opened: no clear time, just when. */
/** A run just begun: nothing earned yet, no death (a new field of DungeonRun gets its start here). */
export const newRun = (world: number, name: string, kind: string, start: number): DungeonRun => ({ world, name, kind, start, end: null, ap: 0, kina: 0, currencies: {}, deaths: 0, partyDeaths: 0 })
/** A run's time: from the game letting you in to its last boss (cleared), else in it to out. */
export const runMs = (r: DungeonRun): number => (r.cleared !== undefined ? r.cleared - (r.started ?? r.start) : (r.end ?? r.start) - r.start)
/** A cleared run's clear time, the game's (let in to the last boss): for runs with both. */
export const clearMs = (r: { started?: number; cleared?: number }): number => r.cleared! - r.started!
export const runIsTimed = (run: DungeonRun): boolean => !runIsOneOff(run)

/** questlog's item grades: Unique (gold) and up are counted, to 61; 71 (Soul Codex, Silentium) is no colour. */
export const UNIQUE_GRADE = 41
const isUnique = (grade: number): boolean => grade >= UNIQUE_GRADE && grade < 71
/** An item as the Session page shows it: a dungeon reward's (LOOT: its Arcana cards...), else any currency, material or gold equipment (ITEMS). */
export interface ItemInfo {
  name: string
  grade: number
  icon: string | null
  kind: 'currency' | 'arcana' | 'equipment' | 'item'
}
export function itemInfo(id: string | number): ItemInfo | undefined {
  const l = LOOT[id]
  if (l) return { name: l[0], grade: l[1], icon: l[3], kind: l[2] }
  const i = ITEMS[id]
  if (i) return { name: i[0], grade: i[1], icon: i[2], kind: i[3] === 'currency' ? 'currency' : i[3] === 'arcana' ? 'arcana' : 'item' }
  return MADE().get(Number(id))
}
/** An item's name as shown: without "(Bound)" (whether it is is told apart where it matters). */
export const plainName = (name: string): string => name.replace(' (Bound)', '')
/** An item as a row shows it: its name (its number when not known), grade (common when not) and icon. */
export function itemRow(id: string | number): { name: string; grade: number; icon: string | null } {
  const info = itemInfo(id)
  return { name: plainName(info?.name ?? `#${id}`), grade: info?.grade ?? 11, icon: itemIcon(info?.icon) }
}
/** The items crafts make and gatherings give, by id: those the loot and item tables lack. Built once, when first needed. */
let made: Map<number, ItemInfo> | null = null
function MADE(): Map<number, ItemInfo> {
  if (made) return made
  made = new Map()
  const add = (d: ItemTuple | null): void => void (d && !made!.has(d[0]) && made!.set(d[0], { name: d[2], grade: d[3], icon: d[4], kind: 'item' }))
  for (const [plain, proc] of Object.values(RECIPES)) add(plain), add(proc)
  for (const [, , groups] of Object.values(GATHERABLES)) for (const d of Object.values(groups)) add(d)
  return made
}
/** Equipment under Unique (grey, green, blue): listed for the Inventory page, never kept as loot. */
export const lesserEquipment = (id: string | number): boolean => {
  const i = ITEMS[id]
  return !!i && i[1] < UNIQUE_GRADE && EQUIPMENT_SUBS.has(i[3])
}
/** What a reward gave (a cube's `15 57`, a Shugo Festival's chests) worth keeping, by item id: all but the lesser equipment. */
export function notableLoot(items: { item: number; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { item, amount } of items) if (itemInfo(item) && !lesserEquipment(item)) out[item] = (out[item] ?? 0) + amount
  return out
}
/** The kinds of Unique-or-better loot counted apart: equipment, crafting materials, wings and artworks. */
export type GoldKind = 'equipment' | 'craft' | 'wings'
const EQUIPMENT_SUBS = new Set(['greatsword', 'sword', 'dagger', 'bow', 'magicbook', 'orb', 'mace', 'staff', 'guarder', 'torso', 'pants', 'helmet', 'shoulder', 'gloves', 'boots', 'cape', 'necklace', 'earring', 'ring', 'bracelet', 'belt', 'amulet', 'rune'])
const CRAFT_SUBS = new Set(['craftresource', 'gatherresource', 'material', 'elevate', 'conversionresource', 'conversionresource_special', 'createarcanamaterial', 'arcanamaterial', 'misc'])
/** A Unique-or-better item's kind (its questlog sub-category, its name), or null: not counted (a skin, a title, a box...). */
export function goldKind(id: string | number): GoldKind | null {
  const item = itemInfo(id)
  if (!item || !isUnique(item.grade) || item.kind === 'arcana' || item.kind === 'currency') return null
  const sub = ITEMS[id]?.[3]
  if (sub === 'getwing' || /Wings|Artwork/.test(item.name)) return 'wings'
  if (item.kind === 'equipment' || (sub && EQUIPMENT_SUBS.has(sub))) return 'equipment'
  if (!sub || CRAFT_SUBS.has(sub) || /Amplify Stone|Sync Stone/.test(item.name)) return 'craft'
  return null
}
/** What some runs gave that counts: Unique-or-better equipment, crafting materials, wings and artworks, and Arcana cards. */
export interface LootCounts {
  equipment: number
  craft: number
  wings: number
  cards: number
}
export function lootCounts(runs: DungeonRun[]): LootCounts {
  const counts: LootCounts = { equipment: 0, craft: 0, wings: 0, cards: 0 }
  for (const r of runs)
    for (const [id, n] of Object.entries(r.loot ?? {})) {
      const kind = goldKind(id)
      if (kind) counts[kind] += n
      if (itemInfo(id)?.kind === 'arcana') counts.cards += n
    }
  return counts
}
/** The loot kinds as the Session page names them, in order. */
export const LOOT_KINDS: { key: keyof LootCounts; label: string }[] = [
  { key: 'equipment', label: 'Gold equipment' },
  { key: 'craft', label: 'Gold materials' },
  { key: 'wings', label: 'Wings & artworks' },
  { key: 'cards', label: 'Arcana cards' },
]

/**
 * An item's icon (the game's, from questlog: scripts/fetch-loot.mjs, fetch-items.mjs), as the app
 * serves it: a bundled one by its name, one with a path ("Item/Armor/...") through the main
 * process, which fetches it once and keeps it (main/icons.ts).
 */
export { itemIcon }
/** A currency's (or any item's) game icon: Kina, Abyss Points, Oath Coins, Enhance Stones... */
export const currencyIcon = (id: number | string): string | null => itemIcon(itemInfo(id)?.icon)

/** One line of what a run gave: an item, how many, and whether it is a currency (Kina, Abyss Points...). */
export interface RewardRow {
  id: string
  name: string
  grade: number
  amount: number
  icon: string | null
  currency: boolean
}
const CURRENCY_ORDER = [AP_ITEM, KINA_ITEM].map(String)
/** Abyss Points first, then Kina, then the other currencies. */
const rank = (id: string): number => (CURRENCY_ORDER.includes(id) ? CURRENCY_ORDER.indexOf(id) : CURRENCY_ORDER.length)
/**
 * What a run gave, to list: its Abyss Points, Kina and currencies (all it earned in there, its cubes'
 * and the rest: monsters, the equipment's auto-extraction), then its cubes' items, the best first.
 */
export function runRewards(run: DungeonRun): RewardRow[] {
  const row = (id: string, amount: number): RewardRow => {
    const item = itemInfo(id)
    return { id, name: item?.name ?? CURRENCY_LABELS[id] ?? `#${id}`, grade: item?.grade ?? 11, amount, icon: itemIcon(item?.icon), currency: !item || item.kind === 'currency' }
  }
  const totals: Record<string, number> = { ...run.currencies, [AP_ITEM]: run.ap, [KINA_ITEM]: run.kina }
  for (const [id, n] of Object.entries(run.loot ?? {})) if (itemInfo(id)?.kind === 'currency') totals[id] = Math.max(totals[id] ?? 0, n)
  const currencies = Object.entries(totals)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => row(id, n))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  // An item the catalogue lacks still shown, as its number (a Hidden Cube keeps all it gave).
  const items = Object.entries(run.loot ?? {})
    .filter(([id]) => itemInfo(id)?.kind !== 'currency' && !(id in totals))
    .map(([id, n]) => row(id, n))
    .sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name))
  return [...currencies, ...items]
}

/** The dungeon types (questlog's), as the Session page names them. */
export const RUN_KIND_LABELS: Record<string, string> = {
  quest: 'Quest dungeons',
  party: 'Party dungeons',
  exploration: 'Exploration',
  shugo: 'Shugo Festival',
  invasion: 'Dimensional Invasion',
  fieldevent: 'Field events',
  fieldboss: 'Field bosses',
  arena: 'Arenas',
  conquest: 'Conquest',
  transcendence: 'Transcendence',
  raid: 'Raids',
  seal: 'Seal dungeons',
  awaken: 'Ascension Trials',
  bosschallenge: 'Nightmares',
  nightmare: 'Nightmares',
  growth: 'Growth dungeons',
  ascension: 'Ascension Trials',
  daily: 'Daily Dungeons',
  matching: 'Matched dungeons',
  abyssartifact: 'Abyss Corridors',
}
export const runKindLabel = (kind: string): string => RUN_KIND_LABELS[kind] ?? kind

/** A run counts once its last boss fell or it gave something; else it was left (abandoned). */
export function runCounts(run: DungeonRun): boolean {
  return run.cleared !== undefined || run.ap > 0 || run.kina > 0 || Object.values(run.currencies).some((n) => n > 0) || Object.keys(run.loot ?? {}).length > 0
}
/** Left this soon with nothing (in and straight out): not kept at all. */
export const RUN_NOISE_MS = 60_000
export const runIsNoise = (run: DungeonRun): boolean => !runCounts(run) && run.end !== null && run.end - run.start < RUN_NOISE_MS
/** A session's runs that count: done, or that gave something. */
export const countedRuns = (s: PlaySession): DungeonRun[] => (s.runs ?? []).filter(runCounts)

export { NIGHTMARE_BOSSES }

/** A zone's mode beside its name (the catalogue's, shared/instances.ts): Conquest's and a raid's Normal or Hard, a Transcendence's stage; none for an Exploration (its name alone) or a trial (in its name). */
type Translate = (text: string, params?: Record<string, string | number>) => string
const untranslated: Translate = (text, params) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))
export function zoneMode(world: number, tr: Translate = untranslated): string | null {
  const at = instanceAt(world)
  if (!at || at.instance.kind === 'trial' || (at.instance.kind !== 'raid' && at.mode.id === 'easy')) return null
  return tr(at.mode.short, { n: at.mode.n ?? '' })
}

/** A run's name: a Nightmare's by its boss and level, else its zone's, with its mode (`tr` translating it). */
export function runName(run: DungeonRun, tr: Translate = untranslated): string {
  if (run.boss === undefined) {
    // A Shugo Festival's game: Shugo, whichever game (Up! Up! Up!...); an invasion's: the event, then which.
    if (run.kind === 'shugo') return tr('Shugo')
    if (run.kind === 'invasion') return `${tr(runKindLabel(run.kind))} · ${run.name}`
    // An arena by its mode, not its map: Co-op with a group (5v5), else Solo.
    if (run.kind === 'arena') return `${tr('Arena')} · ${tr((run.team ?? 0) > 1 ? 'Co-op' : 'Solo')}`
    const mode = zoneMode(run.world, tr)
    return mode ? `${run.name} · ${mode}` : run.name
  }
  const boss = NIGHTMARE_BOSSES[run.boss] ?? `${run.name} ${run.boss}`
  return run.level === undefined ? boss : `${boss} · ${run.level}`
}

/** Zone types that are not dungeons: the open world's layers, field events, legion airships, housing, the Abyss. */
const NOT_DUNGEONS = new Set(['instancelayer', 'guild', 'personalagit', 'abyss'])
/** Field events in their own instance (500000 up: the Shugo Festival's games, invasions...); below, the open world's. */
const FIELD_EVENT_WORLDS = 500_000

/**
 * The dungeon a zone is, or null: [its name, its type]. An arena is one (its type `arena`); the open world is none. A party
 * dungeon's type is its mode: Exploration (questlog's `easy`), Conquest (`normal`, `advanced`: its
 * Normal and Hard) or Transcendence (`hard`, stages 1-4: Deus Research Base, Shattered Arkanis...).
 */
export function dungeonOf(world: number | null): [string, string] | null {
  const z = world === null ? undefined : ZONES[world]
  if (!z || !z[2] || NOT_DUNGEONS.has(z[2])) return null
  // An arena's match: a run of its own (its Abyss Points, its time), whatever kind of arena.
  if (z[1]?.startsWith('arena')) return [z[0], 'arena']
  if (z[2] === 'fieldevent' && world! < FIELD_EVENT_WORLDS) return null
  if (z[2] !== 'party') return [z[0], z[2]]
  return [z[0], z[4] !== null ? 'transcendence' : z[3] === 'easy' ? 'exploration' : z[3] ? 'conquest' : 'party']
}

/**
 * A PvE instance: a dungeon (Expeditions, Transcendences, Nightmares...) but the Abyss Corridors,
 * where the other side can come, and the arenas. Its other players are your party (other servers'), not enemies.
 */
export function pveInstance(world: number | null): boolean {
  const dungeon = dungeonOf(world)
  return dungeon !== null && dungeon[1] !== 'abyssartifact' && dungeon[1] !== 'arena'
}

/** A session's resources gathered: [name, grade, how many], the best first. */
export const gatheredRows = (s: PlaySession): [string, number, number, string | null][] =>
  Object.entries(s.gathered ?? {})
    .map(([id, n]): [string, number, number, string | null] => [itemInfo(id)?.name ?? `#${id}`, itemInfo(id)?.grade ?? 11, n, itemIcon(itemInfo(id)?.icon)])
    .sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]))
/** Each grade's item -> its resource's plain one (questlog's gathering tables: Fine Odyle -> Odyle). */
const PLAIN_OF = new Map<number, number>()
for (const [, , groups] of Object.values(GATHERABLES)) {
  const plain = groups['1']?.[0]
  if (plain) for (const d of Object.values(groups)) if (!PLAIN_OF.has(d[0])) PLAIN_OF.set(d[0], plain)
}
/** A gathered item's resource: its plain item (itself when not a gathering's). */
export const resourceOf = (item: number | string): number => PLAIN_OF.get(Number(item)) ?? Number(item)

/** A session's gathering by resource, the most gathered first: each grade it gave, and its own counts. */
export interface GatheredResource {
  item: number
  name: string
  icon: string | null
  /** What came, by item, the plain grade first: name, grade, icon, how many. */
  grades: { item: number; name: string; grade: number; icon: string | null; n: number }[]
  /** Its gatherings, failures, doubles and rank ups (kept since 2026-11-23; null before). */
  counts: GatherCounts | null
}
export function gatheredByResource(s: PlaySession): GatheredResource[] {
  const by = new Map<number, GatheredResource>()
  const add = (plain: number): GatheredResource => {
    let r = by.get(plain)
    if (!r) {
      const row = itemRow(plain)
      r = { item: plain, name: row.name, icon: row.icon, grades: [], counts: s.gathering?.byResource?.[plain] ?? null }
      by.set(plain, r)
    }
    return r
  }
  for (const [id, n] of Object.entries(s.gathered ?? {})) {
    add(resourceOf(id)).grades.push({ item: Number(id), ...itemRow(id), n })
  }
  // Those only failed so far.
  for (const plain of Object.keys(s.gathering?.byResource ?? {})) add(Number(plain))
  const total = (r: GatheredResource): number => r.grades.reduce((a, g) => a + g.n, 0)
  for (const r of by.values()) r.grades.sort((a, b) => a.grade - b.grade)
  return [...by.values()].sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name))
}

/** How many resources a session gathered by grade (11 common, 21 green, 31 blue, 41 gold), the best first. */
export function gatheredByGrade(s: PlaySession): [number, number][] {
  const by = new Map<number, number>()
  for (const [, grade, n] of gatheredRows(s)) by.set(grade, (by.get(grade) ?? 0) + n)
  return [...by].sort((a, b) => b[0] - a[0])
}

/**
 * A session's gatherings: how many were done, failed, gave two (or more) at once, or ranked up (the
 * resource came a grade better than the node's: a white Odyle node gave a green Fine Odyle), and the
 * ones that worked by the grade of what they gave.
 */
export interface GatherStats extends GatherCounts {
  byGrade: Record<string, number>
  /** The same counts by resource (its plain item). */
  byResource?: Record<string, GatherCounts>
}
export interface GatherCounts {
  done: number
  failed: number
  doubles: number
  rankUps: number
}
/** The grades a gathering gives, as the stats list them: common, green, blue, gold. */
export const GATHER_GRADES = [11, 21, 31, 41]
/** `33 8D`'s results: 0 gathered, 1 ranked up, 2 failed. */
export const GATHER_RANK_UP = 1
export const GATHER_FAILED = 2
/** A gathering into a session: its stats, and what it gave (`bonus` more when it doubled). */
export function noteGathering(s: PlaySession, item: number, amount: number, result: number, bonus = 0): void {
  const g = (s.gathering ??= { done: 0, failed: 0, doubles: 0, rankUps: 0, byGrade: {} })
  // Its resource's own counts too (a failed one says its resource's plain item).
  const r = ((g.byResource ??= {})[resourceOf(item)] ??= { done: 0, failed: 0, doubles: 0, rankUps: 0 })
  g.done++
  r.done++
  if (result === GATHER_FAILED || amount <= 0) {
    g.failed++
    r.failed++
    return
  }
  if (result === GATHER_RANK_UP) {
    g.rankUps++
    r.rankUps++
  }
  if (bonus > 0) {
    g.doubles++
    r.doubles++
  }
  const grade = String(ITEMS[item]?.[1] ?? 11)
  g.byGrade[grade] = (g.byGrade[grade] ?? 0) + 1
  s.gathered = { ...s.gathered, [item]: (s.gathered?.[item] ?? 0) + amount + bonus }
}

/**
 * Each character's runs of a kind since a time (the weekly reset: the Shugo Festival's games of a week,
 * for its season mission), by character id (shared/characters.ts characterId): every session's runs
 * but the noise (in and straight out).
 */
export function runsSince(all: PlaySession[], kind: string, since: number): Map<string, number> {
  const by = new Map<string, number>()
  for (const s of all) {
    if (s.server === null || s.last < since) continue
    const id = characterId(s.server, s.name)
    for (const r of s.runs ?? []) if (r.kind === kind && r.start >= since && !runIsNoise(r)) by.set(id, (by.get(id) ?? 0) + 1)
  }
  return by
}

/** The counters whose drop marks a run's kind as you enter it (shared/characters.ts ids). */
export const RUN_COUNTERS: Record<string, string> = { '4': 'nightmare', '80000001': 'ascension', '101': 'daily', '1': 'shugo', '8': 'invasion' }

export interface PlaySession {
  name: string
  server: number | null
  /** The login (or, the app started mid-game, its first gain). */
  start: number
  /** The last thing earned. */
  last: number
  /** Abyss Points earned, in all and by source. */
  ap: number
  sources: Record<string, number>
  /** Kina earned: gains only, spending is not taken off; in all and by source (missing in sessions kept before it was). */
  kina: number
  kinaSources?: Record<string, number>
  /** Enhance Stones and Phantasmal Fragments earned, by item id; the dungeons run (both missing in sessions kept before them). */
  currencies?: Record<string, number>
  runs?: DungeonRun[]
  /** The resources gathered (`33 8D`: ores, plants, logs, Odyle...), by item id, and the gatherings' stats. */
  gathered?: Record<string, number>
  gathering?: GatherStats
  /** What gatherings gave besides their resource (a Poko's Skin Bundle with an Odyle, 2026-11-26), by item id. */
  gatherFinds?: Record<string, number>
  /** The duty missions handed in, in order. */
  duties?: DutyDone[]
  /** The supply requests handed in, with what each gave (the game's set rewards). */
  supplies?: SupplyDone[]
  /** The crafts done, each with whether it procced and what it made. */
  crafts?: CraftDone[]
  /** Each gathering done (since 2026-11-23): its resource, how it went and the skills it fired. */
  gatherings?: GatheringDone[]
}

/** A duty mission handed in: when, which (its quest id: QUESTS), and the rewards it gave by item id. */
/**
 * A gathering done: its resource (its plain item), what its start said (the outcome's flags: 1 made,
 * 2 and 4 a better grade rolled; the grade rolled; doubled), what came (the item and how many) and
 * the skills its rolls fired, with their levels (shared/gatherSkills.ts).
 */
export interface GatheringDone {
  at: number
  resource: number
  outcome: number
  grade: number
  doubled: boolean
  failed: boolean
  /** Given up before its result (walked away): a failure too. */
  abandoned?: boolean
  item: number
  amount: number
  /** Every skill fired, once each time it did. */
  skills: number[]
}

/** A craft done: its recipe (shared/recipes.ts), whether it procced, and what it made. */
export interface CraftDone {
  at: number
  recipe: number
  proc: boolean
  /** Failed: nothing made (item 0, count 0). */
  failed?: boolean
  item: number
  count: number
}

export interface SupplyDone {
  at: number
  request: number
  rewards: Record<string, number>
}
/** A supply request's name (questlog's), else its id. */
export const supplyName = (request: number): string => SUPPLIES[request]?.[0] ?? `#${request}`

export interface DutyDone {
  at: number
  quest: number
  rewards: Record<string, number>
  /** Its whole list of rewards, the likeliest first: each with its chance (0 to 1) and whether it came. */
  offered?: DutyOffer[]
}
export interface DutyOffer {
  item: number
  amount: number
  chance: number
  got: boolean
}
/** A duty mission's name (questlog's), else its id. */
export const questName = (quest: number): string => QUESTS[quest]?.[0] ?? `#${quest}`

/** A gain of the last few seconds, and where it went: a quest's reward may claim it. */
export interface RecentGain {
  at: number
  kind: 'ap' | 'kina'
  gained: number
  source: string
}

/**
 * A quest's reward of `amount` Abyss Points or Kina, at `at`: taken from the latest gain it came
 * with (of at least that much, within QUEST_WITHIN_MS before it) and given to the quests. False when
 * no such gain is there.
 */
export function questReward(s: PlaySession, recent: RecentGain[], kind: 'ap' | 'kina', amount: number, at: number, as: ApSource = 'reward'): boolean {
  const gain = [...recent].reverse().find((g) => g.kind === kind && g.gained >= amount && at - g.at >= 0 && at - g.at <= QUEST_WITHIN_MS)
  if (!gain) return false
  // Inside a dungeon its rewards stay the dungeon's, with what else it gave.
  if (gain.source.startsWith('dungeon:')) return true
  const by = kind === 'ap' ? s.sources : (s.kinaSources ??= {})
  const left = (by[gain.source] ?? 0) - amount
  if (left > 0) by[gain.source] = left
  else delete by[gain.source]
  by[as] = (by[as] ?? 0) + amount
  gain.gained -= amount
  return true
}

export interface Sessions {
  /** The character playing's, since their login; null before anything is known. */
  current: PlaySession | null
  /** The ones before, newest first. */
  history: PlaySession[]
}

export const NO_SESSIONS: Sessions = { current: null, history: [] }
