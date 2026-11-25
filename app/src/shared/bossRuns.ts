/**
 * Verteron's field bosses, each with the teleport (the Kibelisk) closest to it, as players call
 * them in chat: "Neikel, TP 6", "Dartan, TP 33" (the Field Bosses page; a boss chest's name).
 *
 * The closest Kibelisk is worked out from questlog.gg's map (2026-11-03): its Kibelisks
 * (`teleport-artifact` markers) and the boss's own marker, as the crow flies. Its number is the
 * game's list of Kibelisks (the map's Kibelisk tab), which questlog does not have: the player's
 * own mapping (2026-11-03), as chat uses them. Eternal Gartua, on Eternal Isle, has none near: chat
 * sends it to Aullaeu Village Sky Island (35).
 *
 * The small ones: Neikel, Kutar and Kernon, never seen more than 24 minutes from respawning in the
 * owner's logs (2026-10-21 to 11-03), back every 30 minutes; every other one was seen 37 or more.
 *
 * `npc` is the boss's monster code: fieldBossNpcs.json's (scripts/fetch-boss-icons.mjs), the one table of
 * them, which the engine reads too to name one dying in view.
 */
import table from './fieldBossNpcs.json' with { type: 'json' }
/** Every field boss's monster code, by its id in the map's list: Verteron's, Altgard's (111001 on), the Abyss's. */
const NPCS = (table as { npcs: Record<string, number> }).npcs
const npcOf = (boss: number): number | undefined => NPCS[String(boss)]
const BOSS_OF_NPC = new Map(Object.entries(NPCS).map(([boss, npc]) => [npc, Number(boss)]))

export interface BossRun {
  /** The boss's id in the map's list (shared/timers.ts FIELD_BOSSES). */
  boss: number
  /** As chat calls it. */
  short: string
  npc: number
  tp: number | null
  tpName: string | null
  /** A small one, back every 30 minutes. */
  small?: boolean
}

const RUNS: Omit<BossRun, 'npc'>[] = [
  { boss: 101001, short: 'Neikel', tp: 6, tpName: 'Cantas Valley Mushroom Tree Peak', small: true },
  { boss: 101002, short: 'Kutar', tp: 9, tpName: 'Marsh Outpost', small: true },
  { boss: 101003, short: 'Kernon', tp: 4, tpName: 'Coastal Camp', small: true },
  { boss: 101004, short: 'Kusan', tp: 19, tpName: 'Collapsed Pillar' },
  { boss: 101005, short: 'Garshim', tp: 20, tpName: 'Illusion Oratory Entrance' },
  { boss: 101006, short: 'Teegant', tp: 21, tpName: 'Verteron Fortress Valley' },
  { boss: 101007, short: 'Korin', tp: 13, tpName: "Illusion Cavaliers' Campsite" },
  { boss: 101008, short: 'Saursus', tp: 27, tpName: 'Astin Mercenaries Base' },
  { boss: 101009, short: 'Pnyn', tp: 26, tpName: 'Southern Shugo Station' },
  { boss: 101010, short: 'Layla', tp: 23, tpName: 'Zumion Temple Pilgrimage Path' },
  { boss: 101011, short: 'Lawa', tp: 44, tpName: 'Ancient Zumion Temple Site' },
  { boss: 101012, short: 'Kasia', tp: 59, tpName: 'Garden of the Illusion God West Observatory' },
  { boss: 101013, short: 'Demiros', tp: 43, tpName: 'Altamia Highland Ruins' },
  { boss: 101014, short: 'Ansas', tp: 43, tpName: 'Altamia Highland Ruins' },
  { boss: 101015, short: 'Moshav', tp: 54, tpName: 'Drana Transport Hub' },
  { boss: 101016, short: "K'nash", tp: 54, tpName: 'Drana Transport Hub' },
  { boss: 101017, short: 'Aulla', tp: 32, tpName: 'Abandoned Wind Breeze Office' },
  { boss: 101018, short: 'Aullamu', tp: 33, tpName: 'Aullaeu Village Valley' },
  { boss: 101019, short: 'Taulo', tp: 32, tpName: 'Abandoned Wind Breeze Office' },
  { boss: 101020, short: 'Setram', tp: 57, tpName: 'Nahid Disposal Plant' },
  { boss: 101021, short: 'Gartua', tp: 35, tpName: 'Aullaeu Village Sky Island' },
  { boss: 101022, short: 'Dartan', tp: 33, tpName: 'Aullaeu Village Valley' },
  { boss: 101023, short: 'Kashapa', tp: 44, tpName: 'Ancient Zumion Temple Site' },
  { boss: 101024, short: 'Lagta', tp: 53, tpName: "Laborer's Rest Stop" },
]
export const BOSS_RUNS: BossRun[] = RUNS.map((r) => ({ ...r, npc: npcOf(r.boss)! }))


/** A field boss's id in the map's list, from its monster code (a kill in view), or null. */
export const bossOfNpc = (npc: number): number | null => BOSS_OF_NPC.get(npc) ?? null
