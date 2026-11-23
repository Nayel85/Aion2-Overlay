/**
 * Persisted settings: typed, with defaults, and normalised at the IPC boundary so a hand-edited
 * file or a renderer bug can never store something the app then trips over.
 */

import { APPLICANTS_HIDE } from './applicants.ts'
import { BOSS_RUNS, DEFAULT_LOW_PRIORITY } from './bossRuns.ts'
import type { Lang } from './i18n.ts'
import { DUMMY_DAMAGE_GOALS, DUMMY_LIMITS, type DummyGoal } from './dummy.ts'
import { isSound, type SoundId } from './sounds.ts'
import { TARGET_MODES, type MeterPlayers, type MeterStat, type TargetMode } from './meter.ts'
import { defaultShown, leadChoices, REGIONS, TIMERS, type Region, type TimerId } from './timers.ts'

export interface Point {
  x: number
  y: number
}

/** A part of the screen, in DIPs. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The most pets pinned at once: past it, a pin is refused (a bound for the saved list, not a
 * limit anyone farms into). */
export const MAX_PINNED = 250
/** The pinned pets the HUD lists: the rest are counted on a line below them. */
export const HUD_PINNED_ROWS = 15
/** The DPS meter's size limits, dragged by its corner: width and height, in DIPs. */
export const METER_WIDTH = [260, 900] as const
export const METER_HEIGHT = [120, 1200] as const
/** The map overlay's: its width, and its map's height. */
export const MINIMAP_WIDTH = [160, 900] as const
export const MINIMAP_HEIGHT = [120, 900] as const
/** The kill feed's size, dragged from its corner (never narrower than its title bar). */
export const KILLFEED_WIDTH = [240, 900] as const
export const KILLFEED_HEIGHT = [60, 900] as const
/** Boss Runs' size, as a scale of its 260 px: its corner drags it bigger, text and all. */
export const BOSSRUNS_SCALE = [0.75, 2.5] as const

/** Party frames: the HP as text on a bar. */
export const PARTY_HP_TEXT = ['none', 'percent', 'value'] as const
export type PartyHpText = (typeof PARTY_HP_TEXT)[number]
/** Party frames: what turns a bar to the afflicted colour: any monster's debuff, or one taking control. */
export const PARTY_AFFLICTED_BY = ['any', 'control'] as const
export type PartyAfflictedBy = (typeof PARTY_AFFLICTED_BY)[number]
/** Party frames: a red HP bar, green while afflicted. */
export const PARTY_DEFAULT_COLORS = { hp: '#c0392b', afflicted: '#2ea043' } as const

export interface Settings {
  /** Where the floating icon sits, in screen DIPs; null = bottom right of the primary display. */
  bubble: Point | null
  /** The dashboard's size, and where it was left (null = the middle of the primary display). */
  panel: { width: number; height: number }
  panelPosition: Point | null
  /** Keep the panel above the game while it is open. */
  panelOnTop: boolean
  /** Minimise the panel when you click from it into the game, as a click outside closes a modal. */
  panelHideOnGame: boolean
  /** Times on a 24-hour clock (15:30) rather than the language's own (3:30 PM in English). */
  clock24: boolean

  hud: {
    enabled: boolean
    /** Top-left in screen DIPs; null = top right of the primary display. */
    position: Point | null
    /** 'recent': pets that gained souls this session; 'pinned': the pets pinned in the panel. */
    mode: 'recent' | 'pinned'
    /** The Nearby section at the top: soul monsters around you, by the pet they drop. */
    nearby: boolean
    /** How many pets the Nearby section lists. */
    nearbyCount: number
    pinned: number[]
    /** How many recent pets 'recent' shows. */
    recentCount: number
    toasts: boolean
    opacity: number
    scale: number
    /** Hide the HUD when no game traffic has been seen for a while. */
    hideWithoutGame: boolean
    /**
     * Seconds without a kill, soul or crystal before the HUD clears itself and hides until the
     * next fight; 0 = never.
     */
    idleHideSeconds: number
    /** Pop up the Black Cloud Merchant's pets worth buying when one of its tabs is opened. */
    merchant: boolean
    /** This session's Kina per hour, at the top right. */
    kina: boolean
    /** This session's Abyss Points per hour, beside the Kina. */
    abyss: boolean
    /** Hidden Cubes in view at the top, with how far and which way. */
    cubes: boolean
    /** A sound when a Hidden Cube comes into view. */
    cubeSound: boolean
    /** Which one (shared/sounds.ts), and how loud (0-1). */
    cubeSoundId: SoundId
    cubeVolume: number
    /** The name of your own mp3, once one is chosen (the file is in the data folder). */
    cubeCustomName: string | null
  }

  /** The map overlay: your zone around you, your tracked pets' spawns and the Hidden Cubes. */
  /** `size` is its width; `height` the map's, dragged by the corner (null: square). */
  minimap: { enabled: boolean; position: Point | null; size: number; height: number | null; opacity: number; zoom: number; collapsed: boolean; gatherables: boolean }

  /** The Map page's switches, kept as they were left: what it shows besides the tracked pets. */
  mapPage: { needed: boolean; cubes: boolean; gatherables: boolean; hiddenPets: number[] }

  /**
   * Markers on the game's own map (Map page → "On the game's map"): the part of the screen where
   * you keep the game's map open, and what to draw on it once it is found there.
   */
  gameMap: {
    enabled: boolean
    /** In screen DIPs; null until picked. */
    region: Rect | null
    gatherables: boolean
    pets: boolean
    cubes: boolean
    enemies: boolean
    /** A border around the part of the screen watched, to see that it lies on the game's map. */
    showArea: boolean
  }

  /** Gatherables pinned on the Gatherables page: the maps show only these (all of them while none is). */
  gatherables: { pinned: string[] }

