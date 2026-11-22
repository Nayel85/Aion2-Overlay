/**
 * A stand-in for the app's main process: the bridge (`window.a2t`) answers from a small simulated
 * game, and `sim` plays the events the engine would send. The real pages run on it unchanged.
 */
import { SETTINGS_DEFAULTS, normalise, type SettingKey, type Settings } from '@shared/settings.ts'
import { currentSeason, type AbyssGain } from '@shared/abyss.ts'
import type { Cube, Enemy, PvpKill, TargetPlayer } from '@shared/tracker.ts'
import type { MeterData, MeterRow } from '@shared/meter.ts'

type Fn = (payload: never) => void
const listeners = new Map<string, Set<Fn>>()
const emit = (channel: string, payload: unknown): void => listeners.get(channel)?.forEach((fn) => fn(payload as never))

const ME = 'Ksix'
const now = (): number => Date.now()

const settings: Settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS))
settings.unified.enabled = true
settings.language = 'en'

let pvp: PvpKill[] = []
let cubes: Cube[] = []
let enemies: Enemy[] = []
let target: TargetPlayer | null = null
let fieldBosses: Record<number, { up: boolean; at: number; seen: number }> = {}
let guildEvents: unknown[] = []
let kina = { earned: 0, activeMs: 0, lastAt: null as number | null, gains: [] as [number, number][], balance: 1_000_000 }
let gains: AbyssGain[] = []
let abyssPoints = 5000
let meter: MeterData = idleMeter()
const pets = [
  { id: 1002, name: 'Krall Armed Soldier', souls: 17, level: 1, levelEstimated: false, crystals: 0, session: 12 },
  { id: 1003, name: 'Canyon Vine Spirit', souls: 2, level: 0, levelEstimated: false, crystals: 0, session: 5 },
]

function row(id: number, name: string, className: string, damage: number, dps: number, you = false): MeterRow {
  return { id, name, className, dps, damage, share: 0, hps: 0, heal: 0, taken: 0, critRate: 0.3, combatPower: 100000, you, party: true, others: false } as MeterRow
}
function idleMeter(): MeterData {
  return { target: null, mode: 'bossTargets', battleTime: 0, rows: [], at: now(), ping: 40, meKnown: true, me: 1, train: null } as MeterData
}

const abyss = () => {
  const earned = gains.reduce((a, g) => a + g[1], 0)
  return { earned, activeMs: Math.max(60_000, gains.length * 20_000), lastAt: gains.at(-1)?.[0] ?? null, gains: gains.map((g) => [g[0], g[1]]), points: abyssPoints, limit: 3_500_000, season: currentSeason(gains) }
}

const tracker = () => ({
  status: { state: 'locked', detail: null, lastPacketAgo: 1, gameActive: true, replay: false, synced: null, dataFile: null, character: ME, server: 1104, level: 45, npcapMissing: false },
  pets, nearby: { world: 1010, position: [-5000, -8000], positionAt: now(), monsters: [{ npc: 2100075, count: 6 }, { npc: 2100601, count: 3 }] }, shop: [], kina, abyss: abyss(), rifts: [],
  fieldBosses, pvp, cubes, enemies, target,
})

/** Join requests, as main keeps them (the Applicants widget). */
let applicants: { list: unknown[]; lastAt: number } = { list: [], lastAt: 0 }

