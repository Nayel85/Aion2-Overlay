/**
 * An item as the generated tables give it (a recipe's product, a gathering's drop):
 * [item id, count, name, grade, icon], and the same as an object for the windows.
 */
export type ItemTuple = [item: number, count: number, name: string, grade: number, icon: string | null]

export interface ForecastItem {
  id: number
  count: number
  name: string
  grade: number
  /** A path under questlog's Texture/ (main/icons.ts) or a bundled icon's name; null for none. */
  icon: string | null
}

export const asItem = (d: ItemTuple): ForecastItem => ({ id: d[0], count: d[1], name: d[2], grade: d[3], icon: d[4] })

/** An item's icon as the windows load it: questlog's (a path) through main, or one bundled with the app. */
export const itemIcon = (icon: string | null | undefined): string | null => (icon ? (icon.includes('/') ? `itemicon://icon/${icon}.webp` : `items/loot/${icon}.webp`) : null)

/** An item's name as shown: without "(Bound)" (whether it is is told apart where it matters). */
export const plainName = (name: string): string => name.replace(' (Bound)', '')