  /** Where the Black Cloud Merchant window sits (top-left, screen DIPs); null = top centre. */
  merchantWindow: Point | null
  /** Where the Details window (a fight's breakdown) sits; null = the middle of the screen. */
  detailsWindow: Point | null

  /** The timers' countdown bar over the game: on, where (null = top centre), how opaque. */
  /** `layout`: a bar of icons and countdowns, or a list, a timer a line with its name. */
  timerBar: { enabled: boolean; position: Point | null; opacity: number; layout: 'bar' | 'list' }

  /**
   * Boss Runs (shared/bossRuns.ts): Verteron's field bosses about to spawn, with their Kibelisk,
   * up by itself when more than 2 spawn close together. How far ahead it looks (minutes), how
   * many it lists, minimized to its header, its size (a scale of its 260 px), how many alive at
   * once bring it up too (0: never), the bosses of low priority (list ids), and whether those are
   * left out of that count.
   */
  /** Join requests to your party: a widget that comes up when someone applies. */
  applicants: { enabled: boolean; position: Point | null; opacity: number; collapsed: boolean; /** Seconds it stays after the last application. */ hideAfter: number }
  /**
   * Party frames: a bar per member over the game, while in a party. `self`: you among them; `header`: a
   * title bar; `hpText` on the bar's right; `afflictedColor` while a monster's debuff (`afflictedBy`:
   * any, or one taking control) is on them; `debuffIcons` under the bar. Sizes in px.
   */
  party: {
    enabled: boolean
    position: Point | null
    opacity: number
    collapsed: boolean
    self: boolean
    header: boolean
    icon: boolean
    hpText: PartyHpText
    debuffIcons: boolean
    /** A shield's mark on a member's bar while one is on them. */
    shields: boolean
    /** A mark on the member a boss is on (the last it hit). */
    bossTarget: boolean
    width: number
    barHeight: number
    gap: number
    fontSize: number
    hpColor: string
    afflictedColor: string
    afflictedBy: PartyAfflictedBy
  }
  /**
   * The gathering outcome: a pill as a gathering starts, saying how it will end. Which to show
   * (`fail`, `rare`: rank up or x2, `plain`), its size (`scale`), a sound for some.
   */
  gather: {
    enabled: boolean
    /**
     * A ring as the flight timer's (the item inside, running down to the result), a pill with words,
     * or the game's two gauges filling roll by roll (a craft's shows as the ring).
     */
    style: 'pill' | 'ring' | 'gauges'
    position: Point | null
    opacity: number
    scale: number
    icon: boolean
    fail: boolean
    rare: boolean
    plain: boolean
    /** Crafts too: their proc (the better item), and the plain ones with `plain`. */
    crafts: boolean
    soundFail: boolean
    soundRare: boolean
    soundId: SoundId
    volume: number
  }
  /** The flight timer: seconds of flight left, while flying or refilling. */
  flight: { enabled: boolean; position: Point | null; opacity: number }
  bossRuns: { enabled: boolean; position: Point | null; opacity: number; windowMinutes: number; rows: number; collapsed: boolean; scale: number; aliveMin: number; ignoreLow: boolean; lowPriority: number[] }

  /**
   * The Unified HUD (pages/UnifiedPage.vue): one small bar at the top of the game that unfolds on
   * hover and shows things as they matter. `position` is its top centre (it grows both ways from
   * there; null = the top centre of the primary display). `buttons`: the overlays' buttons always,
   * or only while hovered. The minutes and seconds are how long each thing stays after its last
   * news. `runsPinned`: Boss Runs kept open under the bar. `replace`: Enemies nearby and the Boss
   * Runs list stay closed while it is on (the timer bar is not: the HUD shows only two events).
   */
  unified: {
    enabled: boolean
    position: Point | null
    opacity: number
    scale: number
    buttons: 'hover' | 'always'
    events: boolean
    countdownMinutes: number
    ping: boolean
    target: boolean
    targetSeconds: number
    /** Where your target shows: 'strip' two lines under the bar, 'inline' one short segment in the bar itself (nothing is covered under it). */
    targetStyle: 'strip' | 'inline'
    /** What the meter follows while it is on: 'always' your last hit, 'players' your last hit while a player is selected, 'meter' as the meter is set. */
    targetMode: 'always' | 'players' | 'meter'
    /** Kina per hour, and Abyss Points per hour, to the left of the bar while they come in (off by default). */
    kina: boolean
    abyssRate: boolean
    /** The Abyss Points of the season going on (coin icon): it ends after 15 minutes without any. */
    season: boolean
    earningsMinutes: number
    rift: boolean
    cubes: boolean
    death: boolean
    deathMinutes: number
    enemies: boolean
    bosses: boolean
    guild: boolean
    clock: boolean
    odyle: boolean
    runsPinned: boolean
    replace: boolean
  }

  /** Every alert's sound off (the Unified HUD's speaker): cubes, enemies, the timers' chime. */
  muted: boolean

  /** The kill feed over the game: open (from the PvP page), and where (null = top right). */
  /**
   * The kill feed overlay; `opacity` is its background's (0: none, the text glows on the game); `target`: your target under it;
   * `width` and `height` as dragged from its corner (null: sized to what it shows).
   */
  killFeed: { open: boolean; position: Point | null; opacity: number; collapsed: boolean; target: boolean; width: number | null; height: number | null }
  /**
   * The Enemies overlay: players of the other faction in view, and a sound when one comes. Its
   * background's opacity (0: none), minimized, and its sound: on, which (shared/sounds.ts), how
   * loud (0-1), your own mp3's name.
   */
  enemies: {
    enabled: boolean
    position: Point | null
    opacity: number
    collapsed: boolean
    /** Their pins on the map overlay. */
    mapPins: boolean
    /** Each one's gear score (item level) and combat power, when their card was read. */
    gearScore: boolean
    combatPower: boolean
    sound: boolean
    /** The sound only for enemies with their PvP on. */
    pvpOnly: boolean
    soundId: SoundId
    volume: number
    customName: string | null
  }

