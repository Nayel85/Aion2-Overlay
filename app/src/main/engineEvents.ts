/**
 * The engine's events (engine/src/sidecar.rs's list, one JSON line each), by type: what each one holds,
 * as the app reads it. Every handler of the engine's events (tracker.onEvent, main/tracker.ts's own) is
 * typed by it: a field read is the same field everywhere, and one the engine does not send is caught.
 * Each a `type` (not an interface): a handler written for any event (a plain record) takes it.
 */
import type { Buff, BuffTrack } from '../shared/buffs.ts'
import type { FlightPower } from '../shared/flight.ts'
import type { GatherRoll } from '../shared/gather.ts'
import type { DepotItem } from '../shared/inventory.ts'
import type { PartyDebuff, PartyMember } from '../shared/party.ts'
import type { AggroMob, Cube, Enemy, Nearby, Pet, PvpKill, ShopItem, TrackerStatus } from '../shared/tracker.ts'

type ItemAmount = { item: number; amount: number }
/** Whose a login's or a balance's figures are: null while a login waits for its character. */
type Whose = { name: string | null; server: number | null; ts?: number }
/** A login's figures: the character's always (the engine waits for them). */
type Login = { name: string; server: number | null; ts?: number }
/** A character on the selection screen. */
export type ListedCharacter = { key: string; name: string; server: number; className: string | null; level: number; gearScore: number; legion: string | null }

