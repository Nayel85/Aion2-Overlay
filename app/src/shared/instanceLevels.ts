/**
 * The item level each instance asks to enter, by its name and mode: the expeditions' `easy`
 * (Exploration), `normal` (Conquest) and `advanced` (Conquest Hard), the Transcendences' stages
 * (`s1`..`s4`), the raids' `normal` and `advanced`; the Ascension Trials' by difficulty, the same in
 * every trial. A mode no source gives is left out.
 *
 * Sources (2026-11-25): metabot.gg's Transcendence, aion2.wiki.fextralife.com (Expeditions, Raids, Ascension Trial), daevaguides.com,
 * aion2builds.com and expcarry.com's dungeon lists, which agree where they overlap. The later
 * expeditions' and raids' come from the client's data (not out on the global client yet). Conquest Hard
 * of Urugugu Canyon and Vakron Sky Island: expcarry's alone. The trials' Insane and Hell: aion2builds'
 * six tiers; Doom (Forgotten Repository's and Chamber of the Dead's alone): NCSOFT's 4000, as gamers.wiki and
 * metabot.gg give it.
 */
export const REQUIRED_ILVL: Record<string, Record<string, number>> = {
  'Krao Cave': { easy: 200, normal: 700, advanced: 2600 },
  Draupnir: { easy: 700, normal: 700, advanced: 2600 },
  'Urugugu Canyon': { easy: 300, normal: 1400, advanced: 2700 },
  'Vakron Sky Island': { easy: 1400, normal: 1400, advanced: 2700 },
  'Fire Temple': { easy: 500, normal: 2100 },
  'Ferocious Horn Den': { easy: 2100, normal: 2100 },
  "Dying Dramata's Nest": { normal: 2800, advanced: 3000 },
  'Cradle of Nihility': { normal: 2800, advanced: 3000 },
  'Hall of Illusion': { normal: 3000, advanced: 3500 },
  'Azure Breath Island': { normal: 3000, advanced: 3500 },
  'Citadel of the Fallen Daeva': { normal: 3800, advanced: 4500 },
  'Deus Research Base': { s1: 1600, s2: 1900, s3: 2200, s4: 2500 },
  'Shattered Arkanis': { s1: 1600, s2: 1900, s3: 2200, s4: 2500 },
  // Not out on the global client yet (metabot.gg and metaroad.gg, the Korean client's; Submerged Life
  // Temple's stage 4: metabot's 3500, metaroad says 3200).
  'Submerged Life Temple': { s1: 2400, s2: 2800, s3: 3200, s4: 3500 },
  'Mirror of Scarlet Desire': { s1: 3200, s2: 3500, s3: 3800, s4: 4000 },
  'Abyssal Horn Den': { s1: 3800, s2: 4100, s3: 4500, s4: 4800 },
  'Abyssal Forge: Ludra': { normal: 2800, advanced: 3000 },
  // The global client's (2026-11-26, the owner's word; the Korean's 3500).
  'Corroded Decontamination Facility': { normal: 2100 },
  'Chalice of Muspel': { normal: 4300, advanced: 4500 },
}

/** The Ascension Trials', by difficulty (as the zones name it: "Tyrant's Hideout (Hard)"). */
export const TRIAL_ILVL: Record<string, number> = { Easy: 1000, Normal: 1500, Hard: 2000, Challenge: 2500, Insane: 3000, Hell: 3500, Doom: 4000 }

/**
 * The Nightmares' suggested item level (not asked: the game warns, then lets you in), by the boss's grade,
 * at each level 1 to 10 (fextralife's Nightmare Dungeons).
 */
export const NIGHTMARE_ILVL: Record<'common' | 'rare' | 'legend', number[]> = {
  common: [1000, 1050, 1100, 1150, 1200, 1250, 1300, 1400, 1500, 1600],
  rare: [1700, 1750, 1800, 1850, 1900, 1950, 2000, 2100, 2200, 2300],
  legend: [2400, 2450, 2500, 2550, 2600, 2650, 2700, 2800, 2900, 3000],
}