  /**
   * Your buffs and debuffs over the game: each one's icon, stacks and time left (A2Tools DPS
   * Meter's buff timeline). Icons `size` px, `perRow` to a row; debuffs on a row of their own.
   * `cc`: the CC / Debuffs panel, a banner mid-screen while you are stunned, rooted, knocked down...
   * (with the monsters' other debuffs on you under it, `ccDebuffs`); where it sits, `ccPosition`.
   */
  buffs: {
    enabled: boolean
    position: Point | null
    opacity: number
    size: number
    perRow: number
    debuffs: boolean
    passives: boolean
    /** Scrolls, food and drinks: long buffs from items, hidden unless wanted. */
    consumables: boolean
    cc: boolean
    ccPosition: Point | null
    ccDebuffs: boolean
  }

  /**
   * Training dummy runs: their goal (a time limit, or damage), whether a run starts by itself with
   * your first hit on a dummy (and its clock with it), and the Training overlay over the game.
   */
  dummy: { overlay: boolean; position: Point | null; autoStart: boolean; goal: DummyGoal; limitMs: number | null; damageGoal: number; collapsed: boolean }

  /** Your own skills on the meter's target, as a window of their own. */
  skills: { enabled: boolean; position: Point | null; rows: number; opacity: number }

  /** The DPS meter: its own window, fed by the engine (A2Tools DPS Meter's parser). */
  meter: {
    enabled: boolean
    /** Top-left in screen DIPs; null = left of the primary display. */
    position: Point | null
    /** Which target it follows. */
    targetMode: TargetMode
    /** Which players it lists, and what it ranks them by. */
    players: MeterPlayers
    stat: MeterStat
    /** How many players it lists. */
    rows: number
    opacity: number
    /** Shrunk to its title line (the minimize button). */
    collapsed: boolean
    /** Its size, dragged by its corner: the width, and the height (null: as tall as its rows). */
    width: number
    height: number | null
    /** Hidden while no damage (or healing, or damage taken) has come in for `idleSeconds`. */
    hideIdle: boolean
    idleSeconds: number
    /** Each player's combat power: hidden, in a column of its own ('beside'), or in small type under the name. */
    power: 'off' | 'beside' | 'below'
    /** Each player's item level (gear score): the same places. */
    gear: 'off' | 'beside' | 'below'
    /** Each player's deaths, in a column of its own. */
    deaths: boolean
    /** The rows' look: 'flat' (bars), 'compact' (small pills with gradient) or 'bold' (big pills, big icons). */
    style: 'flat' | 'compact' | 'bold'
    /** Only the DPS bars, with no background, until the pointer is over the meter (then all of it). */
    barsOnly: boolean
    /** The bars' background, 0 (none) to 1, while it shows bars only. */
    barsBackground: number
  }

  /** Hide every overlay window from screenshots, OBS and Discord (WDA_EXCLUDEFROMCAPTURE). */
  hideFromCapture: boolean

  /** Which one-time layout updates were applied to these settings (main/settings.ts `applyLayoutUpdates`). */
  layoutVersion: number

  /** The app's language (shared/i18n.ts): Spanish unless changed. */
  language: Lang

  /** Your side: its zones are listed first where a soul drops. */
  faction: 'elyos' | 'asmodians'
  /** Your level, to point out monsters close enough to it for souls to drop well; null = unset. */
  playerLevel: number | null

  /** Event Alerts and Field Bosses: which events alert, and how (a chime; the bubble shaking). */
  timers: {
    /** The server region: weekly events are at its own local time. */
    region: Region
    enabled: Record<TimerId, boolean>
    /** Minutes before each start to alert. */
    lead: Record<TimerId, number>
    sound: boolean
    /** 0..1 */
    volume: number
    shake: boolean
    /** Listed in the Event Alerts and Field Bosses pages; only these alert. */
    shown: Record<TimerId, boolean>
  }

  /** Leave pets at the cap (Lv3: no more souls) out of the collection, Nearby and the HUD. */
  hideMaxed: boolean

  /**
   * While Aion 2 is not running: no bubble, no HUD, no capture, only the tray icon. Everything
   * comes back when the game starts.
   */
  sleepWithoutGame: boolean

  /**
   * Hide every overlay while another program is in front (an alt-tab to Discord), and show them
   * again when the game is. The overlay's own panel, clicked into, counts as the game.
   */
  hideWhenGameAway: boolean

  /**
   * Sync the field bosses to the Lokthar site's timers (main/lokthar.ts): off until turned on with
   * a token. Besides the update check (Settings → Updates, by hand), NCSoft's character pages and
   * the guild events below, the only requests the app makes: to `url` alone.
   */
  lokthar: {
    sync: boolean
    /** The site, e.g. https://lokthar.com: https only (http for localhost, to test against a dev server). */
    url: string
    /** From the site: bin/rails 'overlay:token[you]'. */
    token: string
  }

  /**
   * Guild events from the Lokthar site (main/guildEvents.ts, at lokthar.url): the events that ask
   * who comes, answered here; on, it sends the site your characters' names and servers to know you
   * by (and main/guild.ts their class, level, gear score, combat power and Odyle energy). Off by
   * default in Nayel Overlay: nothing goes to the site unless you turn it on. `popup`: an event to
   * answer pops up over the game, bottom right.
   */
  guildEvents: { enabled: boolean; popup: boolean }