/** A roster for the Guild page: members with their main and alts. */
function guildSample(): unknown {
  const classes = ['gladiator', 'templar', 'assassin', 'ranger', 'sorcerer', 'summoner', 'cleric', 'chanter']
  const people: [string, string[]][] = [
    ['Ksix', ['Ksix', 'Ksixx', 'TremendoHeal', 'Ksixxx']], ['Shiggly', ['Shiggly', 'Shigglypuff']], ['Bombon', ['Bombon', 'Bomboncito']], ['Athraia', ['Athraia']],
    ['Notsky', ['Notsky', 'Notskyy', 'Notskyyy']], ['YIYATESANO', ['YIYATESANO']], ['Vellari', ['Vellari', 'iVellari']], ['Hine', ['Hine']], ['Tadalafila', ['Tadalafila', 'Tadalafilo']],
    ['Clerigod', ['Clerigod']], ['Lezadinha', ['Lezadinha', 'Lezado']], ['Orenjikun', ['Orenjikun']],
  ]
  let n = 3
  const rnd = (): number => ((n = (n * 9301 + 49297) % 233280) / 233280)
  const at = now()
  const members = people.map(([name, chars], i) => ({
    id: i + 1,
    name,
    you: i === 0,
    characters: chars.map((c, j) => {
      const base = 2600 - j * 380 - Math.round(rnd() * 250)
      const energy = rnd() > 0.15 ? Math.round(rnd() * 56) * 15 : null
      return {
        name: c, server: 1406, className: classes[Math.floor(rnd() * classes.length)], level: 45, gearScore: base, combatPower: Math.round(base * (38 + rnd() * 16)),
        main: j === 0, portraitUrl: null, legion: 'Lokthar', reportedAt: at,
        energy: energy === null ? null : { value: energy, extra: rnd() > 0.6 ? Math.round(rnd() * 150) : 0, max: 840, per: 15, nextAt: at + 3_600_000, fullAt: at + 86_400_000, readAt: at },
        nightmare: null, ascension: null,
      }
    }),
  }))
  return { state: 'ok', message: null, roster: 'Main', main: { name: 'Ksix', server: 1406 }, members, at }
}

const data: Record<string, () => unknown> = {
  'guild:get': guildSample,
  'applicants:get': () => applicants,
  'settings:all': () => settings,
  'tracker:get': tracker,
  // Odyle energy 610 (+45 charged) as of an hour ago: what the HUD's energy figure works from.
  'characters:get': () => ({ [`1104:${ME}`]: { counters: { at: now() - 3_600_000, values: { '60000001': [610, 45] } } } }),
  'guildEvents:get': () => ({ state: 'ok', message: null, member: null, events: guildEvents, live: false, dismissed: [], at: now() }),
  'timers:get': () => [],
  'buffs:get': () => [],
  'meter:get': () => meter,
  'storage:get': () => ({ dir: 'C:\\Users\\you\\AppData\\Roaming\\Lokthar', items: [{ id: 'tiles', bytes: 182_000_000, clearable: true }, { id: 'browser', bytes: 96_500_000, clearable: true }, { id: 'logs', bytes: 4_200_000, clearable: true }, { id: 'updates', bytes: 0, clearable: true }, { id: 'recordings', bytes: 1_240_000_000, clearable: true }, { id: 'fights', bytes: 58_000_000, clearable: false }] }),
  'history:list': () => {
    const jobs = ['Gladiator', 'Templar', 'Sorcerer', 'Cleric', 'Ranger', 'Chanter']
    const at = now()
    const mk = (i: number, boss: string, minsAgo: number, secs: number, dmg: number) => ({ id: `f${i}`, bossName: boss, isTrain: false, startTimeMs: at - minsAgo * 60_000, durationMs: secs * 1000, totalDamage: dmg, memberJobs: jobs.slice(0, 3 + (i % 4)) })
    return [
      mk(1, 'Eternal Ludra', 20, 310, 91_000_000), mk(2, 'Eternal Ludra', 50, 280, 85_000_000), mk(9, 'Vakron', 70, 200, 50_000_000), mk(3, 'Isolation Specialist Rahu', 95, 150, 40_000_000), mk(4, 'Abyssal Wings Ketu', 130, 200, 52_000_000),
      mk(5, 'Afflicted Bakarma', 1500, 240, 61_000_000), mk(6, 'Phantasmal Lakshmi', 1530, 200, 49_000_000), mk(7, 'Nazarak', 3000, 180, 33_000_000), mk(8, 'Some Unknown Boss', 3200, 90, 12_000_000),
    ]
  },
}

