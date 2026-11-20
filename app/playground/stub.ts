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
  pets: [], nearby: { world: null, position: [1000, 1000], positionAt: now(), monsters: [] }, shop: [], kina, abyss: abyss(), rifts: [],
  fieldBosses, pvp, cubes, enemies, target,
})

const data: Record<string, () => unknown> = {
  'settings:all': () => settings,
  'tracker:get': tracker,
  'characters:get': () => ({}),
  'guildEvents:get': () => ({ state: 'ok', message: null, member: null, events: guildEvents, live: false, dismissed: [], at: now() }),
  'timers:get': () => [],
  'buffs:get': () => [],
  'meter:get': () => meter,
}

export function installStub(): void {
  ;(window as unknown as { a2t: unknown }).a2t = {
    invoke: async (channel: string, ...args: unknown[]) => {
      if (channel === 'settings:set') return void setSetting(args[0] as SettingKey, args[1])
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
  hitMonster(): void {
    fight = { name: 'Ancient Guardian', boss: true, maxHp: 1_000_000, hp: 960_000, damage: 0, start: now(), until: now() + 12_000, player: false }
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
      { entity: 1, name: 'Kyune', server: 2104, legion: 'Black Wings', pvp: true, combatPower: 115_400, className: 'Gladiator' },
      { entity: 2, name: 'Saladin', server: 2104, legion: 'Black Wings', pvp: true, combatPower: 109_800, className: 'Sorcerer' },
      { entity: 3, name: 'Nasher', server: 2104, legion: null, pvp: true, combatPower: 98_200, className: 'Assassin' },
      { entity: 4, name: 'Calm', server: 2104, legion: null, pvp: false },
    ] as Enemy[]
    emit('tracker:enemies', enemies)
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
    cubes = [{ id: 1, template: 1, position: [1050, 1040], height: 0, createdAt: null, seenAt: now() }]
    emit('tracker:cubes', cubes)
  },
  died(): void {
    pvp = [...pvp, { at: now(), killer: { name: 'Kyune', server: 2104, guild: 'Black Wings' }, victim: { name: ME, server: 1104 }, mine: false, died: true, legion: false, place: { world: 1, position: [980, 1030] } } as PvpKill]
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
