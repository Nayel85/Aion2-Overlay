/**
 * An equipment's details as the game's item window shows them: the stats its record holds (stones,
 * soul binding: by the game's stat codes) named and valued, and its base stats (questlog's, fetched
 * once by the main process: main/itemDetails.ts) with its enchantment's bonus.
 *
 * The codes were matched on the owner's items against the game's windows (2026-11-23): the stones
 * of nine of Nayoul's items (Bakarma Boots: Critical Hit 0x80 +5, Accuracy Bonus 0x68 +7, Defense
 * 0x133 +10, Attack 0x13D +3...) and his Aulamus Bow's soul binding (HP 0xC1 308, Combat Speed 0x11A
 * 9.7%, Critical Hit 0x80 51), Vakron Greaves' (Front Defense 0x24C, Evasion 0x138, Critical Damage
 * Defense 0x29), Bakarma Boots' (Natural HP Regen 0xC2, Dexterity 0x2, Back Defense 0x63) and Gartua
 * Breastplate's (Weapon Damage Tolerance 0x4A 7.32%); the others by their values against each item's
 * possible stats (questlog's subStats ranges), over the three characters' worn items: the base
 * stats 1 to 6 in the game's order (Strength, Dexterity, Intelligence, Constitution, Agility,
 * Willpower; 3 not seen yet).
 */
import { SKILLS } from './skills.ts'
import { STONES } from './stones.ts'

/** The game's stat codes, by questlog's stat ids. */
export const STAT_CODES: Record<number, string> = {
  0x1: 'str',
  0x2: 'dex',
  0x4: 'con',
  0x5: 'agi',
  0x6: 'wis',
  0x29: 'criticaldamagedefense',
  0x63: 'backattackdefense',
  0xc2: 'hpregen',
  0x138: 'armorevasion',
  0x13e: 'weaponaccuracy',
  0x24c: 'frontattackdefense',
  0x4a: 'decreaseweapondamage',
  0x68: 'accuracy',
  0x74: 'evasion',
  0x80: 'critical',
  0x85: 'criticalresist',
  0x9f: 'abnormalresistance',
  0xc1: 'hpmax',
  0xc7: 'mpmax',
  0xc8: 'mpregen',
  0xff: 'block',
  0x11a: 'combatspeed',
  0x12a: 'fpmax',
  0x133: 'armordefense',
  0x13d: 'weaponfixingdamage',
}

/** Questlog's stat ids as the game names them; `pct`: kept in hundredths of a percent (972: 9.7%). */
const STATS: Record<string, { label: string; pct?: boolean }> = {
  weaponfixingdamage: { label: 'Attack' },
  armordefense: { label: 'Defense' },
  accuracy: { label: 'Accuracy Bonus' },
  evasion: { label: 'Evasion Bonus' },
  critical: { label: 'Critical Hit' },
  criticalresist: { label: 'Critical Hit Resist' },
  block: { label: 'Block' },
  hpmax: { label: 'HP' },
  mpmax: { label: 'MP' },
  mpregen: { label: 'MP Recovery' },
  fpmax: { label: 'Flight Time' },
  str: { label: 'Strength' },
  dex: { label: 'Dexterity' },
  con: { label: 'Constitution' },
  agi: { label: 'Agility' },
  wis: { label: 'Willpower' },
  abnormalresistance: { label: 'Status Effect Resistance' },
  decreaseweapondamage: { label: 'Weapon Damage Tolerance', pct: true },
  frontattackdefense: { label: 'Front Defense' },
  backattackdefense: { label: 'Back Defense' },
  criticaldamagedefense: { label: 'Critical Damage Defense' },
  armorevasion: { label: 'Evasion' },
  hpregen: { label: 'Natural HP Regen' },
  combatspeed: { label: 'Combat Speed', pct: true },
  weaponaccuracy: { label: 'Accuracy' },
  amplifyalldamage: { label: 'Damage Amplification', pct: true },
  amplifyweapondamage: { label: 'Weapon Damage Amplification', pct: true },
  amplifycriticaldamage: { label: 'Critical Damage Amplification', pct: true },
  amplifybackattack: { label: 'Back Attack Amplification', pct: true },
  amplifyfrontattack: { label: 'Front Attack Amplification', pct: true },
}