export function installStub(): void {
  ;(window as unknown as { a2t: unknown }).a2t = {
    invoke: async (channel: string, ...args: unknown[]) => {
      if (channel === 'settings:set') return void setSetting(args[0] as SettingKey, args[1])
      if (channel === 'killfeed:open' || channel === 'killfeed:close') {
        settings.killFeed.open = channel === 'killfeed:open'
        return void emit('settings:changed', JSON.parse(JSON.stringify(settings)))
      }
      if (channel === 'applicants:dismiss') {
        applicants = { ...applicants, list: applicants.list.filter((a) => (a as { character: number }).character !== args[0]) }
        return void emit('applicants:changed', applicants)
      }
      if (channel === 'unified:resize' || channel === 'unified:moveTo' || channel === 'unified:dragEnd') return undefined
      const read = data[channel]
      if (read) return read()
      log(`unanswered: ${channel}`)
      return undefined
    },
    on: (channel: string, fn: Fn) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(fn)
      listeners.set(channel, set)
      return () => set.delete(fn)
    },
  }
}

const logs: string[] = []
const log = (line: string): void => void (logs.push(line), logs.length > 40 && logs.shift(), console.debug('[playground]', line))
export const messages = logs

export function setSetting<K extends SettingKey>(key: K, value: unknown): void {
  ;(settings as unknown as Record<string, unknown>)[key] = normalise(key, value)
  emit('settings:changed', JSON.parse(JSON.stringify(settings)))
}
export const getSettings = (): Settings => settings
export const patchUnified = (patch: Partial<Settings['unified']>): void => setSetting('unified', { ...settings.unified, ...patch })

// ---- the simulated game ----------------------------------------------------------------------

let fight: { name: string; boss: boolean; maxHp: number; hp: number; damage: number; start: number; until: number; player: boolean } | null = null
let loop: ReturnType<typeof setInterval> | null = null

function pushMeter(): void {
  if (!fight) return
  const secs = Math.max(1, (now() - fight.start) / 1000)
  meter = {
    ...meter, at: now(), battleTime: now() - fight.start, meKnown: true, me: 1,
    target: { id: fight.player ? 7 : 5, name: fight.name, boss: fight.boss, maxHp: fight.maxHp, hp: Math.max(0, fight.hp) },
    rows: [row(1, ME, 'Gladiator', fight.damage, fight.damage / secs, true), row(2, 'Wolves', 'Sorcerer', fight.damage * 0.8, (fight.damage * 0.8) / secs), row(3, 'Stoopzz', 'Cleric', fight.damage * 0.6, (fight.damage * 0.6) / secs)],
  }
  emit('meter:dps', meter)
}
function tick(): void {
  if (!fight || now() > fight.until) {
    if (loop) clearInterval(loop)
    loop = null
    return
  }
  const rate = fight.player ? 9800 + Math.random() * 900 : 15300 + Math.random() * 1400
  fight.damage += rate
  fight.hp -= rate * (fight.player ? 3.4 : 1.2)
  pushMeter()
}

const KYUNE: TargetPlayer = { name: 'Kyune', server: 2104, level: 45, gearScore: 4210, pvp: true, combatPower: 115_400, className: 'Gladiator', legion: 'Black Wings', enemy: true, at: 0 }