  tracker: {
    /** The collection file; empty = <userData>/collection.json. */
    dataFile: string
    /** Scan unknown game messages for possible field-boss data and log matches. */
    bossDiagnostics: boolean
  }
}

export type SettingKey = keyof Settings

/**
 * The owner's own settings (2026-11-22) as the defaults: this fork's windows where they put them
 * (its screens), its Unified HUD, timers and meter columns.
 */
export const SETTINGS_DEFAULTS: Settings = {
  bubble: { x: 2636, y: 938 },
  panel: { width: 1411, height: 898 },
  panelPosition: { x: -1585, y: 155 },
  panelOnTop: true,
  panelHideOnGame: false,
  clock24: true,
  hud: { enabled: true, position: { x: 1758, y: 39 }, mode: 'pinned', nearby: true, nearbyCount: 3, pinned: [], recentCount: 3, toasts: true, opacity: 0.92, scale: 1, hideWithoutGame: true, idleHideSeconds: 45, merchant: true, kina: true, abyss: true, cubes: false, cubeSound: true, cubeSoundId: 'chime', cubeVolume: 0.6, cubeCustomName: null },
  minimap: { enabled: false, position: { x: 2098, y: 722 }, size: 260, height: null, opacity: 0.92, zoom: 13.5, collapsed: false, gatherables: false },
  mapPage: { needed: false, cubes: false, gatherables: true, hiddenPets: [] },
  gatherables: { pinned: [] },
  gameMap: { enabled: false, region: null, gatherables: true, pets: true, cubes: true, enemies: true, showArea: false },
  merchantWindow: { x: 342, y: 859 },
  detailsWindow: { x: 449, y: 251 },
  timerBar: { enabled: true, position: { x: 859, y: 141 }, opacity: 0.92, layout: 'list' },
  unified: { enabled: true, position: { x: 1334, y: 0 }, opacity: 0.94, scale: 1, buttons: 'hover', events: false, countdownMinutes: 10, ping: true, target: true, targetSeconds: 8, targetStyle: 'inline', targetMode: 'always', kina: true, abyssRate: true, season: true, earningsMinutes: 10, rift: true, cubes: false, death: true, deathMinutes: 10, enemies: true, bosses: false, guild: false, clock: true, odyle: true, runsPinned: false, replace: false },
  muted: false,
  applicants: { enabled: true, position: null, opacity: 0.85, collapsed: false, hideAfter: 60 },
  party: {
    enabled: true, position: null, opacity: 1, collapsed: false, self: true, header: false, icon: true, hpText: 'none', debuffIcons: false, shields: true, bossTarget: true,
    width: 180, barHeight: 22, gap: 2, fontSize: 12, hpColor: PARTY_DEFAULT_COLORS.hp, afflictedColor: PARTY_DEFAULT_COLORS.afflicted, afflictedBy: 'any',
  },
  flight: { enabled: true, position: null, opacity: 1 },
  gather: {
    enabled: true, style: 'ring', position: null, opacity: 1, scale: 1, icon: true, fail: true, rare: true, plain: false, crafts: true,
    soundFail: false, soundRare: false, soundId: 'bell', volume: 0.6,
  },
  bossRuns: { enabled: false, position: { x: 1890, y: 30 }, opacity: 0.85, windowMinutes: 15, rows: 4, collapsed: false, scale: 1, aliveMin: 0, ignoreLow: true, lowPriority: [101001, 101002, 101006, 101007, 101019, 101017, 101005, 101004, 101003, 101015, 101010, 101008, 101009, 101016, 101012, 101014, 101020, 101013, 101011, 101018] },
  killFeed: { open: false, position: null, opacity: 0.9, collapsed: false, target: true, width: null, height: null },
  enemies: { enabled: false, position: null, opacity: 0.75, collapsed: false, mapPins: true, gearScore: true, combatPower: true, sound: true, pvpOnly: true, soundId: 'enemy-spotted', volume: 0.7, customName: null },
  skills: { enabled: false, position: { x: 500, y: 413 }, rows: 6, opacity: 0.92 },
  dummy: { overlay: false, position: null, autoStart: true, goal: 'time', limitMs: 60000, damageGoal: 10000000, collapsed: false },
  buffs: { enabled: false, position: { x: 1178, y: 800 }, opacity: 0.92, size: 34, perRow: 10, debuffs: true, passives: false, consumables: false, cc: true, ccPosition: { x: 1145, y: 359 }, ccDebuffs: false },
  meter: { enabled: true, position: { x: 410, y: 206 }, targetMode: 'bossTargets', players: 'party', stat: 'damage', rows: 8, opacity: 0.92, collapsed: false, width: 340, height: null, hideIdle: false, idleSeconds: 15, power: 'beside', gear: 'beside', deaths: true, style: 'compact', barsOnly: false, barsBackground: 0.6 },
  hideFromCapture: false,
  layoutVersion: 1,
  language: 'en',
  faction: 'elyos',
  playerLevel: 45,
  hideMaxed: true,
  timers: {
    region: 'europe',
    enabled: Object.fromEntries(TIMERS.map((t) => [t.id, ['shugo', 'rift', 'nahma', 'gartua', 'fb-101022', 'fb-101023', 'fb-101024', 'fb-2002'].includes(t.id)])) as Record<TimerId, boolean>,
    lead: { ...Object.fromEntries(TIMERS.map((t) => [t.id, t.lead])), shugo: 3, merchant: 0, rift: 5, invasion: 3, kaira: 10, siege: 10, siegeBosses: 5, nahma: 10, gartua: 10, dailyReset: 0, weeklyReset: 0, 'fb-101001': 5, 'fb-101002': 5, 'fb-101003': 5, 'fb-101004': 5, 'fb-101005': 5, 'fb-101006': 5, 'fb-101007': 5, 'fb-101008': 5, 'fb-101009': 5, 'fb-101010': 5, 'fb-101011': 5, 'fb-101012': 5, 'fb-101013': 5, 'fb-101014': 5, 'fb-101015': 5, 'fb-101016': 5, 'fb-101017': 5, 'fb-101018': 5, 'fb-101019': 5, 'fb-101020': 5, 'fb-101022': 10, 'fb-101023': 10, 'fb-101024': 10, 'fb-111001': 5, 'fb-111002': 5, 'fb-111003': 5, 'fb-111004': 5, 'fb-111005': 5, 'fb-111006': 5, 'fb-111007': 5, 'fb-111008': 5, 'fb-111009': 5, 'fb-111010': 5, 'fb-111011': 5, 'fb-111012': 5, 'fb-111013': 5, 'fb-111014': 5, 'fb-111015': 5, 'fb-111016': 5, 'fb-111017': 5, 'fb-111018': 5, 'fb-111019': 5, 'fb-111020': 5, 'fb-111021': 5, 'fb-111022': 5, 'fb-111023': 5, 'fb-111024': 5, 'fb-2001': 5, 'fb-2002': 10, 'fb-2003': 5, 'fb-2004': 5, 'fb-2005': 5, 'fb-2006': 5, 'fb-2007': 5, 'fb-2008': 5 } as Record<TimerId, number>,
    sound: true,
    volume: 0.5,
    shake: true,
    shown: { ...Object.fromEntries(TIMERS.map((t) => [t.id, defaultShown(t)])), shugo: true, merchant: true, rift: true, invasion: true, kaira: true, siege: true, siegeBosses: true, nahma: true, gartua: true, dailyReset: true, weeklyReset: true, 'fb-101001': false, 'fb-101002': false, 'fb-101003': false, 'fb-101004': false, 'fb-101005': false, 'fb-101006': false, 'fb-101007': false, 'fb-101008': false, 'fb-101009': false, 'fb-101010': false, 'fb-101011': false, 'fb-101012': false, 'fb-101013': false, 'fb-101014': false, 'fb-101015': false, 'fb-101016': false, 'fb-101017': false, 'fb-101018': false, 'fb-101019': false, 'fb-101020': false, 'fb-101022': true, 'fb-101023': true, 'fb-101024': true, 'fb-111001': false, 'fb-111002': false, 'fb-111003': false, 'fb-111004': false, 'fb-111005': false, 'fb-111006': false, 'fb-111007': false, 'fb-111008': false, 'fb-111009': false, 'fb-111010': false, 'fb-111011': false, 'fb-111012': false, 'fb-111013': false, 'fb-111014': false, 'fb-111015': false, 'fb-111016': false, 'fb-111017': false, 'fb-111018': false, 'fb-111019': false, 'fb-111020': false, 'fb-111021': false, 'fb-111022': false, 'fb-111023': false, 'fb-111024': false, 'fb-2001': false, 'fb-2002': true, 'fb-2003': false, 'fb-2004': false, 'fb-2005': false, 'fb-2006': false, 'fb-2007': false, 'fb-2008': false } as Record<TimerId, boolean>,
  },
  sleepWithoutGame: true,
  hideWhenGameAway: true,
  lokthar: { sync: false, url: 'https://lokthar.com', token: '' },
  guildEvents: { enabled: false, popup: false },
  tracker: { dataFile: '', bossDiagnostics: false },
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
/** A colour as `#rrggbb`. */
const colour = (v: unknown, fallback: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback)

const point = (v: unknown): Point | null => {
  const p = v as Partial<Point> | null
  return p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? { x: Math.round(p.x), y: Math.round(p.y) }
    : null
}

const rect = (v: unknown): Rect | null => {
  const r = v as Partial<Rect> | null
  const ok = r && [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n)) && r.width! >= 40 && r.height! >= 40
  return ok ? { x: Math.round(r.x!), y: Math.round(r.y!), width: Math.round(r.width!), height: Math.round(r.height!) } : null
}