export type EngineEvents = {
  ready: { pets: Pet[]; character: { name: string; server?: number } | null }
  character: { name: string; server?: number; switched?: boolean; pets: Pet[] }
  status: { state: TrackerStatus['state']; server?: number; detail?: string }
  heartbeat: { lastPacketAgo: number | null }
  player: { level: number }
  sync: { collection: Pet[]; pets: number; souls: number }
  soul: { pet: Pet; amount: number; levelUp?: boolean }
  crystal: { pet: Pet | null; amount: number; raw?: unknown; npc?: number | null; genus?: string | null; levelCorrected?: boolean; kills?: { npc: number | null; name: string | null; pet: number | null; ago: number }[] }
  pet: { pet: Pet }
  snapshot: { pets: Pet[] }
  combat: Record<string, never>
  kina: Whose & { balance: number }
  boundKina: Whose & { balance: number }
  currency: Whose & { item: number; balance: number }
  item: { ts?: number; item: number; amount: number }
  dungeonStart: { ts?: number; zone: number }
  dungeonClear: { ts?: number; zone: number }
  /** 1 entered (the countdown before the start), 2 under way, 3 over; `at` on the game's clock. */
  dungeonState: { ts?: number; zone: number; state: number; at: number; deadline: number }
  nightmare: { ts?: number; boss: number; level?: number }
  gather: { ts?: number; item?: number; amount?: number; bonus?: number; result?: number }
  gatherStart: { node?: number; template?: number | null; outcome: number; grade?: number; rolls?: GatherRoll[]; doubled?: boolean; durationMs?: number }
  gatherEnd: { node?: number }
  rewardBoard: { ts?: number; entries?: { name: string | null; items: ItemAmount[] }[] }
  playerDied: { at: number; name: string | null; you: boolean }
  loot: { ts?: number; source?: number; items?: ItemAmount[] }
  /** `balances`: the Oath Coins and Abyss Points by item id; `seasonWeek`: the season's weekly progress (0-8000). */
  wallet: Login & { kina: number | null; boundKina: number | null; balances?: Record<string, number>; seasonWeek?: number | null }
  /** An Oath Coins or Abyss Points balance, as it changes (`name` null while a login waits for its character). */
  balance: Whose & { item: number; balance: number }
  /** The season's weekly rewards' progress, as it moves. */
  seasonWeek: Whose & { value: number }
  subscriptions: Login & { list: { id: number; end: number }[] }
  abyss: { ts?: number; name: string | null; points: number; limit: number; gained: number }
  abyssGain: { name: string | null; gained: number }
  shop: { tab: number; nextAt: number | null; items: ShopItem[] }
  fieldBosses: { world: number; bosses: { id: number; up: boolean; at: number }[] }
  bossKilled: { npc: number }
  party: { members?: PartyMember[] }
  flight: { fp: FlightPower | null }
  supplyDone: { request: number; rewards?: ItemAmount[] }
  craftStart: { recipe: number; outcome: number; durationMs?: number }
  craftResult: { recipe: number; item: number }
  craftDone: { recipe: number }
  spot: { template: number; world: number | null; position: [number, number] }
  partyDebuffs: { debuffs?: Record<number, PartyDebuff[]> }
  bossTarget: { boss?: number; target: number | null }
  partyVitals: { entity: number; hp: number; maxHp: number; flight: number; maxFlight: number }
  inventory: Whose & { items?: DepotItem[] }
  inventorySlots: Whose & { slots?: DepotItem[] }
  dutyDone: { quest: number; rewards?: ItemAmount[]; offered?: { item: number; amount: number; chance: number; got: boolean }[] }
  dutyTaken: { quest: number; place: number }
  /** The duty board opened again, its board the one already told. */
  dutyOpened: Record<string, never>
  /** A kill in an arena's match: who killed whom, who assisted (names; null when not among its players). */
  arenaKill: { killer: string | null; victim: string | null; assists?: string[] }
  dutyBoard: { opened?: boolean; rerolls: number; expires: number | null; missions?: { quest: number; place: number; rewards: { item: number; amount: number; chance: number }[] }[] }
  boxOpened: { items?: { item: number; spent: boolean; amount: number }[] }
  pvpKill: { killer: PvpKill['killer']; victim?: PvpKill['victim']; mine?: boolean; died?: boolean; legion?: boolean; fight?: string | null }
  nearby: { world?: number | null; position: Nearby['position']; monsters: Nearby['monsters'] }
  cubes: { cubes: Omit<Cube, 'seenAt'>[] }
  cubeOpened: { id: number; template?: number; position?: [number, number] }
  expeditions: { entries?: { world: number; cubes: number; flag?: number }[] }
  characterList: { ts?: number; characters?: ListedCharacter[] }
  counters: Login & { values: Record<string, number[]> }
  counter: Login & { id: string; values: number[] }
  me: { ts?: number; server: number; name: string; classId?: number; className: string | null; level?: number; gearScore?: number }
  enemies: { players?: Enemy[] }
  aggro: { ts?: number; mobs: AggroMob[] }
  target: { name: string; server: number | null; level: number | null; gearScore: number | null; pvp?: boolean; openPvp?: boolean; combatPower: number | null; className: string | null; legion: string | null; enemy?: boolean }
  targetClear: Record<string, never>
  applicant: { character: number; name: string; server: number | null; className: string | null; level: number | null; gearScore: number | null; combatPower: number | null }
  applicantGone: { character: number }
  ping: { ms: number | null }
  buffs: { buffs?: Buff[] }
  focus: { game?: boolean; app?: boolean }
  packets: { on?: boolean; path?: string; count?: number }
  dps: { fightBuffs?: { durationMs: number; buffs: BuffTrack[] } | null }
  historyChanged: Record<string, never>
  recording: Record<string, never>
  error: { detail?: string }
  personalBest: { boss: string; character: string; dps: number; before: number | null; fight: string }
  /** Answers to the meter's commands (main/meter.ts), each its `request`. */
  details: { request?: number }
  history: { request?: number }
  bests: { request?: number }
  fight: { request?: number }
  pvpFight: { request?: number }
  recordings: { request?: number }
}

export type EngineEventType = keyof EngineEvents
/** Any one of the engine's events, its `type` telling which (main/tracker.ts's switch narrows it). */
export type EngineEvent = { [K in EngineEventType]: { type: K } & EngineEvents[K] }[EngineEventType]
