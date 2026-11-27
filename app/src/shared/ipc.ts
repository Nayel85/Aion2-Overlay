/**
 * The IPC contract: every channel, its arguments and its result, in one place. Main registers
 * handlers against it, preload builds the bridge from it, the renderer calls the bridge. The
 * pattern is marnis-app's (shared/ipc-contract.ts), with this app's channels.
 */
import type { MarketPrices } from './market.ts'
import type { Buff } from './buffs.ts'
import type { Characters } from './characters.ts'
import type { Sessions } from './sessions.ts'
import type { Arrival, Inventories } from './inventory.ts'
import type { DutyState } from './duty.ts'
import type { Expeditions } from './expeditions.ts'
import type { ItemDetails } from './equipment.ts'
import type { Applicants } from './applicants.ts'
import type { Party } from './party.ts'
import type { FlightPower } from './flight.ts'
import type { GatherForecast } from './gather.ts'
import type { GameMapState, MapDetail } from './gameMap.ts'
import type { DummyState } from './dummy.ts'
import type { UpdateState } from './update.ts'
import type { KinaSession } from './kina.ts'
import type { AbyssGain, AbyssSession, RankChange, RiftFarm } from './abyss.ts'
import type { StorageId, StorageUsage } from './storage.ts'
import type { DetailsSource, DetailsView, Encounter, FightSummary, FightYou, MeterData, NewBest, PacketLog, PersonalView, Recordings } from './meter.ts'
import type { SyncResult } from './lokthar.ts'
import type { CustomSoundResult, SoundSlot } from './sounds.ts'
import type { Point, Rect, SettingKey, Settings } from './settings.ts'
import type { FieldBosses, TimerAlert, TimerId } from './timers.ts'
import type { Cube, Enemy, Nearby, TargetPlayer, Pet, PvpKill, PvpSummary, ShopStock, SoulToast, TrackerStatus, MerchantSeen, AggroMob } from './tracker.ts'

/** Renderer → main, request/response. */
/** The overlays that size themselves to their page, by their route. */
export const OVERLAY_IDS = ['aggro', 'applicants', 'party', 'flight', 'gather', 'skills', 'minimap', 'buffs', 'cc', 'enemies', 'training', 'packets', 'hud', 'merchant', 'meter', 'timerbar', 'unified', 'killfeed', 'duty'] as const
export type OverlayId = (typeof OVERLAY_IDS)[number]

export interface InvokeChannels {
  'app:info': { args: []; result: { version: string; settingsFile: string; logFile: string } }
  'app:quit': { args: []; result: void }
  'app:openPath': { args: [path: string]; result: void }

