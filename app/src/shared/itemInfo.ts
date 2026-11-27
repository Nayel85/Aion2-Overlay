/**
 * The items as the app names and shows them: a dungeon reward's (LOOT), else the catalogue's (ITEMS),
 * else one a craft or a gathering makes; their name as shown, grade, icon and kind; the gold loot's
 * kinds. Read through here only (CLAUDE.md), re-exported by shared/sessions.ts.
 */
import { GATHERABLES } from './gatherables.ts'
import { ITEMS } from './items.ts'
import { itemIcon, plainName, type ItemTuple } from './itemRef.ts'
import { LOOT } from './loot.ts'
import { RECIPES } from './recipes.ts'

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
export { plainName }
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

/**
 * An item's icon (the game's, from questlog: scripts/fetch-loot.mjs, fetch-items.mjs), as the app
 * serves it: a bundled one by its name, one with a path ("Item/Armor/...") through the main
 * process, which fetches it once and keeps it (main/icons.ts).
 */
export { itemIcon }
/** A currency's (or any item's) game icon: Kina, Abyss Points, Oath Coins, Enhance Stones... */
export const currencyIcon = (id: number | string): string | null => itemIcon(itemInfo(id)?.icon)