/** A stat as a line of the window: its name and its value as the game writes it. */
export interface StatLine {
  label: string
  value: string
  /** Its grade's colour (a stone's rank: 11 white, 21 green, 31 blue, 41 gold), or none. */
  grade?: number
}
/** As the game's soul binding window writes it: a percent to two places ("9.72%"). */
const formatValue = (id: string, v: number): string => (STATS[id]?.pct ? `${(v / 100).toFixed(2)}%` : v.toLocaleString('en-US'))
const labelOf = (id: string | undefined, code: number): string => (id ? (STATS[id]?.label ?? id) : `Stat 0x${code.toString(16)}`)

/** A stone set in an equipment: its stat and value at its rank, in its grade's colour. */
export function stoneLine(stone: number, code: number, rank: number): StatLine {
  const id = STAT_CODES[code]
  const r = id ? STONES[stone]?.[id]?.[rank - 1] : undefined
  return { label: labelOf(id, code), value: r ? `+${formatValue(id!, r[1])}` : `rank ${rank}`, grade: r?.[0] }
}

/** A soul binding's stat: named and valued, out of the most it can roll on that item ("308/361"). */
export function soulLine(code: number, value: number, max?: Record<string, number>): StatLine {
  const id = STAT_CODES[code]
  const most = id ? max?.[id] : undefined
  return { label: labelOf(id, code), value: id ? `${formatValue(id, value)}${most ? `/${formatValue(id, most)}` : ''}` : String(value) }
}

/** An Arcana's own stats, by code: the game's names where seen (the Chalice of Vigor's "Time [Siel]"). */
const ARCANA_STATS: Record<number, string> = { 0x0b: 'Time [Siel]' }
export function arcanaStatLine(code: number, value: number): StatLine {
  return { label: ARCANA_STATS[code] ?? `Stat 0x${code.toString(16)}`, value: String(value) }
}

/** A skill an equipment raises: its name and "Lv. +1". */
export function skillLine(skill: number, levels: number): StatLine {
  return { label: SKILLS[skill] ?? `Skill ${skill}`, value: `Lv. +${levels}` }
}

/** What questlog has of an equipment, as the main process keeps it (main/itemDetails.ts). */
export interface ItemDetails {
  /** Its item level before enchantment (the game's "70" of "70 (+21)"). */
  itemLevel: number | null
  /** Its base stats, by questlog's stat ids. */
  main: Record<string, number>
  /** The bonus each enchantment level adds, by stat id. */
  enchants: Record<number, Record<string, number>>
  /** The most each soul binding stat can roll on it, by stat id (questlog's subStats). */
  soulMax?: Record<string, number>
}

/** Its base stats as the window's lines, with its enchantment's bonus: "Attack 278–350 (+79)". */
export function baseLines(d: ItemDetails, enchant: number): StatLine[] {
  const bonus = d.enchants[enchant] ?? {}
  const plus = (id: string): string => (bonus[id] ? ` (+${formatValue(id, bonus[id]!)})` : '')
  const lines: StatLine[] = []
  if (d.main['weapondamage']) lines.push({ label: 'Attack', value: `${d.main['weaponmindamage'] ?? d.main['weapondamage']}–${d.main['weapondamage']}${plus('weapondamage')}` })
  for (const [id, v] of Object.entries(d.main)) {
    if (!v || id.startsWith('weapon') && id !== 'weaponaccuracy' || !STATS[id]) continue
    lines.push({ label: STATS[id]!.label, value: `${formatValue(id, v)}${plus(id)}` })
  }
  // An enchantment's bonus to a stat the base has none of (armor's HP...).
  for (const [id, v] of Object.entries(bonus)) if (!d.main[id] && STATS[id] && !id.startsWith('weapon')) lines.push({ label: STATS[id]!.label, value: `+${formatValue(id, v)}` })
  return lines
}