  'settings:all': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: void }

  'tracker:get': { args: [fullPvp?: boolean]; result: { status: TrackerStatus; pets: Pet[]; nearby: Nearby; shop: ShopStock[]; kina: KinaSession; abyss: AbyssSession; rifts: RiftFarm[]; fieldBosses: FieldBosses; pvp: PvpKill[]; pvpSummary?: PvpSummary; cubes: Cube[]; enemies: Enemy[]; aggro: AggroMob[]; target: TargetPlayer | null } }
  /** Markers on the game's map: drag a box around it (opens the picker). */
  'gamemap:pick': { args: []; result: void }
  /** From the picker: the box dragged, in its own coordinates; null when cancelled. */
  'gamemap:setRegion': { args: [box: Rect | null, view?: { width: number; height: number }]; result: void }
  /** From the overlay: how the search for the game's map is going. */
  'gamemap:report': { args: [state: GameMapState]; result: void }
  'gamemap:requestPreview': { args: []; result: void }
  'gamemap:get': { args: []; result: GameMapState }
  /** A line from the game map's overlay for its log; and that log, opened. */
  'gamemap:log': { args: [line: string]; result: void }
  'gamemap:openLog': { args: []; result: void }
  /** Start the markers on the game's map over: a new screen capture and a new search. */
  'gamemap:restart': { args: []; result: void }
  /** A zone's map at full detail (downloaded once, then kept): its keypoints, or its tiles; null while it cannot be had. */
  'gamemap:detail': { args: [key: string, cols: number, rows: number, col: number, row: number]; result: MapDetail }
  /** The keypoints the worker made of a zone's tiles, kept for next time. */
  'gamemap:saveFeatures': { args: [key: string, data: ArrayBuffer, col: number, row: number]; result: void }
  /** The display the region is on (the overlay cuts the region out of its picture). */
  'gamemap:display': { args: []; result: { bounds: Rect; scaleFactor: number } | null }
  /** The region as a w × h RGBA picture, the slow way (when the screen capture stream is stuck). */
  'gamemap:grab': { args: [w: number, h: number]; result: { width: number; height: number; rgba: Uint8Array } | null }
  /** Your characters (the Characters page). */
  'characters:get': { args: []; result: Characters }
  /** The play sessions: the one going on and the past ones (shared/sessions.ts). */
  'sessions:get': { args: []; result: Sessions }
  /** Your characters' items, as of each one's last login (shared/inventory.ts). */
  'inventory:get': { args: []; result: Inventories }
  /** The duty board: today's, every one seen, the rerolls' costs (shared/duty.ts). */
  'duty:get': { args: []; result: DutyState }
  /** Your server's market prices, as fetched (main/market.ts). */
  'market:get': { args: []; result: MarketPrices }
  /** You in each of these saved fights: your item level and combat power then. */
  'history:you': { args: [ids: string[]]; result: Record<string, FightYou> }
  /** Each character's cubes toward each expedition's guaranteed chest. */
  'expeditions:get': { args: []; result: Expeditions }
  /** What the Black Cloud Merchant has offered over time, by item. */
  'merchant:seen': { args: []; result: MerchantSeen }
  /** The duty board's window closed by its X (it opens again with the board). */
  'duty:close': { args: []; result: void }
  /** The Journal's Duty tab as the app knows it on the screen (main/dutyScreen.ts): when it was learned, or null. */
  'duty:screenLearned': { args: []; result: number | null }
  /** Learn it, once the game is back in front with the tab open: done, and how many bright spots it found. */
  'duty:learnScreen': { args: []; result: { ok: boolean; spots: number } }
  'duty:forgetScreen': { args: []; result: void }
  /** What came into your characters' hands, the oldest first (the latest 1000). */
  'inventory:arrivals': { args: []; result: Arrival[] }
  /** An equipment's base stats and enchantment bonuses (questlog's, asked once: main/itemDetails.ts). */
  'items:details': { args: [item: number]; result: ItemDetails | null }
  /** Join requests to your party (the Applicants widget). */
  'applicants:get': { args: []; result: Applicants }
  /** Your party and its members' HP (the party frames). */
  'party:get': { args: []; result: Party }
  /** An overlay window that sizes itself to its page (main/windows.ts `OVERLAYS`): moved by its drag, its place kept as it ends, sized as its page measures itself. */
  'overlay:moveTo': { args: [id: OverlayId, to: Point]; result: void }
  'overlay:dragEnd': { args: [id: OverlayId]; result: void }
  'overlay:resize': { args: [id: OverlayId, size: { width: number; height: number }]; result: void }
  /** Its place forgotten: back to where it goes first. */
  'overlay:resetPosition': { args: [id: OverlayId]; result: void }
  /** Your flight power (the flight timer). */
  'flight:get': { args: []; result: FlightPower | null }
  /** A gathering's outcome, known as it starts (the CC banner). */
  'gather:get': { args: []; result: GatherForecast | null }
  'applicants:dismiss': { args: [character: number]; result: void }
  'applicants:clear': { args: []; result: void }
  /** Ask NCSoft for a character's combat power and portrait again. */
  'characters:refresh': { args: [id: string]; result: void }
  /** Stop tracking a character. */
  'characters:forget': { args: [id: string]; result: void }
  /** Empty the PvP log. */
  'tracker:clearPvp': { args: []; result: void }
  'tracker:setSouls': { args: [pet: number, souls: number]; result: void }
  'tracker:setName': { args: [pet: number, name: string]; result: void }
  'tracker:restart': { args: []; result: void }
  /** Start the session again: its souls and its Kina. */
  'tracker:resetSession': { args: []; result: void }

  'bubble:moveTo': { args: [to: Point]; result: void }
  'bubble:dragEnd': { args: []; result: void }
  'panel:toggle': { args: []; result: void }
  'panel:hide': { args: []; result: void }
  /** Whether the overlays are being placed (the dashboard up): a window opened meanwhile asks, the change is `panel:visible`. */
  'panel:arranging': { args: []; result: boolean }
  /** The title bar's button: the overlays into placing, or out of it. */
  'panel:arrange': { args: [on: boolean]; result: void }
  'panel:minimize': { args: []; result: void }
  /** Maximise the dashboard, or back from maximised. */
  'panel:maximize': { args: []; result: void }

  'hud:setEditing': { args: [editing: boolean]; result: void }
  'merchant:close': { args: []; result: void }
  /** An item of the merchant's stock bought: off its list until the restock. */
  'merchant:bought': { args: [item: number]; result: void }
  /** Bring the dashboard up (the Unified HUD's cog). */
  'panel:open': { args: []; result: void }
  /** The dashboard on the Characters page (the Unified HUD's Odyle energy). */
  'panel:characters': { args: []; result: void }
  /** The kill feed over the game: opened from the PvP page, closed there or with its X. */
  'killfeed:open': { args: []; result: void }
  'killfeed:close': { args: []; result: void }
  /** The timers alerting now; and dismissing them (a click on the bubble). */
  'timers:get': { args: []; result: TimerAlert[] }
  'timers:dismiss': { args: []; result: void }
  /** The bubble was clicked during an alert: dismiss it and show its timer in the panel. */
  'timers:open': { args: []; result: void }
  /** Open the panel on a pet's drop locations (from the merchant window). */
  'panel:showPet': { args: [pet: number]; result: void }
  /** The DPS meter: the fight as it stands. */
  'meter:get': { args: []; result: MeterData }
  /** Start the fight over: no target, no damage. */
  'meter:reset': { args: []; result: void }
  /** One target's breakdown by skill (A2Tools DPS Meter's TargetDetailsResponse). */
  /** Your own skills on the meter's target (the skills window). */
  'skills:get': { args: []; result: PersonalView }
  /** Every overlay off, or back on (Alt+Shift+E): true when off; and whether they are off now. */
  'overlays:toggle': { args: []; result: boolean }
  'overlays:hidden': { args: []; result: boolean }
  /** The engine's recordings of the game's traffic: the list, start or stop, and their folder. */
  'recordings:get': { args: []; result: Recordings }
  'storage:get': { args: []; result: StorageUsage }
  /** Every Abyss Points gain kept (90 days), oldest first: what each PvP kill earned. */
  'abyss:gains': { args: []; result: AbyssGain[] }
  /** Every rank points change kept (90 days), oldest first. */
  'rank:changes': { args: []; result: RankChange[] }
  'storage:clear': { args: [id: StorageId]; result: StorageUsage }
  'recordings:set': { args: [on: boolean]; result: void }
  'recordings:open': { args: []; result: void }
  /** The packet log (Settings → Developer): its state, start or stop, a mark, its file shown. */
  'packets:get': { args: []; result: PacketLog }
  'packets:set': { args: [on: boolean]; result: void }
  'packets:mark': { args: [text: string]; result: void }
  'packets:show': { args: []; result: void }
  /** Choose an mp3 for an alert's sound: it is copied into the data folder. */
  'sounds:pickCustom': { args: [slot: SoundSlot]; result: CustomSoundResult }
  /** That mp3's bytes, to play (null: none chosen). */
  'sounds:custom': { args: [slot: SoundSlot]; result: Uint8Array | null }
  /** App updates, by hand: the state, look for one, download it, restart to install it. */
  'update:get': { args: []; result: UpdateState }
  /** The newest release's version, nothing downloaded (the Updates page opened). */
  'update:peek': { args: []; result: void }
  'update:check': { args: []; result: void }
  'update:download': { args: []; result: void }
  'update:install': { args: []; result: void }
  /** Training dummy runs: the runs and the one going on; start, stop, a new group, delete. */
  'dummy:get': { args: []; result: DummyState }
  /** Start a run (the settings' goal), named or the next "Run N"; stop it, saved or dropped. */
  'dummy:start': { args: [name?: string]; result: void }
  'dummy:stop': { args: [save: boolean]; result: void }
  'dummy:newGroup': { args: []; result: void }
  'dummy:delete': { args: [id: string]; result: void }
  /** Your buffs and debuffs (the buffs overlay). */
  'buffs:get': { args: []; result: Buff[] }
  /** Open the Details window on a fight (a meter row, a saved fight), or what it shows now. */
  'details:open': { args: [source: DetailsSource]; result: void }
  'details:get': { args: []; result: DetailsView | null }
  /** A fight's breakdown for a page of the panel (History opens it in place, not in the Details window). */
  'details:view': { args: [source: DetailsSource]; result: DetailsView | null }
  'details:close': { args: []; result: void }
  'details:moveTo': { args: [to: Point]; result: void }
  'details:dragEnd': { args: []; result: void }
  /** The saved boss fights, newest first; and deleting one. */
  'history:list': { args: []; result: FightSummary[] }
  /** Each character's personal bests, each dungeon boss (the engine's). */
  'history:bests': { args: []; result: Encounter[] }
  'history:delete': { args: [id: string]; result: void }
  /** The Lokthar sync: check the address and token; the last attempt's outcome. */
  'lokthar:test': { args: []; result: SyncResult }
  'lokthar:sync': { args: []; result: SyncResult }
  'lokthar:last': { args: []; result: SyncResult | null }
}

