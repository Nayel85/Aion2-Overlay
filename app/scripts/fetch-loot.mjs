/**
 * Snapshot the dungeon rewards the Session page counts from a cube's loot (`15 57`):
 *
 *   node scripts/fetch-loot.mjs
 *
 * Writes src/shared/loot.ts: item id -> [name, grade, kind], for every item a dungeon's reward
 * lists (cube, weekly ceiling) but the common, green and blue equipment (grade under 41). Kind:
 * `currency` (Kina, Enhance Stones...), `arcana` (an Arcana card), `equipment` (weapon, armor,
 * accessory: Unique and up), `item` (materials, Silentium, Soul Codex, Artworks...). And each one's
 * icon, the game's, in src/renderer/public/items/loot/<icon>.webp (the tuple's fourth: its name).
 *
 * And src/shared/drops.ts: each dungeon's (zone id) cube rewards those items are among, by item id:
 * [its chance a cube, the fewest, the most it gives] (questlog's `chance`, `countMin`, `countMax`).
 * A full run's cube rolls each of its bosses' table (dungeonBosses.ts below): questlog's chance is of one at least over those rolls (Vakron's Amplify Stone Fragment:
 * 20% on each of its 3 bosses in game, 48.8% = 1 - 0.8^3 on questlog).
 *
 * And, from the same answers (one request a dungeon, for everything questlog knows of it):
 * - src/shared/dungeonBosses.ts: each party dungeon's, raid's and Ascension Trial's bosses (its
 *   `dungeonHasBossNpcs`: those its end cube counts, the final one last), by zone id;
 * - src/shared/expeditionCeilings.ts: each party dungeon's guaranteed chest, the cubes opened before it
 *   (its `ceilingCount`). Checked against the game (2026-11-24): Draupnir Conquest 3 of 14, Fire Temple
 *   Conquest 4 of 28.
 *
 * Source: questlog.gg's dungeon database (global client, `en`): database.getDungeon of each dungeon
 * in src/shared/zones.ts (run scripts/fetch-zones.mjs first). Their data, used with credit; a
 * one-time snapshot, sequential requests with a pause between them (a couple of minutes).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(APP, 'src', 'shared', 'loot.ts')
const DROPS = join(APP, 'src', 'shared', 'drops.ts')
const BOSSES = join(APP, 'src', 'shared', 'dungeonBosses.ts')
const CEILINGS = join(APP, 'src', 'shared', 'expeditionCeilings.ts')
/** The dungeon types whose bosses the bests' grids list (shared/instances.ts). */
const WITH_BOSSES = new Set(['party', 'raid', 'awaken'])
const ICONS = join(APP, 'src', 'renderer', 'public', 'items', 'loot')
const API = 'https://questlog.gg/aion-2/api/trpc'
const CDN = 'https://cdn.questlog.gg/aion-2'
const LANGUAGE = 'en'
const HEADERS = { 'user-agent': 'aion2-drop-tracker (personal pet collection tracker)', accept: 'application/json' }
const PAUSE_MS = 250
const EQUIPMENT = new Set(['weapon', 'armor', 'accessory'])
/** Dungeon types whose zones have no rewards worth asking for: the open world, arenas, housing... */
const SKIP = new Set([null, 'instancelayer', 'fieldevent', 'guild', 'personalagit', 'abyss', 'matching', 'quest'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Each icon once, as questlog's CDN serves it (webp): src/renderer/public/items/loot/<name>.webp. */
async function icon(path) {
  const name = path?.split('/').pop()?.split('.')[0]
  if (!name) return null
  const file = join(ICONS, `${name}.webp`)
  if (!existsSync(file)) {
    const res = await fetch(`${CDN}${path.replace(/\.[^/]+$/, '')}.webp`)
    if (!res.ok) return null
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    await sleep(PAUSE_MS)
  }
  return name
}

async function trpc(proc, input) {
  const url = `${API}/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${proc} ${JSON.stringify(input)}: HTTP ${res.status}`)
  return (await res.json()).result.data
}

const src = readFileSync(join(APP, 'src', 'shared', 'zones.ts'), 'utf8')
const zones = JSON.parse(src.slice(src.indexOf('= ') + 2))
mkdirSync(ICONS, { recursive: true })
const items = {}
const drops = {}
const bosses = {}
const ceilings = {}
for (const [id, zone] of Object.entries(zones)) {
  if (SKIP.has(zone[2])) continue
  const dungeon = await trpc('database.getDungeon', { language: LANGUAGE, id })
  const names = (dungeon.dungeonHasBossNpcs ?? []).map((n) => n.name).filter(Boolean)
  if (WITH_BOSSES.has(zone[2]) && names.length) bosses[id] = names
  if (zone[2] === 'party' && dungeon.ceilingCount) ceilings[id] = dungeon.ceilingCount
  for (const i of dungeon.dungeonRewardsItems ?? []) {
    const kind = i.mainCategory === 'currency' ? 'currency' : i.subCategory === 'getarcana' ? 'arcana' : EQUIPMENT.has(i.mainCategory) ? 'equipment' : 'item'
    if (kind === 'equipment' && i.grade < 41) continue
    if (!items[i.id]) items[i.id] = [i.name, i.grade, kind, await icon(i.icon)]
    if (i.rewardType === 'cube' && typeof i.chance === 'number') (drops[id] ??= {})[i.id] = [Math.round(i.chance * 1e4) / 1e4, i.countMin ?? 1, i.countMax ?? 1]
  }
  await sleep(PAUSE_MS)
}
// The currencies the Session page counts that no dungeon's list names: the Nightmares' Phantasmal
// Fragments, the Abyss Points.
for (const id of ['930100017', '930100003']) {
  const i = await trpc('database.getItem', { language: LANGUAGE, id })
  items[id] ??= [i.name, i.grade, 'currency', await icon(i.icon)]
}
const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => Number(a) - Number(b)))
const header = "// The dungeon rewards worth keeping by item id: [name, grade, kind, icon]. Generated by scripts/fetch-loot.mjs (questlog.gg); do not edit.\n"
writeFileSync(DATA, `${header}export const LOOT: Record<string, [string, number, 'currency' | 'arcana' | 'equipment' | 'item', string | null]> = ${JSON.stringify(sorted)}\n`)
console.log(`${Object.keys(sorted).length} items -> ${DATA}`)
const dropsHeader = "// Each dungeon's (zone id) cube rewards by item id: [chance a cube, fewest, most]. Generated by scripts/fetch-loot.mjs (questlog.gg); do not edit.\n"
writeFileSync(DROPS, `${dropsHeader}export const DROPS: Record<string, Record<string, [number, number, number]>> = ${JSON.stringify(drops)}\n`)
console.log(`${Object.keys(drops).length} dungeons' drops -> ${DROPS}`)
const bossesHeader = "// Each dungeon's bosses (its end cube's, the final one last), by world id. Generated by scripts/fetch-loot.mjs (questlog.gg); do not edit.\n"
writeFileSync(BOSSES, `${bossesHeader}export const DUNGEON_BOSSES: Record<string, string[]> = ${JSON.stringify(bosses)}\n`)
console.log(`${Object.keys(bosses).length} dungeons' bosses -> ${BOSSES}`)
const ceilingsHeader = "// Each expedition's guaranteed chest: cubes opened before it, by world id. Generated by scripts/fetch-loot.mjs (questlog.gg); do not edit.\n"
writeFileSync(CEILINGS, `${ceilingsHeader}export const EXPEDITION_CEILINGS: Record<string, number> = ${JSON.stringify(ceilings)}\n`)
console.log(`${Object.keys(ceilings).length} expeditions' chests -> ${CEILINGS}`)