export const sim = {
  /** A meter with a fight in it, standing still (no hit follows, so no target card). */
  staticMeter(): void {
    const mk = (id: number, name: string, className: string, damage: number, you = false) => row(id, name, className, damage, damage / 55, you)
    meter = { ...idleMeter(), battleTime: 55_000, target: { id: 5, name: 'Ancient Guardian', boss: true, maxHp: 1_000_000, hp: 640_000 }, rows: [mk(2, 'Wolves', 'Sorcerer', 6_920_000), mk(3, 'Stoopzz', 'Cleric', 6_510_000), mk(1, ME, 'Templar', 3_080_000, true)] } as MeterData
  },
  /** The party from the DPS meter screenshot, each with a combat power. */
  party(): void {
    const mk = (id: number, name: string, className: string, damage: number, power: number, you = false) => ({ ...row(id, name, className, damage, damage / 120, you), combatPower: power })
    meter = { ...idleMeter(), battleTime: 120_000, target: { id: 5, name: 'Isolation Specialist Rahu', boss: true, maxHp: 1_000_000, hp: 640_000 }, rows: [mk(2, 'MarceUY', 'Templar', 26_550_000, 118_240), mk(3, 'Nasher', 'Sorcerer', 24_200_000, 112_900), mk(1, 'Ksix', 'Gladiator', 18_690_000, 109_350, true), mk(4, 'Enfas', 'Gladiator', 11_490_000, 96_800), mk(5, 'Shiggly', 'Cleric', 4_720_000, 91_200), mk(6, 'Awaeken', 'Chanter', 0, 88_450)] } as MeterData
  },
  /** A long fight, for a meter that keeps moving. */
  longFight(): void {
    sim.hitMonster(600_000, 100_000_000)
  },
  /** Kills in the feed, yours and others'. */
  kills(): void {
    const k = (at: number, killer: string, victim: string, mine: boolean, died: boolean) => ({ at: now() - at, killer: { name: killer, server: 2104, guild: 'Black Wings', className: 'Gladiator', combatPower: 112_000 }, victim: { name: victim, server: 1104, className: 'Sorcerer', combatPower: 105_000 }, mine, died, legion: false }) as unknown as PvpKill
    pvp = [k(300_000, 'Nasher', 'VicTao', false, false), k(120_000, 'Kyune', ME, false, true), k(40_000, ME, 'Saladin', true, false), k(8_000, ME, 'Ertec', true, false)]
    emit('tracker:pvp', pvp)
  },
  hitMonster(ms = 12_000, hp = 1_000_000): void {
    fight = { name: 'Ancient Guardian', boss: true, maxHp: hp, hp: hp * 0.96, damage: 0, start: now(), until: now() + ms, player: false }
    loop ??= setInterval(tick, 1000)
    tick()
  },
  hitPlayer(): void {
    sim.selectPlayer()
    fight = { name: 'Kyune', boss: false, maxHp: 300_000, hp: 260_000, damage: 0, start: now(), until: now() + 12_000, player: true }
    loop ??= setInterval(tick, 1000)
    tick()
  },
  selectPlayer(): void {
    target = { ...KYUNE, at: now() }
    emit('tracker:target', target)
  },
  selectUnknownPlayer(): void {
    target = { name: 'Saphy', server: 2104, level: null, gearScore: null, combatPower: null, className: null, legion: null, enemy: true, pvp: true, at: now() }
    emit('tracker:target', target)
  },
  clearTarget(): void {
    target = null
    fight = null
    emit('tracker:target', null)
  },
  enemies(): void {
    enemies = [
      { entity: 1, name: 'Kyune', server: 2104, legion: 'Black Wings', pvp: true, combatPower: 115_400, className: 'Gladiator', position: [-4200, -7600] },
      { entity: 2, name: 'Saladin', server: 2104, legion: 'Black Wings', pvp: true, combatPower: 109_800, className: 'Sorcerer', position: [-6100, -8700] },
      { entity: 3, name: 'Nasher', server: 2104, legion: null, pvp: true, combatPower: 98_200, className: 'Assassin' },
      { entity: 4, name: 'Calm', server: 2104, legion: null, pvp: false },
    ] as Enemy[]
    emit('tracker:enemies', enemies)
  },
  /** One more join request: they arrive one by one (the widget animates each). */
  apply(): void {
    const pool = [
      ['Vellari', 'Cleric', 102_709, 2222, 2404], ['Hine', 'Chanter', 105_405, 2090, 2405], ['Tadalafila', 'Cleric', 66_513, 1446, 1401], ['Clerigod', 'Cleric', 86_323, 1506, 2401],
      ['TempestaD', 'Cleric', 85_919, 1826, 2401], ['Biaa', 'Chanter', 97_663, 1745, 2403], ['Block', 'Gladiator', 88_489, 1509, 2401], ['JumpingQQQ', 'Assassin', 100_375, 1745, 2404],
    ] as const
    const [name, className, combatPower, gearScore, server] = pool[applicants.list.length % pool.length]!
    const at = now()
    applicants = { list: [...applicants.list, { character: at, name, server, className, level: 45, gearScore, combatPower, at }], lastAt: at }
    emit('applicants:changed', applicants)
  },
  noApplicants(): void {
    applicants = { list: [], lastAt: applicants.lastAt }
    emit('applicants:changed', applicants)
  },
  noEnemies(): void {
    enemies = []
    emit('tracker:enemies', enemies)
  },
  fieldBoss(): void {
    fieldBosses = { 101021: { up: true, at: now() - 60_000, seen: now() }, 101022: { up: false, at: now() + 200_000, seen: now() } }
    emit('tracker:fieldBosses', fieldBosses)
  },
  cube(): void {
    cubes = [{ id: 1, template: 1, position: [-5600, -8900], height: 0, createdAt: null, seenAt: now() }]
    emit('tracker:cubes', cubes)
  },
  noCube(): void {
    cubes = []
    emit('tracker:cubes', cubes)
  },
  died(): void {
    pvp = [...pvp, { at: now(), killer: { name: 'Kyune', server: 2104, guild: 'Black Wings' }, victim: { name: ME, server: 1104 }, mine: false, died: true, legion: false, place: { world: 1010, position: [-4800, -7000] } } as PvpKill]
    emit('tracker:pvp', pvp)
  },
  kina(): void {
    kina = { ...kina, earned: kina.earned + 1_200_000, activeMs: kina.activeMs + 600_000, lastAt: now(), gains: [...kina.gains, [now(), 1_200_000]], balance: kina.balance + 1_200_000 }
    emit('tracker:kina', kina)
  },
  abyssKill(points = 300): void {
    gains = [...gains, [now(), points, ME]]
    abyssPoints += points
    emit('tracker:abyss', abyss())
  },
  guildEvent(): void {
    guildEvents = [{ id: 1, name: 'Legion raid', activity: 'raid', activityLabel: 'Raid', color: '#70b8ff', startsAt: now() + 295_000, endsAt: now() + 4_000_000, description: null, closesAt: now() + 295_000, open: true, roster: 'x', status: 'going', counts: { going: 1, maybe: 0, declined: 0 }, unanswered: 0 }]
    emit('guildEvents:state', { state: 'ok', message: null, member: null, events: guildEvents, live: false, dismissed: [], at: now() })
  },
  reset(): void {
    if (loop) clearInterval(loop)
    loop = null
    fight = null
    pvp = []; cubes = []; enemies = []; target = null; fieldBosses = {}; guildEvents = []; gains = []
    kina = { ...kina, earned: 0, activeMs: 0, lastAt: null, gains: [] }
    meter = idleMeter()
    emit('meter:dps', meter)
    emit('tracker:target', null)
    emit('tracker:enemies', enemies); emit('tracker:cubes', cubes); emit('tracker:pvp', pvp)
    emit('tracker:fieldBosses', fieldBosses); emit('tracker:kina', kina); emit('tracker:abyss', abyss())
    emit('guildEvents:state', { state: 'ok', message: null, member: null, events: [], live: false, dismissed: [], at: now() })
  },
}