/** Main → renderer, broadcast. */
export interface EventChannels {
  'settings:changed': Settings
  'tracker:status': TrackerStatus
  'tracker:pets': Pet[]
  'tracker:pet': Pet
  'tracker:soul': SoulToast
  'tracker:nearby': Nearby
  /** The Hidden Cubes in view, whenever they change. */
  'tracker:cubes': Cube[]
  'tracker:enemies': Enemy[]
  'tracker:aggro': AggroMob[]
  'tracker:target': TargetPlayer | null
  /** You killed something (at most every 5 s): keeps the HUD up between souls. */
  'tracker:combat': number
  /** The merchant's stock: the latest of each tab opened, until its restock. */
  'tracker:shop': ShopStock[]
  /** This session's Kina, whenever the balance changes. */
  'tracker:kina': KinaSession
  /** This session's Abyss Points, at each total the game sends. */
  'tracker:abyss': AbyssSession
  /** The rift farms (shared/abyss.ts), newest first, whenever a gain changes them. */
  'tracker:rifts': RiftFarm[]
  /** Every rank points change kept, as one comes. */
  'tracker:rank': RankChange[]
  /** The whole PvP log (a window opening, or a Clear); then each kill as it comes. */
  'tracker:pvp': PvpKill[]
  'tracker:pvpSummary': PvpSummary
  'tracker:pvpKill': PvpKill
  /** The field bosses, whenever the map's list changes them. */
  'tracker:fieldBosses': FieldBosses
  /** The search for the game's map, when it changes. */
  'gamemap:preview': boolean
  'gamemap:state': GameMapState
  /** Your characters, whenever one changes. */
  'characters:changed': Characters
  'sessions:changed': Sessions
  'inventory:changed': Inventories
  'duty:changed': DutyState
  'expeditions:changed': Expeditions
  'inventory:arrival': Arrival
  /** The join requests, whenever one comes, goes or the list clears. */
  'applicants:changed': Applicants
  'party:changed': Party
  'flight:changed': FlightPower | null
  'gather:changed': GatherForecast | null
  'market:changed': MarketPrices
  /** A timer started alerting (once per start: the chime). */
  'timers:alert': TimerAlert
  /** Every timer alerting now (the bubble shakes while there are any). */
  'timers:alerting': TimerAlert[]
  /** To the panel: show this pet's drop locations. */
  'panel:showPet': number
  /** To the panel: show the Event Alerts and Field Bosses pages and highlight these timers (the ones that alerted). */
  'panel:showTimers': TimerId[]
  /** To the panel: show the Characters page. */
  'panel:showCharacters': null
  'hud:editing': boolean
  'panel:visible': boolean
  /** The dashboard was maximised (true) or restored. */
  'panel:maximized': boolean
  /** The fight, as the engine last reported it (checked 5 times a second, sent on change). */
  'meter:dps': MeterData
  /** The Details window was pointed at another fight. */
  'details:source': DetailsSource
  /** Boss fights were saved or deleted. */
  'history:changed': number
  /** A personal best just beaten (its fight saved). */
  'meter:personalBest': NewBest
  /** What is on your character, whenever it changes (while the buffs overlay is on). */
  'buffs:list': Buff[]
  /** An update check or download moved on. */
  'update:state': UpdateState
  /** The training dummy runs changed, or the one going on moved. */
  'dummy:state': DummyState
  /** A recording started or stopped. */
  'recordings:changed': Recordings
  /** The packet log started, stopped or was marked. */
  'packets:state': PacketLog
  /** The overlays were hidden by hand (true) or shown again. */
  'overlays:hidden': boolean
}

