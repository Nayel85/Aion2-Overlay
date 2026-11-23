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
 * possible stats (questlog's subStats ranges), over the three characters' 119 soul-bound items
 * (worn, bags, warehouses): the one id that fits every time, else the one the others left. Where two
 * still fit, by how the game numbers them (`~`): an attack's damage next to its defense (Back Attack
 * 0x62 by Back Defense 0x63, Front Attack 0x24B by 0x24C, Critical Damage 0x26 by Critical Damage
 * Defense 0x29), a stat 4 before its resist (Perfect 0x1BA, Perfect Resist 0x1BE: Hard Hit 0x1BB, so
 * 0x1BD Iron Wall), the base stats in their usual order. Then checked on Nayoul's windows: Wisdom
 * Guard (Weapon Damage Boost 0x20 4.6%, Multi-hit Chance 0x92 4.8%), High Commander Lagta Helm
 * (Double Chance 0x1BB 1.6%), Holy Spirit Spellbook (Critical Attack 0x26, Status Effect Chance 0x9E
 * 15.8%), Holy Spirit Knife (Might 0x1), Wisdom Bow (Precision 0x5); Nayel's Vakron Greaves
 * (Endurance 0x1BD 2.7%, Natural MP Regen 0xC8 20).
 */
import { ITEMS } from './items.ts'
import { SKILLS } from './skills.ts'
import { STONES } from './stones.ts'

