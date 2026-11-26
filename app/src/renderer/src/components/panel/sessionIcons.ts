/** The Session page's history icons: 16x16 stroked line paths (Lucide's shapes). */
import { ENHANCE_STONE, PHANTASMAL_FRAGMENT } from '@shared/sessions.ts'

export const ICON = {
  chevron: 'M6 4l4 4-4 4',
  day: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  week: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3M5 9.5h6M5 11.5h4',
  coin: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 4.5v7M6 6.2c.3-.7 1-1 2-1s1.9.5 1.9 1.3c0 1.8-3.8 1-3.8 2.9 0 .8.8 1.3 1.9 1.3s1.7-.3 2-1',
  // A dungeon's gate: an arch, its doorway.
  dungeon: 'M3.5 14V7a4.5 4.5 0 0 1 9 0v7M2 14h12M6 14v-4a2 2 0 0 1 4 0v4',
  clock: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5',
  stone: 'M4.5 2.5h7l2.5 3.5L8 13.5 2 6zM2 6h12M6 2.5 8 6l2-3.5M8 6v7.5',
  fragment: 'M8 1.5 11 6.5 8 14.5 5 6.5zM5 6.5h6',
  skull: 'M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5',
  leaf: 'M3 13c0-6 4-10 10-10 0 6-4 10-10 10zM3 13l5-5',
  sword: 'M13.5 2.5 6 10M13.5 2.5h-3M13.5 2.5v3M4 8.5l3.5 3.5M5.5 10.5 2.5 13.5',
  wing: 'M2 13c5-1 9-4.5 11.5-10.5-.5 3-1.5 5-3 6.5 1.5 0 2.5-.5 3.5-1.5-2 3-5.5 5-12 5.5zM6 10.5l3-3',
  scroll: 'M4.5 2.5h7v9a2 2 0 0 1-2 2h-6a1.5 1.5 0 0 1-1.5-1.5v-1h6v1a1.5 1.5 0 0 0 3 0M4.5 2.5a1.5 1.5 0 0 0-1.5 1.5v1h1.5M6.5 5.5h3M6.5 8h3',
  /** An item with no icon of its own: a box. */
  box: 'M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5 13.5 5M8 7.5v6',
  card: 'M4.5 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 5.5l1.5 2.5L8 10.5 6.5 8z',
}

const SKULL = 'M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5'
/** Each dungeon type's icon. */
const KIND_ICON: Record<string, string> = {
  bosschallenge: SKULL,
  fieldboss: SKULL,
  nightmare: SKULL,
  daily: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
  ascension: 'M8 13.5V3M4 7l4-4 4 4M3 13.5h10',
  abyssartifact: 'M2.5 13.5 6 10M4 8l4 4M5.5 6.5l6-4 2 2-4 6M11 5l-1.5 1.5',
  party: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 7a2 2 0 1 0 0-4M12.5 9.7c1.2.6 2 1.9 2 3.3',
  raid: 'M3 13 13 3M9.5 3H13v3.5M3 3l4 4M13 13l-3-3',
  // An arena: two swords crossed in a ring.
  arena: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5 11l6-6M5 5l6 6',
  awaken: 'M9 1.5 3.5 9h4l-1 5.5L12.5 7h-4z',
  exploration: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM10.5 5.5 9 9l-3.5 1.5L7 7z',
  transcendence: 'M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z',
}
KIND_ICON['conquest'] = KIND_ICON['party']!
/** The deaths' tooltip: yours, then the group's (yours among them). */
export const DEATHS_TITLE = "Your deaths, and the group's"
export const kindIcon = (kind: string): string => KIND_ICON[kind] ?? ICON.dungeon
export const CURRENCY_ICON: Record<string, string> = { [ENHANCE_STONE]: ICON.stone, [PHANTASMAL_FRAGMENT]: ICON.fragment }

/** Each loot kind's icon and colour: gold equipment, gold crafting materials, wings and artworks, Arcana cards. */
export const LOOT_KIND_STYLE: Record<string, { icon: string; class: string }> = {
  equipment: { icon: ICON.sword, class: 'text-yellow' },
  craft: { icon: ICON.stone, class: 'text-yellow' },
  wings: { icon: ICON.wing, class: 'text-yellow' },
  cards: { icon: ICON.card, class: 'text-accent' },
}
