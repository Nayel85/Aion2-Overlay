/**
 * Which dungeon a boss is in, for grouping the fight history (and anything else that wants a zone).
 * The names are the game's own (English); a boss that is in more than one dungeon lists them all
 * and `dungeonsOf` returns every one.
 */
export type DungeonKind = 'expedition' | 'transcendence' | 'sanctuary' | 'additional' | 'awakening'

export const DUNGEON_KINDS: { id: DungeonKind; label: string }[] = [
  { id: 'expedition', label: 'Expedition' },
  { id: 'transcendence', label: 'Transcendence' },
  { id: 'sanctuary', label: 'Sanctuary' },
  { id: 'additional', label: 'Additional (KR/TW)' },
  { id: 'awakening', label: 'Awakening' },
]

export const DUNGEONS: Record<DungeonKind, Record<string, string[]>> = {
  expedition: {
    'Krao Cave': ['Enhanced Harcon', 'Neglected Gadioton', 'Ultimate Berk'],
    'Urugugu Canyon': ['Guardian Captain Raur', 'Judge Urahum', 'Divine Auldor'],
    'Fire Temple': ['Silver Blade Rotan', 'Red Spark Ignus', 'Black Smoke Murute', "Kromede's Desire"],
    Draupnir: ['Phantasmal Lakshmi', 'Predator Saraswati', 'Afflicted Bakarma', 'Transcendent Bakarma'],
    'Vakron Sky Island': ['Tiere', 'Thamon', 'Vakron'],
    'Ferocious Horn Den': ['Watchdog Kwapo', 'Shining Mau Totem', 'Necromancer Duanka', 'Ferocious Horn Nuakum'],
    "Dying Dramata's Nest": ['Broodkeeper Nayatman', 'Manager Nasium', 'Decaying Durvati', 'Decaying Durvati (Specimen)'],
    'Cradle of Nihility': ['Multiverse Veltiras', 'Afflicted Bakarma', 'Solemn Valkan'],
    'Hall of Illusion': ['Nazarak', 'Glassvein', 'Nathara'],
    'Azure Breath Island': ['Wise Baumnute', 'Expanding Xyrepe', 'Awakened Alturadon'],
    'Citadel of the Fallen Daeva': ['Willful Turgen', 'Forbidden Hexbeast Griosa', 'Basilus the False'],
  },
  transcendence: {
    'Deus Research Base': ['Gelcos', 'Nazmun', 'Atiel'],
    'Shattered Arkanis': ['Siliator of Deceit', 'Ruthilis of Pain', 'Talisra of the Void'],
    'Submerged Life Temple': ['Submerged Emon', 'Deep Sea Pydeon', 'Singing Ellyde'],
    'Mirror of Scarlet Desire': ['Ordeal of Love', 'Rotar', 'Robstino', "Kromede's Desolation"],
    'Abyssal Horn Den': ['Kapu', 'Dhakan', 'Gargaum'],
  },
  sanctuary: {
    'Abyssal Forge: Ludra': ['Central Abyss Fusion Reactor', 'Isolation Specialist Rahu', 'Abyssal Wings Ketu', 'Eternal Ludra'],
    'Corroded Decontamination Facility': ['Devouring Klawfly', 'Black Blood Blatt', 'Terminator Bargott', 'Surveillance Device', 'Hydraulic Press'],
    'Chalice of Muspel': ['Muspel Guardian Statue', 'Iscariel', 'Kaldrix'],
  },
  additional: {
    'Consumed Deus Research Base': ['Atiel of Arrogance', 'Gromkas'],
    "Noiran's Hidden Legacy": ['Incomplete Braunt', 'Mad Klominster', 'Askran'],
    'Snowfield of Sorrow': ['Triton', 'Deltras'],
  },
  awakening: {
    'Nightmare Altar': ['Divided Aponos'],
    'Sanctum of Loathing': ['Featherstorm Duduri', 'Watchful Raptor Dodori'],
    "Tyrant's Hideout": ['Menoch'],
    'Depository of Fates': ['Claudia'],
    'Forgotten Repository': ['Karlix'],
    'Chamber of the Dead': ['Eloen'],
  },
}

export interface Dungeon {
  name: string
  kind: DungeonKind
}

const norm = (s: string): string => s.trim().toLowerCase()
const BY_BOSS = new Map<string, Dungeon[]>()
for (const kind of Object.keys(DUNGEONS) as DungeonKind[]) {
  for (const [name, bosses] of Object.entries(DUNGEONS[kind])) {
    for (const boss of bosses) {
      const list = BY_BOSS.get(norm(boss)) ?? []
      list.push({ name, kind })
      BY_BOSS.set(norm(boss), list)
    }
  }
}

/** Every dungeon a boss is in (more than one for the bosses that are in two), none when unknown. */
export const dungeonsOf = (boss: string | null | undefined): Dungeon[] => BY_BOSS.get(norm(boss ?? '')) ?? []

/**
 * Picks each fight's dungeon. A boss in two dungeons takes the one its neighbours in time point to
 * (the closest fight, within two hours, that has a single answer), else the first listed.
 */
export function dungeonFor(fights: { id: string; bossName: string | null; startTimeMs: number }[]): Map<string, Dungeon | null> {
  const out = new Map<string, Dungeon | null>()
  const sure = fights.filter((f) => dungeonsOf(f.bossName).length === 1)
  for (const f of fights) {
    const options = dungeonsOf(f.bossName)
    if (options.length <= 1) {
      out.set(f.id, options[0] ?? null)
      continue
    }
    let best: { gap: number; d: Dungeon } | null = null
    for (const s of sure) {
      const d = dungeonsOf(s.bossName)[0]!
      const gap = Math.abs(s.startTimeMs - f.startTimeMs)
      if (gap <= 2 * 3_600_000 && options.some((o) => o.name === d.name) && (!best || gap < best.gap)) best = { gap, d }
    }
    out.set(f.id, best?.d ?? options[0] ?? null)
  }
  return out
}