// ---- a PvP fight for the Details window ---------------------------------------------------------

/** A tiny seeded generator, so the same fight draws the same every time. */
function seeded(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

/** A skill that hits every `every` ms from `from`, with a little jitter. */
function line(actor: number, code: number, name: string, every: number, from: number, until: number, dmg: number, rnd: () => number) {
  const at: number[] = []
  for (let t = from; t < until; t += every * (0.85 + rnd() * 0.3)) at.push(Math.round(t))
  const damage = Math.round(at.length * dmg * (0.8 + rnd() * 0.4))
  return { actor, code, name, damage, hits: at.length, crits: Math.round(at.length * 0.3), maxHit: Math.round(dmg * 1.6), dot: false, back: 0, perfect: 0, double: 0, parry: 0, multi: 0, opening: at, at }
}

/** Ksix died to Ertec while Kyune and Saladin also hit; Saphy fought beside you. */
export function pvpFightView() {
  const rnd = seeded(7)
  const D = 49_000
  const skills = [
    line(2, 15010001, 'Hellfire', 2100, 600, D, 3100, rnd), line(2, 15020001, 'Ice Chain', 3200, 1200, D, 1900, rnd), line(2, 15030001, 'Cold Wave', 4800, 2000, D, 2400, rnd),
    line(2, 15040001, 'Blaze', 5200, 900, D, 2200, rnd), line(2, 15050001, 'Firestorm', 9000, 4000, 30_000, 5200, rnd), line(2, 15060001, 'Fire Mark', 6500, 300, D, 900, rnd),
    line(2, 15080001, 'Flame Arrow', 7000, 100, D, 1200, rnd), line(2, 15090001, 'Burst', 9800, 3100, D, 2800, rnd),
    line(3, 11010001, 'Rending Strike', 1500, 800, D, 2600, rnd), line(3, 11020001, 'Smash', 3400, 1500, D, 3400, rnd), line(3, 11030001, 'Charge', 8000, 400, D, 1800, rnd),
    line(4, 14010001, 'Soul Bolt', 1800, 1000, 38_000, 1500, rnd), line(4, 14020001, 'Spirit Wave', 4000, 2200, 38_000, 2100, rnd),
    line(1, 13010001, 'Divine Punishment', 1700, 5000, 21_000, 1700, rnd), line(1, 13020001, 'Judgment', 2600, 6000, 21_000, 2000, rnd),
    line(5, 12010001, 'Shadow Strike', 2200, 9000, 40_000, 1900, rnd),
  ]
  const dealt = (id: number): number => skills.filter((s) => s.actor === id).reduce((n, s) => n + s.damage, 0)
  const total = skills.reduce((n, s) => n + s.damage, 0)
  const actor = (id: number, name: string, className: string, you: boolean, enemy: boolean, cp: number) => ({ id, name, className, damage: dealt(id), dps: dealt(id) / (D / 1000), share: (dealt(id) / total) * 100, heal: 0, combatPower: cp, you, enemy })
  return {
    source: { kind: 'pvp', id: 'pvp-demo' }, buffs: null, title: 'Ksix vs Ertec · you died', startedAt: Date.now() - 600_000, battleTime: D, totalDamage: total, maxHp: 0,
    actors: [actor(1, 'Ksix', 'Templar', true, false, 209_800), actor(5, 'Saphy', 'Assassin', false, false, 188_000), actor(2, 'Ertec', 'Sorcerer', false, true, 195_000), actor(3, 'Kyune', 'Gladiator', false, true, 115_400), actor(4, 'Saladin', 'Spiritmaster', false, true, 109_800)].sort((a, b) => b.damage - a.damage),
    skills, heals: [],
    defense: { 1: { taken: 118_000, hitsTaken: 88, heal: 0 }, 5: { taken: 41_000, hitsTaken: 30, heal: 0 }, 2: { taken: 36_000, hitsTaken: 40, heal: 0 }, 3: { taken: 9_000, hitsTaken: 8, heal: 0 }, 4: { taken: 0, hitsTaken: 0, heal: 0 } },
  }
}
data['details:get'] = pvpFightView
data['details:view'] = pvpFightView