/** Coerce one setting to a valid value, falling back to the default for anything malformed. */
export function normalise<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  const d = SETTINGS_DEFAULTS
  switch (key) {
    case 'bubble':
    case 'merchantWindow':
    case 'detailsWindow':
    case 'panelPosition':
      return point(value) as Settings[K]
    case 'panel': {
      const v = (value ?? {}) as Partial<Settings['panel']>
      return { width: num(v.width, 900, 3840, d.panel.width), height: num(v.height, 600, 2160, d.panel.height) } as Settings[K]
    }
    case 'panelOnTop':
    case 'panelHideOnGame':
    case 'clock24':
    case 'hideFromCapture':
    case 'hideMaxed':
    case 'sleepWithoutGame':
    case 'hideWhenGameAway':
    case 'muted':
      return bool(value, d[key] as boolean) as Settings[K]
    case 'hud': {
      const v = (value ?? {}) as Partial<Settings['hud']>
      return {
        enabled: bool(v.enabled, d.hud.enabled),
        position: point(v.position),
        // 'nearby' was a mode before it became its own section (0.1.3).
        mode: v.mode === 'pinned' ? 'pinned' : 'recent',
        nearby: bool(v.nearby, d.hud.nearby),
        nearbyCount: Math.round(num(v.nearbyCount, 1, 8, d.hud.nearbyCount)),
        pinned: Array.isArray(v.pinned) ? [...new Set(v.pinned.filter((n) => Number.isInteger(n)))].slice(0, MAX_PINNED) : [],
        recentCount: Math.round(num(v.recentCount, 1, 8, d.hud.recentCount)),
        toasts: bool(v.toasts, d.hud.toasts),
        opacity: num(v.opacity, 0.3, 1, d.hud.opacity),
        scale: num(v.scale, 0.75, 1.75, d.hud.scale),
        hideWithoutGame: bool(v.hideWithoutGame, d.hud.hideWithoutGame),
        idleHideSeconds: Math.round(num(v.idleHideSeconds, 0, 600, d.hud.idleHideSeconds)),
        merchant: bool(v.merchant, d.hud.merchant),
        kina: bool(v.kina, d.hud.kina),
        abyss: bool(v.abyss, d.hud.abyss),
        cubes: bool(v.cubes, d.hud.cubes),
        cubeSound: bool(v.cubeSound, d.hud.cubeSound),
        cubeSoundId: isSound(v.cubeSoundId) ? v.cubeSoundId : d.hud.cubeSoundId,
        cubeVolume: num(v.cubeVolume, 0, 1, d.hud.cubeVolume),
        cubeCustomName: typeof v.cubeCustomName === 'string' && v.cubeCustomName ? v.cubeCustomName.slice(0, 200) : null,
      } as Settings[K]
    }
    case 'timers': {
      const v = (value ?? {}) as Partial<Settings['timers']>
      const on = (v.enabled ?? {}) as Partial<Record<TimerId, unknown>>
      const lead = (v.lead ?? {}) as Partial<Record<TimerId, unknown>>
      return {
        region: REGIONS.some((r) => r.id === v.region) ? v.region : d.timers.region,
        enabled: Object.fromEntries(TIMERS.map((t) => [t.id, bool(on[t.id], t.defaultOn)])) as Record<TimerId, boolean>,
        // One of the leads offered for that timer; anything else falls back to its default.
        lead: Object.fromEntries(
          TIMERS.map((t) => [t.id, leadChoices(t).includes(lead[t.id] as number) ? (lead[t.id] as number) : t.lead]),
        ) as Record<TimerId, number>,
        sound: bool(v.sound, d.timers.sound),
        volume: num(v.volume, 0, 1, d.timers.volume),
        shake: bool(v.shake, d.timers.shake),
        shown: Object.fromEntries(
          TIMERS.map((t) => [t.id, bool((v.shown as Partial<Record<TimerId, unknown>> | undefined)?.[t.id], defaultShown(t))]),
        ) as Record<TimerId, boolean>,
      } as Settings[K]
    }
    case 'minimap': {
      const v = (value ?? {}) as Partial<Settings['minimap']>
      return {
        enabled: bool(v.enabled, d.minimap.enabled),
        position: point(v.position),
        size: Math.round(num(v.size, MINIMAP_WIDTH[0], MINIMAP_WIDTH[1], d.minimap.size)),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, MINIMAP_HEIGHT[0], MINIMAP_HEIGHT[1], d.minimap.size)),
        opacity: num(v.opacity, 0.3, 1, d.minimap.opacity),
        zoom: num(v.zoom, 1, 40, d.minimap.zoom),
        collapsed: bool(v.collapsed, false),
        gatherables: bool(v.gatherables, d.minimap.gatherables),
      } as Settings[K]
    }
    case 'mapPage': {
      const v = (value ?? {}) as Partial<Settings['mapPage']>
      return {
        needed: bool(v.needed, d.mapPage.needed),
        cubes: bool(v.cubes, d.mapPage.cubes),
        gatherables: bool(v.gatherables, d.mapPage.gatherables),
        hiddenPets: Array.isArray(v.hiddenPets) ? [...new Set(v.hiddenPets.filter((n) => Number.isInteger(n)))].slice(0, MAX_PINNED) : [],
      } as Settings[K]
    }
    case 'gameMap': {
      const v = (value ?? {}) as Partial<Settings['gameMap']>
      return {
        enabled: bool(v.enabled, d.gameMap.enabled),
        region: rect(v.region),
        gatherables: bool(v.gatherables, d.gameMap.gatherables),
        pets: bool(v.pets, d.gameMap.pets),
        cubes: bool(v.cubes, d.gameMap.cubes),
        enemies: bool(v.enemies, d.gameMap.enemies),
        showArea: bool(v.showArea, d.gameMap.showArea),
      } as Settings[K]
    }
    case 'gatherables': {
      const v = (value ?? {}) as Partial<Settings['gatherables']>
      return {
        pinned: Array.isArray(v.pinned) ? [...new Set(v.pinned.filter((id) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)))].slice(0, 100) : [],
      } as Settings[K]
    }
    case 'timerBar': {
      const v = (value ?? {}) as Partial<Settings['timerBar']>
      return {
        enabled: bool(v.enabled, d.timerBar.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0.3, 1, d.timerBar.opacity),
        layout: v.layout === 'list' ? 'list' : 'bar',
      } as Settings[K]
    }
    case 'unified': {
      const v = (value ?? {}) as Partial<Settings['unified']>
      const u = d.unified
      return {
        enabled: bool(v.enabled, u.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, u.opacity),
        scale: num(v.scale, 0.75, 1.75, u.scale),
        buttons: v.buttons === 'always' ? 'always' : 'hover',
        events: bool(v.events, u.events),
        countdownMinutes: Math.round(num(v.countdownMinutes, 1, 60, u.countdownMinutes)),
        ping: bool(v.ping, u.ping),
        target: bool(v.target, u.target),
        targetSeconds: Math.round(num(v.targetSeconds, 3, 60, u.targetSeconds)),
        targetStyle: v.targetStyle === 'strip' ? 'strip' : 'inline',
        targetMode: v.targetMode === 'players' || v.targetMode === 'meter' ? v.targetMode : 'always',
        kina: bool(v.kina, u.kina),
        abyssRate: bool(v.abyssRate, u.abyssRate),
        season: bool(v.season, u.season),
        earningsMinutes: Math.round(num(v.earningsMinutes, 1, 60, u.earningsMinutes)),
        rift: bool(v.rift, u.rift),
        cubes: bool(v.cubes, u.cubes),
        death: bool(v.death, u.death),
        deathMinutes: Math.round(num(v.deathMinutes, 1, 60, u.deathMinutes)),
        enemies: bool(v.enemies, u.enemies),
        bosses: bool(v.bosses, u.bosses),
        guild: bool(v.guild, u.guild),
        clock: bool(v.clock, u.clock),
        odyle: bool(v.odyle, u.odyle),
        runsPinned: bool(v.runsPinned, u.runsPinned),
        replace: bool(v.replace, u.replace),
      } as Settings[K]
    }
    case 'applicants': {
      const v = (value ?? {}) as Partial<Settings['applicants']>
      return {
        enabled: bool(v.enabled, d.applicants.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, d.applicants.opacity),
        collapsed: bool(v.collapsed, false),
        hideAfter: Math.round(num(v.hideAfter, APPLICANTS_HIDE[0], APPLICANTS_HIDE[1], d.applicants.hideAfter)),
      } as Settings[K]
    }
    case 'gather': {
      const v = (value ?? {}) as Partial<Settings['gather']>
      const g = d.gather
      return {
        enabled: bool(v.enabled, g.enabled),
        style: v.style === 'pill' || v.style === 'gauges' ? v.style : 'ring',
        position: point(v.position),
        opacity: num(v.opacity, 0.2, 1, g.opacity),
        scale: num(v.scale, 0.6, 2, g.scale),
        icon: bool(v.icon, g.icon),
        fail: bool(v.fail, g.fail),
        rare: bool(v.rare, g.rare),
        plain: bool(v.plain, g.plain),
        crafts: bool(v.crafts, g.crafts),
        soundFail: bool(v.soundFail, g.soundFail),
        soundRare: bool(v.soundRare, g.soundRare),
        soundId: isSound(v.soundId) && v.soundId !== 'custom' ? v.soundId : g.soundId,
        volume: num(v.volume, 0, 1, g.volume),
      } as Settings[K]
    }
    case 'flight': {
      const v = (value ?? {}) as Partial<Settings['flight']>
      return { enabled: bool(v.enabled, d.flight.enabled), position: point(v.position), opacity: num(v.opacity, 0.2, 1, d.flight.opacity) } as Settings[K]
    }
    case 'party': {
      const v = (value ?? {}) as Partial<Settings['party']>
      return {
        enabled: bool(v.enabled, d.party.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, d.party.opacity),
        collapsed: bool(v.collapsed, false),
        self: bool(v.self, d.party.self),
        header: bool(v.header, d.party.header),
        icon: bool(v.icon, d.party.icon),
        hpText: (PARTY_HP_TEXT as readonly unknown[]).includes(v.hpText) ? v.hpText! : d.party.hpText,
        debuffIcons: bool(v.debuffIcons, d.party.debuffIcons),
        shields: bool(v.shields, d.party.shields),
        bossTarget: bool(v.bossTarget, d.party.bossTarget),
        width: Math.round(num(v.width, 100, 320, d.party.width)),
        barHeight: Math.round(num(v.barHeight, 14, 40, d.party.barHeight)),
        gap: Math.round(num(v.gap, 0, 12, d.party.gap)),
        fontSize: Math.round(num(v.fontSize, 9, 18, d.party.fontSize)),
        hpColor: colour(v.hpColor, d.party.hpColor),
        afflictedColor: colour(v.afflictedColor, d.party.afflictedColor),
        afflictedBy: (PARTY_AFFLICTED_BY as readonly unknown[]).includes(v.afflictedBy) ? v.afflictedBy! : d.party.afflictedBy,
      } as Settings[K]
    }
    case 'bossRuns': {
      const v = (value ?? {}) as Partial<Settings['bossRuns']>
      return {
        enabled: bool(v.enabled, d.bossRuns.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, d.bossRuns.opacity),
        windowMinutes: Math.round(num(v.windowMinutes, 5, 60, d.bossRuns.windowMinutes)),
        rows: Math.round(num(v.rows, 1, 10, d.bossRuns.rows)),
        collapsed: bool(v.collapsed, false),
        scale: num(v.scale, BOSSRUNS_SCALE[0], BOSSRUNS_SCALE[1], d.bossRuns.scale),
        aliveMin: Math.round(num(v.aliveMin, 0, 10, d.bossRuns.aliveMin)),
        ignoreLow: bool(v.ignoreLow, d.bossRuns.ignoreLow),
        lowPriority: Array.isArray(v.lowPriority) ? [...new Set(v.lowPriority.filter((id) => BOSS_RUNS.some((r) => r.boss === id)))] : [...d.bossRuns.lowPriority],
      } as Settings[K]
    }
    case 'enemies': {
      const v = (value ?? {}) as Partial<Settings['enemies']>
      return {
        enabled: bool(v.enabled, d.enemies.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, d.enemies.opacity),
        collapsed: bool(v.collapsed, d.enemies.collapsed),
        mapPins: bool(v.mapPins, d.enemies.mapPins),
        gearScore: bool(v.gearScore, d.enemies.gearScore),
        combatPower: bool(v.combatPower, d.enemies.combatPower),
        sound: bool(v.sound, d.enemies.sound),
        pvpOnly: bool(v.pvpOnly, d.enemies.pvpOnly),
        soundId: isSound(v.soundId) ? v.soundId : d.enemies.soundId,
        volume: num(v.volume, 0, 1, d.enemies.volume),
        customName: typeof v.customName === 'string' && v.customName ? v.customName.slice(0, 200) : null,
      } as Settings[K]
    }
    case 'killFeed': {
      const v = (value ?? {}) as Partial<Settings['killFeed']>
      return {
        open: bool(v.open, d.killFeed.open),
        position: point(v.position),
        opacity: num(v.opacity, 0, 1, d.killFeed.opacity),
        collapsed: bool(v.collapsed, d.killFeed.collapsed),
        target: bool(v.target, d.killFeed.target),
        width: v.width === null || v.width === undefined ? null : Math.round(num(v.width, KILLFEED_WIDTH[0], KILLFEED_WIDTH[1], 300)),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, KILLFEED_HEIGHT[0], KILLFEED_HEIGHT[1], 200)),
      } as Settings[K]
    }
    case 'skills': {
      const v = (value ?? {}) as Partial<Settings['skills']>
      return {
        enabled: bool(v.enabled, d.skills.enabled),
        position: point(v.position),
        rows: Math.round(num(v.rows, 1, 20, d.skills.rows)),
        opacity: num(v.opacity, 0.3, 1, d.skills.opacity),
      } as Settings[K]
    }
    case 'buffs': {
      const v = (value ?? {}) as Partial<Settings['buffs']>
      return {
        enabled: bool(v.enabled, d.buffs.enabled),
        position: point(v.position),
        opacity: num(v.opacity, 0.3, 1, d.buffs.opacity),
        size: Math.round(num(v.size, 22, 56, d.buffs.size)),
        perRow: Math.round(num(v.perRow, 4, 20, d.buffs.perRow)),
        debuffs: bool(v.debuffs, d.buffs.debuffs),
        passives: bool(v.passives, d.buffs.passives),
        consumables: bool(v.consumables, d.buffs.consumables),
        cc: bool(v.cc, d.buffs.cc),
        ccPosition: point(v.ccPosition),
        ccDebuffs: bool(v.ccDebuffs, d.buffs.ccDebuffs),
      } as Settings[K]
    }
    case 'dummy': {
      const v = (value ?? {}) as Partial<Settings['dummy']>
      return {
        overlay: bool(v.overlay, d.dummy.overlay),
        position: point(v.position),
        autoStart: bool(v.autoStart, d.dummy.autoStart),
        goal: v.goal === 'damage' ? 'damage' : 'time',
        limitMs: v.limitMs === null || DUMMY_LIMITS.some((l) => l.id === v.limitMs) ? (v.limitMs ?? null) : d.dummy.limitMs,
        damageGoal: DUMMY_DAMAGE_GOALS.includes(v.damageGoal as number) ? (v.damageGoal as number) : d.dummy.damageGoal,
        collapsed: bool(v.collapsed, false),
      } as Settings[K]
    }
    case 'meter': {
      const v = (value ?? {}) as Partial<Settings['meter']>
      return {
        enabled: bool(v.enabled, d.meter.enabled),
        position: point(v.position),
        targetMode: (TARGET_MODES as readonly unknown[]).includes(v.targetMode) ? v.targetMode : d.meter.targetMode,
        players: v.players === 'me' || v.players === 'all' ? v.players : 'party',
        stat: v.stat === 'healing' || v.stat === 'taken' ? v.stat : 'damage',
        rows: Math.round(num(v.rows, 1, 24, d.meter.rows)),
        opacity: num(v.opacity, 0.3, 1, d.meter.opacity),
        collapsed: bool(v.collapsed, false),
        width: Math.round(num(v.width, METER_WIDTH[0], METER_WIDTH[1], d.meter.width)),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, METER_HEIGHT[0], METER_HEIGHT[1], METER_HEIGHT[0])),
        hideIdle: bool(v.hideIdle, d.meter.hideIdle),
        idleSeconds: Math.round(num(v.idleSeconds, 5, 300, d.meter.idleSeconds)),
        power: v.power === 'beside' || v.power === 'below' ? v.power : 'off',
        gear: v.gear === 'beside' || v.gear === 'below' ? v.gear : 'off',
        deaths: bool(v.deaths, d.meter.deaths),
        style: v.style === 'flat' || v.style === 'bold' ? v.style : 'compact',
        barsOnly: bool(v.barsOnly, false),
        barsBackground: num(v.barsBackground, 0, 1, d.meter.barsBackground),
      } as Settings[K]
    }
    case 'language':
      return (value === 'en' ? 'en' : 'es') as Settings[K]
    case 'faction':
      return (value === 'asmodians' ? 'asmodians' : 'elyos') as Settings[K]
    case 'layoutVersion':
      return Math.round(num(value, 0, 99, 0)) as Settings[K]
    case 'playerLevel':
      return (typeof value === 'number' && Number.isFinite(value) ? Math.round(num(value, 1, 99, 1)) : null) as Settings[K]
    case 'guildEvents': {
      const v = (value ?? {}) as Partial<Settings['guildEvents']>
      return { enabled: bool(v.enabled, d.guildEvents.enabled), popup: bool(v.popup, d.guildEvents.popup) } as Settings[K]
    }
    case 'lokthar': {
      const v = (value ?? {}) as Partial<Settings['lokthar']>
      return {
        sync: bool(v.sync, d.lokthar.sync),
        url: typeof v.url === 'string' && v.url.trim() ? v.url.trim().replace(/\/+$/, '') : d.lokthar.url,
        token: typeof v.token === 'string' ? v.token.trim() : '',
      } as Settings[K]
    }
    case 'tracker': {
      const v = (value ?? {}) as Partial<Settings['tracker']>
      return {
        dataFile: typeof v.dataFile === 'string' ? v.dataFile.trim() : '',
        bossDiagnostics: bool(v.bossDiagnostics, d.tracker.bossDiagnostics),
      } as Settings[K]
    }
  }
  return d[key]
}