/** The game's stat codes, by questlog's stat ids. */
export const STAT_CODES: Record<number, string> = {
  0x1: 'str',
  0x5: 'agi',
  0x6: 'wis',
  0x20: 'amplifyweapondamage',
  0x26: 'criticaladddamage',
  0x62: 'backattackdamage',
  0x92: 'additionalhitrate',
  0x9e: 'abnormalaccuracy',
  0xeb: 'amplifyhphealget',
  0x1aa: 'defenseratio',
  0x1ba: 'perfect',
  0x1bb: 'hardhit',
  0x1bc: 'restoration',
  0x1bd: 'ironwall',
  0x1be: 'perfectresist',
  0x24b: 'frontattackdamage',
  0x2: 'dex',
  0x4: 'con',
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
  mpregen: { label: 'Natural MP Regen' },
  fpmax: { label: 'Flight Time' },
  str: { label: 'Might' },
  dex: { label: 'Dexterity' },
  con: { label: 'Constitution' },
  agi: { label: 'Precision' },
  wis: { label: 'Willpower' },
  abnormalresistance: { label: 'Status Effect Resistance' },
  decreaseweapondamage: { label: 'Weapon Damage Tolerance', pct: true },
  frontattackdefense: { label: 'Front Defense' },
  backattackdefense: { label: 'Back Defense' },
  criticaldamagedefense: { label: 'Critical Damage Defense' },
  armorevasion: { label: 'Evasion' },
  hpregen: { label: 'Natural HP Regen' },
  criticaladddamage: { label: 'Critical Attack' },
  backattackdamage: { label: 'Back Attack' },
  frontattackdamage: { label: 'Front Attack' },
  abnormalaccuracy: { label: 'Status Effect Chance', pct: true },
  amplifyhphealget: { label: 'Healing Received', pct: true },
  defenseratio: { label: 'Defense Rate' },
  perfect: { label: 'Perfect' },
  perfectresist: { label: 'Perfect Resist' },
  hardhit: { label: 'Double Chance', pct: true },
  ironwall: { label: 'Endurance', pct: true },
  restoration: { label: 'Restoration' },
  combatspeed: { label: 'Combat Speed', pct: true },
  weaponaccuracy: { label: 'Accuracy' },
  amplifyalldamage: { label: 'Damage Amplification', pct: true },
  amplifyweapondamage: { label: 'Weapon Damage Boost', pct: true },
  additionalhitrate: { label: 'Multi-hit Chance', pct: true },
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

/**
 * How good a soul binding stat's roll is, as the game's soul binding window puts it under each line:
 * where it lies in its item's range, counting both ends ((value - min + 1) / (max - min + 1)). Matched
 * on the owner's 14 lines (2026-11-23): the bow's HP 308 of 308-361, 2%; Bakarma Boots' Dexterity 21
 * of 15-24, 70%. Null without the range.
 */
export function soulRoll(code: number, value: number, range?: Record<string, [number, number]>): number | null {
  const id = STAT_CODES[code]
  const r = id ? range?.[id] : undefined
  return r ? Math.min(1, Math.max(0, (value - r[0] + 1) / (r[1] - r[0] + 1))) : null
}

/**
 * The soul binding rate: the mean of its stats' rolls, each skill it raises counting in full, cut
 * (not rounded) to a tenth of a percent as the game writes it (the bow: 2%, 1%, 6% and its Tempest
 * Shot 100%, 27.1%; Vakron Greaves 35.4%; Bakarma Boots 27.0%; Gartua Breastplate 23.6%). Null when a
 * stat's range is not known.
 */
export function soulRate(soul: [number, number][], skills: number, range?: Record<string, [number, number]>): number | null {
  if (!soul.length) return null
  const rolls = soul.map(([code, value]) => soulRoll(code, value, range))
  if (rolls.some((r) => r === null)) return null
  const mean = ((rolls as number[]).reduce((a, r) => a + r, 0) + skills) / (rolls.length + skills)
  return Math.floor(mean * 1000 + 1e-9) / 10
}

/** A soul binding's stat: named and valued, out of the most it can roll on that item ("308/361"), with its roll ("2%"). */
export function soulLine(code: number, value: number, range?: Record<string, [number, number]>): StatLine & { roll?: number } {
  const id = STAT_CODES[code]
  const most = id ? range?.[id]?.[1] : undefined
  const roll = soulRoll(code, value, range)
  return { label: labelOf(id, code), value: id ? `${formatValue(id, value)}${most ? `/${formatValue(id, most)}` : ''}` : String(value), ...(roll !== null ? { roll: Math.round(roll * 100) } : {}) }
}

/**
 * An Arcana's own stats, by code: the game's names, seen on Nayoul's Vigor set (Bell: Justice 16,
 * Compass: Freedom 15, Mirror: Illusion 16, Parchment: Life 12, Chalice: Time 21). Death, Destiny,
 * Destruction, Space and Wisdom not seen yet: told by their number.
 */
const ARCANA_STATS: Record<number, string> = { 0x07: 'Justice [Nezekan]', 0x08: 'Freedom [Vaizel]', 0x09: 'Illusion [Kaisinel]', 0x0a: 'Life [Yustiel]', 0x0b: 'Time [Siel]' }
export function arcanaStatLine(code: number, value: number): StatLine {
  return { label: ARCANA_STATS[code] ?? `Stat 0x${code.toString(16)}`, value: String(value) }
}

/** A skill an equipment raises: its name and "Lv. +1". */
export function skillLine(skill: number, levels: number): StatLine {
  return { label: SKILLS[skill] ?? `Skill ${skill}`, value: `Lv. +${levels}` }
}

/**
 * The Theostone engraved, by its effect: the Theostone items whose ids end the same five digits
 * (effect 19950011: Theostone: Zikel's Vestige, 513850011, 533850011...; unique over all 51). Its
 * item (to ask its description of questlog), name and icon; null when none.
 */
export function theostoneOf(effect: number): { item: number; name: string; icon: string | null } | null {
  if (!effect) return null
  const found = Object.entries(ITEMS).find(([id, i]) => i[3] === 'getgodstone' && Number(id) % 100_000 === effect % 100_000)
  return found ? { item: Number(found[0]), name: found[1][0].replace(' (Bound)', ''), icon: found[1][2] } : null
}

/** What questlog has of an equipment, as the main process keeps it (main/itemDetails.ts). */
export interface ItemDetails {
  /** Its item level before enchantment (the game's "70" of "70 (+21)"). */
  itemLevel: number | null
  /** Its base stats, by questlog's stat ids. */
  main: Record<string, number>
  /** The bonus each enchantment level adds, by stat id. */
  enchants: Record<number, Record<string, number>>
  /** What each soul binding stat can roll on it, [least, most], by stat id (questlog's subStats). */
  soulRange?: Record<string, [number, number]>
  /** What it does, in plain text (a Theostone's effect). */
  description?: string
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
