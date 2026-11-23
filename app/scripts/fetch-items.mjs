/**
 * Snapshot the items the Session page names in what you earn (a cube, a Shugo Festival, an
 * invasion, gathering), with the game's icons:
 *
 *   node scripts/fetch-items.mjs
 *
 * Writes src/shared/items.ts: item id -> [name, grade, icon, kind], for every currency
 * (Kina, Centuryroot Tokens...), every material (`misc`: gathered resources, Odyle, refining and
 * crafting materials, Silentium...), every usable item (seeds, skins, boxes, scrolls...), and all
 * the equipment (weapons, armor, accessories, belts, amulets, runes), every grade: the Inventory
 * page names all you have; the loot keeps only the Unique-or-better equipment (sessions.ts).
 * Grades: 11 common, 21 green, 31 blue, 41 gold (Unique), 51 and up. Kind: `currency`, else its
 * sub-category (`gatherresource`, `skinshop`, `guarder`...), else its main one. Each icon once, in
 * src/renderer/public/items/loot/<icon>.webp: not the usable items' nor the lesser equipment's (too
 * many: those are fetched by the app when first shown, main/icons.ts).
 *
 * Source: questlog.gg's item database (global client, `en`): database.getItems, every page. It
 * serves at most 25 pages (1,000 items) a list, so a longer one is read a sub-category at a time,
 * and a longer sub-category (the skins) by what its names say in brackets (`Skin: Gloves`...).
 * Their data, used with credit; a one-time snapshot, sequential requests with a pause between them
 * (several minutes).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(APP, 'src', 'shared', 'items.ts')
const ICONS = join(APP, 'src', 'renderer', 'public', 'items', 'loot')
const API = 'https://questlog.gg/aion-2/api/trpc'
const CDN = 'https://cdn.questlog.gg/aion-2'
const HEADERS = { 'user-agent': 'aion2-drop-tracker (personal pet collection tracker)', accept: 'application/json' }
const PAUSE_MS = 250
/** The most pages questlog serves a list. */
const MAX_PAGES = 25
/**
 * Each main category, the least grade whose icons are fetched (null: none), and its sub-categories
 * (more are found on the way). Every grade is listed (the Inventory page names all you have); the
 * lesser equipment without its icon, to keep the app light.
 */
const CATEGORIES = [
  ['currency', 0, []],
  ['misc', 0, []],
  ['usable', null, ['gather', 'skinshop', 'rewardbox', 'kinabox', 'food', 'potion', 'drink', 'scroll', 'magicstone', 'polymorph', 'gettitle']],
  ['weapon', 41, ['greatsword', 'sword', 'magicbook', 'staff', 'guarder', 'dagger', 'bow', 'orb', 'mace']],
  ['armor', 41, ['torso', 'pants', 'helmet', 'shoulder', 'gloves', 'boots', 'cape']],
  ['accessory', 41, ['necklace', 'earring', 'ring', 'bracelet']],
  ['equip', 41, ['belt', 'amulet', 'rune']],
  ['arcana', null, []],
]

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

/**
 * An icon not bundled, as the app asks for it (main/icons.ts fetches it from questlog's CDN once and
 * keeps it): its path under Texture/, without the extension ("Item/Armor/Icon_GM_0062_T06_Boots").
 * Told from a bundled one's bare name by its slashes.
 */
const TEXTURES = '/assets/Game/UI/Resource/Texture/'
function remoteIcon(path) {
  if (!path?.startsWith(TEXTURES)) return null
  const rel = path.slice(TEXTURES.length).replace(/\.[^/]+$/, '')
  return /^[\w/-]+$/.test(rel) ? rel : null
}

async function page(filter, n) {
  const input = { language: 'en', page: n, ...filter }
  const res = await fetch(`${API}/database.getItems?input=${encodeURIComponent(JSON.stringify(input))}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`getItems ${JSON.stringify(filter)} page ${n}: HTTP ${res.status}`)
  await sleep(PAUSE_MS)
  return (await res.json()).result.data
}

/** Every item of a list, and whether questlog served it whole. */
async function list(filter) {
  const first = await page(filter, 1)
  const items = [...first.pageData]
  for (let n = 2; n <= Math.min(first.pageCount, MAX_PAGES); n++) items.push(...(await page(filter, n)).pageData)
  return { items, whole: first.pageCount <= MAX_PAGES }
}

/** Every item of a main category: whole, else a sub-category at a time, else by their names' brackets. */
async function category(mainCategory, subs) {
  const top = await list({ mainCategory })
  if (top.whole) return top.items
  const found = new Map(top.items.map((i) => [i.id, i]))
  for (const subCategory of new Set([...subs, ...top.items.map((i) => i.subCategory).filter(Boolean)])) {
    const sub = await list({ mainCategory, subCategory })
    for (const i of sub.items) found.set(i.id, i)
    if (sub.whole) continue
    const terms = new Set(sub.items.map((i) => /\(([^)]+)\)/.exec(i.name)?.[1]).filter(Boolean))
    for (const searchTerm of terms) {
      const part = await list({ mainCategory, subCategory, searchTerm })
      for (const i of part.items) if (i.subCategory === subCategory) found.set(i.id, i)
      if (!part.whole) console.warn(`${mainCategory}/${subCategory} "${searchTerm}": more than ${MAX_PAGES} pages, some not listed`)
    }
  }
  return [...found.values()]
}

mkdirSync(ICONS, { recursive: true })
const items = {}
for (const [main, iconFrom, subs] of CATEGORIES) {
  for (const i of await category(main, subs)) {
    if (i.mainCategory !== main || i.isDisabled) continue
    const withIcon = iconFrom !== null && (i.grade ?? 0) >= iconFrom
    items[i.id] = [i.name, i.grade ?? 11, withIcon ? await icon(i.icon) : remoteIcon(i.icon), main === 'currency' || main === 'arcana' ? main : (i.subCategory ?? main)]
  }
  console.log(`${main}: ${Object.keys(items).length} items so far`)
}
const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => Number(a) - Number(b)))
const header = "// The items the Session page names by id: [name, grade, icon, kind]. Generated by scripts/fetch-items.mjs (questlog.gg); do not edit.\n"
writeFileSync(DATA, `${header}export const ITEMS: Record<string, [string, number, string | null, string]> = ${JSON.stringify(sorted)}\n`)
console.log(`${Object.keys(sorted).length} items -> ${DATA}`)