export type InvokeChannel = keyof InvokeChannels
export type EventChannel = keyof EventChannels
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result']
export type EventPayload<C extends EventChannel> = EventChannels[C]

/** What preload exposes as `window.a2t`. */
export interface Bridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void
}

export const INVOKE_CHANNELS: readonly InvokeChannel[] = [
  'inventory:arrivals',
  'app:info', 'app:quit', 'app:openPath',
  'settings:all', 'settings:set',
  'tracker:get', 'gamemap:pick', 'gamemap:setRegion', 'gamemap:report', 'gamemap:requestPreview', 'gamemap:get', 'gamemap:log', 'gamemap:openLog', 'gamemap:restart', 'gamemap:detail', 'gamemap:saveFeatures', 'gamemap:display', 'gamemap:grab', 'characters:get', 'sessions:get', 'inventory:get', 'duty:get', 'market:get', 'history:you', 'expeditions:get', 'merchant:seen', 'duty:close', 'duty:screenLearned', 'duty:learnScreen', 'duty:forgetScreen', 'items:details', 'characters:refresh', 'characters:forget', 'tracker:setSouls', 'tracker:setName', 'tracker:restart', 'tracker:resetSession', 'tracker:clearPvp',
  'killfeed:open', 'killfeed:close', 
  
  'panel:open', 'panel:characters',
  'bubble:moveTo', 'bubble:dragEnd', 'panel:toggle', 'panel:hide', 'panel:arranging', 'panel:arrange', 'panel:minimize', 'panel:maximize',
  'hud:setEditing', 
  'merchant:close', 'merchant:bought', 'panel:showPet', 'timers:get', 'timers:dismiss', 'timers:open',
  'lokthar:test', 'lokthar:sync', 'lokthar:last',
  'meter:get', 'meter:reset', 
  
  'skills:get', 
  'buffs:get', 'applicants:get', 'gather:get', 'flight:get', 'party:get', 'overlay:moveTo', 'overlay:dragEnd', 'overlay:resize', 'overlay:resetPosition', 'applicants:dismiss', 'applicants:clear', 'overlays:toggle', 'overlays:hidden', 'recordings:get', 'recordings:set', 'storage:get', 'storage:clear', 'abyss:gains', 'rank:changes', 'recordings:open', 'packets:get', 'packets:set', 'packets:mark', 'packets:show', 'sounds:pickCustom', 'sounds:custom', 'update:get', 'update:peek', 'update:check', 'update:download', 'update:install', 'dummy:get', 'dummy:start', 'dummy:stop', 'dummy:newGroup', 'dummy:delete',
  'details:open', 'details:get', 'details:view', 'details:close', 'details:moveTo', 'details:dragEnd', 'history:list', 'history:bests', 'history:delete',
]

export const EVENT_CHANNELS: readonly EventChannel[] = [
  'inventory:arrival',
  'settings:changed', 'tracker:status', 'tracker:pets', 'tracker:pet', 'tracker:soul', 'tracker:nearby', 'tracker:cubes', 'tracker:enemies', 'tracker:aggro', 'applicants:changed', 'party:changed', 'gather:changed', 'flight:changed', 'tracker:target', 'tracker:combat', 'tracker:shop', 'tracker:kina', 'tracker:abyss', 'tracker:rifts', 'tracker:rank', 'tracker:fieldBosses', 'sessions:changed', 'inventory:changed', 'duty:changed', 'market:changed', 'expeditions:changed', 'characters:changed', 'gamemap:preview', 'gamemap:state', 'tracker:pvp', 'tracker:pvpSummary', 'tracker:pvpKill', 'panel:showPet', 'panel:showTimers', 'panel:showCharacters', 'timers:alert', 'timers:alerting', 'hud:editing', 'panel:visible', 'panel:maximized', 'meter:dps', 'details:source', 'history:changed', 'meter:personalBest', 'buffs:list', 'overlays:hidden', 'recordings:changed', 'packets:state', 'dummy:state', 'update:state', ]
