/**
 * The zones by kind, from questlog.gg's world table (scripts/fetch-spawns.mjs `WORLDS`, their map
 * client's config of 2026-10-10): the Abyss, each side's continents (their starting ones too), and
 * the dungeons (both sides' and the shared ones). The ids are the engine's world ids.
 */
export const ABYSS_WORLDS: readonly number[] = [20, 22, 23]
export const CONTINENT_WORLDS: readonly number[] = [1000, 1010, 1011, 1100, 1110, 1111]
export const DUNGEON_WORLDS: readonly number[] = [
  200004, 200005, 200006,
  210001, 210004, 210006, 210007, 210008, 210009, 210010, 210011, 210012, 210014, 210017, 210018, 210019,
  220001, 220002, 220006, 220007, 220008, 220009, 220010, 220011, 220014, 220019, 220020, 220021, 220022,
]
