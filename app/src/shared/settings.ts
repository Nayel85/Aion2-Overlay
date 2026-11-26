/**
 * Persisted settings: typed, with defaults, and normalised at the IPC boundary so a hand-edited
 * file or a renderer bug can never store something the app then trips over.
 */

import { APPLICANTS_HIDE } from './applicants.ts'
import { DEFAULT_DUTY_VALUES, DUTY_CATEGORIES, type DutyValues } from './dutyValues.ts'
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

/** Party frames: the HP as text on a bar. */
export const PARTY_HP_TEXT = ['none', 'percent', 'value'] as const
export type PartyHpText = (typeof PARTY_HP_TEXT)[number]
/** Party frames: what turns a bar to the afflicted colour: any monster's debuff, or one taking control. */
export const PARTY_AFFLICTED_BY = ['any', 'control'] as const
export type PartyAfflictedBy = (typeof PARTY_AFFLICTED_BY)[number]
/** Party frames: a red HP bar, green while afflicted. */
export const PARTY_DEFAULT_COLORS = { hp: '#c0392b', afflicted: '#2ea043' } as const

/** The overlays the Unified HUD can have a button for (main/windows.ts OVERLAYS, the training dummy's). */
/** The Kina icons the Unified HUD can show: the game's coins (bundled), a drawn one, the word. */
export const KINA_ICONS = ['game', 'bound', 'gold', 'drawn', 'word'] as const
export type KinaIcon = (typeof KINA_ICONS)[number]

export const HUD_WIDGETS = ['party', 'aggro', 'buffs', 'cc', 'flight', 'gather', 'applicants', 'training'] as const
export type HudWidget = (typeof HUD_WIDGETS)[number]
/** Their names, as the Overlays page has them. */
export const WIDGET_LABELS: Record<HudWidget, string> = {
  party: 'Party Frames', aggro: 'Aggro', buffs: 'Buffs', cc: 'CC / Debuffs', flight: 'Flight Timer', gather: 'Gathering Outcome', applicants: 'Join Requests', training: 'Training',
}

/** Hidden after `idleSeconds` with no fight (no hit, heal or damage taken, yours or your party's). */
export interface IdleHide {
  hideIdle: boolean
  idleSeconds: number
}

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
  /** The overlays go into placing (their samples, dragged) whenever this window is in front; off, only with its title bar's button. */
  arrangeWithPanel: boolean
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
  }

  /**
   * Hidden Cubes (the Map page's settings): a sound when one comes into view, whatever overlay is
   * open; which one (shared/sounds.ts), how loud (0-1), and the name of your own mp3 once chosen
   * (the file is in the data folder).
   */
  cubes: { sound: boolean; soundId: SoundId; volume: number; customName: string | null }

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

  /** Join requests to your party: a widget that comes up when someone applies. */
  applicants: { enabled: boolean; position: Point | null; opacity: number; collapsed: boolean; /** Seconds it stays after the last application. */ hideAfter: number }
  /** Aggro: the monsters on you, while there are any. */
  aggro: { enabled: boolean; position: Point | null; opacity: number; collapsed: boolean }
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
  } & IdleHide
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

  /**
   * The Unified HUD (pages/UnifiedPage.vue): one small bar at the top of the game that unfolds on
   * hover and shows things as they matter. `position` is its top centre (it grows both ways from
   * there; null = the top centre of the primary display). The minutes and seconds are how long each thing stays after its last
   * news. `replace`: Enemies nearby stays closed while it is on (the timer bar does
   * not: the HUD shows only two events).
   */
  unified: {
    enabled: boolean
    position: Point | null
    opacity: number
    scale: number
    events: boolean
    countdownMinutes: number
    ping: boolean
    target: boolean
    targetSeconds: number
    /** Where your target shows: 'strip' two lines under the bar, 'inline' one short segment in the bar itself (nothing is covered under it). */
    targetStyle: 'strip' | 'inline'
    /** What the meter follows while it is on: 'always' your last hit, 'players' your last hit while a player is selected, 'meter' as the meter is set. */
    targetMode: 'always' | 'players' | 'meter'
    /** Kina per hour and Abyss Points per hour (farming only: rewards are left out), always shown while on. */
    kina: boolean
    /** The Kina of the session, every gain counted. */
    kinaSession: boolean
    /** The Kina's icon: the game's coin (gold, bound), a drawn one, or the word. */
    kinaIcon: KinaIcon
    /** The Abyss Points': the game's icon, or the word. */
    apIcon: 'icon' | 'word'
    /** The app's logo on the bar: only a mark (the cog opens the app). */
    logo: boolean
    abyssRate: boolean
    /** The Abyss Points of the season going on (coin icon): it ends after 15 minutes without any. */
    season: boolean
    rift: boolean
    cubes: boolean
    death: boolean
    deathMinutes: number
    enemies: boolean
    bosses: boolean
    clock: boolean
    odyle: boolean
    replace: boolean
    /** The other overlays' buttons on the bar: each turns its overlay on or off. */
    widgets: HudWidget[]
    /** Chips: join requests to your party, a personal best just beaten, the corridors still to do. */
    applicants: boolean
    bests: boolean
    corridors: boolean
  }

  /** Every alert's sound off (the Unified HUD's speaker): cubes, enemies, the timers' chime. */
  muted: boolean

  /**
   * What the per hour figures (Kina, Abyss Points: the HUD's, the Session page's) count: farming,
   * never rewards. What a dungeon gives (its monsters, its cube) only with these on.
   */
  rates: { kinaDungeons: boolean; abyssDungeons: boolean }
  /**
   * The duty board: what each kind of reward is worth to you, in Kina (0: left out); its window over
   * the game as you open the board (`overlay`), where it was left and how opaque.
   */
  duty: { values: DutyValues; overlay: boolean; position: Point | null; opacity: number }

  /** The kill feed over the game: open (from the PvP page), and where (null = top right). */
  /**
   * The kill feed overlay; `opacity` is its background's (0: none, the text glows on the game); `target`: your target under it;
   * `width` and `height` as dragged from its corner (null: sized to what it shows).
   */
  killFeed: { open: boolean; position: Point | null; opacity: number; collapsed: boolean; target: boolean; width: number | null; height: number | null } & IdleHide
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
  } & IdleHide

  /**
   * Training dummy runs: their goal (a time limit, or damage), whether a run starts by itself with
   * your first hit on a dummy (and its clock with it), and the Training overlay over the game.
   */
  dummy: { overlay: boolean; position: Point | null; autoStart: boolean; goal: DummyGoal; limitMs: number | null; damageGoal: number; collapsed: boolean } & IdleHide

  /** Your own skills on the meter's target, as a window of their own. */
  skills: { enabled: boolean; position: Point | null; rows: number; opacity: number } & IdleHide

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

  /** The app's language (shared/i18n.ts): English unless changed. */
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
   * a token. Besides the update check (Settings → Updates, by hand), and NCSoft's character pages,
   * the only requests the app makes: to `url` alone.
   */
  lokthar: {
    sync: boolean
    /** The site, e.g. https://lokthar.com: https only (http for localhost, to test against a dev server). */
    url: string
    /** From the site: bin/rails 'overlay:token[you]'. */
    token: string
  }

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
  bubble: { x: 2632, y: 822 },
  panel: { width: 1543, height: 926 },
  panelPosition: { x: -1711, y: 149 },
  panelOnTop: true,
  panelHideOnGame: false,
  arrangeWithPanel: false,
  clock24: true,
  hud: { enabled: false, position: { x: 1758, y: 39 }, mode: 'pinned', nearby: true, nearbyCount: 3, pinned: [], recentCount: 3, toasts: true, opacity: 0.92, scale: 1, hideWithoutGame: true, idleHideSeconds: 45, merchant: true },
  cubes: { sound: true, soundId: 'chime', volume: 0.6, customName: null },
  minimap: { enabled: false, position: { x: 2098, y: 722 }, size: 260, height: null, opacity: 0.92, zoom: 16.26, collapsed: false, gatherables: false },
  mapPage: { needed: true, cubes: false, gatherables: false, hiddenPets: [] },
  gatherables: { pinned: [] },
  gameMap: { enabled: false, region: null, gatherables: true, pets: true, cubes: true, enemies: true, showArea: false },
  merchantWindow: { x: 446, y: 755 },
  detailsWindow: { x: 449, y: 251 },
  timerBar: { enabled: true, position: { x: 0, y: 394 }, opacity: 0.92, layout: 'list' },
  unified: { enabled: true, position: { x: 1334, y: 0 }, opacity: 0.94, scale: 1, events: false, countdownMinutes: 10, ping: true, target: true, targetSeconds: 8, targetStyle: 'inline', targetMode: 'always', kina: true, abyssRate: true, season: true, rift: false, cubes: false, death: true, deathMinutes: 10, enemies: true, bosses: false, clock: true, odyle: true, replace: false, kinaSession: true, kinaIcon: 'game', apIcon: 'icon', logo: false, widgets: ['party', 'aggro', 'buffs', 'cc', 'flight', 'gather', 'applicants'], applicants: true, bests: true, corridors: true },
  muted: false,
  rates: { kinaDungeons: false, abyssDungeons: false },
  duty: { values: DEFAULT_DUTY_VALUES, overlay: true, position: null, opacity: 0.95 },
  applicants: { enabled: true, position: { x: 872, y: 220 }, opacity: 0.85, collapsed: false, hideAfter: 60 },
  aggro: { enabled: true, position: null, opacity: 0.8, collapsed: false },
  party: {
    enabled: true, position: { x: 1709, y: 165 }, opacity: 0.85, collapsed: false, self: false, header: false, icon: true, hpText: 'none', debuffIcons: true, shields: true, bossTarget: true,
    width: 180, barHeight: 22, gap: 2, fontSize: 12, hpColor: PARTY_DEFAULT_COLORS.hp, afflictedColor: PARTY_DEFAULT_COLORS.afflicted, afflictedBy: 'any',
    hideIdle: false, idleSeconds: 30,
  },
  flight: { enabled: true, position: { x: 1149, y: 526 }, opacity: 1 },
  gather: {
    enabled: true, style: 'ring', position: { x: 1351, y: 773 }, opacity: 1, scale: 1, icon: true, fail: true, rare: true, plain: true, crafts: true,
    soundFail: false, soundRare: false, soundId: 'bell', volume: 0.6,
  },
  killFeed: { open: false, position: null, opacity: 0.9, collapsed: false, target: true, width: null, height: null, hideIdle: false, idleSeconds: 30 },
  enemies: { enabled: true, position: { x: 1218, y: 131 }, opacity: 0.75, collapsed: false, mapPins: true, gearScore: true, combatPower: true, sound: true, pvpOnly: true, soundId: 'enemy-spotted', volume: 0.7, customName: null },
  skills: { enabled: false, position: { x: 500, y: 413 }, rows: 6, opacity: 0.92, hideIdle: false, idleSeconds: 30 },
  dummy: { overlay: false, position: null, autoStart: true, goal: 'time', limitMs: 60000, damageGoal: 10000000, collapsed: false, hideIdle: false, idleSeconds: 30 },
  buffs: { enabled: false, position: { x: 1178, y: 800 }, opacity: 0.92, size: 34, perRow: 10, debuffs: true, passives: false, consumables: false, cc: true, ccPosition: { x: 1181, y: 345 }, ccDebuffs: false, hideIdle: false, idleSeconds: 30 },
  meter: { enabled: true, position: { x: 362, y: 72 }, targetMode: 'bossTargets', players: 'party', stat: 'damage', rows: 8, opacity: 0.92, collapsed: false, width: 321, height: 328, hideIdle: true, idleSeconds: 15, power: 'below', gear: 'below', deaths: true, style: 'compact', barsOnly: false, barsBackground: 0.6 },
  hideFromCapture: false,
  layoutVersion: 5,
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

/** A setting's field rule: what it makes of a value, given the default. */
type Rule = (v: unknown, fallback: never) => unknown
const BOOL: Rule = (v, fallback) => bool(v, fallback)
const POINT: Rule = (v) => point(v)
const COLOUR: Rule = (v, fallback) => colour(v, fallback)
/** A number held between `lo` and `hi`; `whole` rounds it. */
const range = (lo: number, hi: number): Rule => (v, fallback) => num(v, lo, hi, fallback)
const whole = (lo: number, hi: number): Rule => (v, fallback) => Math.round(num(v, lo, hi, fallback))
/** The fields of a section that follow a plain rule, each from its value and its default. */
function fields<T extends object>(v: object, d: T, rules: Partial<Record<keyof T, Rule>>): Partial<T> {
  const given = v as Record<string, unknown>
  const defaults = d as Record<string, unknown>
  return Object.fromEntries(Object.entries(rules).map(([k, rule]) => [k, (rule as Rule)(given[k], defaults[k] as never)])) as Partial<T>
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
    case 'duty': {
      const v = (value ?? {}) as Partial<Settings['duty']>
      const given = (v.values ?? {}) as Partial<DutyValues>
      return {
        values: Object.fromEntries(DUTY_CATEGORIES.map((c) => [c.id, num(given[c.id], 0, 1e9, d.duty.values[c.id])])),
        overlay: bool(v.overlay, d.duty.overlay),
        position: point(v.position),
        opacity: num(v.opacity, 0.3, 1, d.duty.opacity),
      } as Settings[K]
    }
    case 'rates': {
      const v = (value ?? {}) as Partial<Settings['rates']>
      return fields(v, d.rates, { kinaDungeons: BOOL, abyssDungeons: BOOL }) as Settings[K]
    }
    case 'panelOnTop':
    case 'panelHideOnGame':
    case 'arrangeWithPanel':
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
        ...fields(v, d.hud, {
          enabled: BOOL, position: POINT, nearby: BOOL, nearbyCount: whole(1, 8), recentCount: whole(1, 8), toasts: BOOL, opacity: range(0.3, 1),
          scale: range(0.75, 1.75), hideWithoutGame: BOOL, idleHideSeconds: whole(0, 600), merchant: BOOL,
        }),
        // 'nearby' was a mode before it became its own section (0.1.3).
        mode: v.mode === 'pinned' ? 'pinned' : 'recent',
        pinned: Array.isArray(v.pinned) ? [...new Set(v.pinned.filter((n) => Number.isInteger(n)))].slice(0, MAX_PINNED) : [],
      } as Settings[K]
    }
    case 'cubes': {
      const v = (value ?? {}) as Partial<Settings['cubes']>
      return {
        ...fields(v, d.cubes, { sound: BOOL, volume: range(0, 1) }),
        soundId: isSound(v.soundId) ? v.soundId : d.cubes.soundId,
        customName: typeof v.customName === 'string' && v.customName ? v.customName.slice(0, 200) : null,
      } as Settings[K]
    }
    case 'timers': {
      const v = (value ?? {}) as Partial<Settings['timers']>
      const on = (v.enabled ?? {}) as Partial<Record<TimerId, unknown>>
      const lead = (v.lead ?? {}) as Partial<Record<TimerId, unknown>>
      return {
        ...fields(v, d.timers, {
          sound: BOOL, volume: range(0, 1), shake: BOOL,
        }),
        region: REGIONS.some((r) => r.id === v.region) ? v.region : d.timers.region,
        enabled: Object.fromEntries(TIMERS.map((t) => [t.id, bool(on[t.id], t.defaultOn)])) as Record<TimerId, boolean>,
        // One of the leads offered for that timer; anything else falls back to its default.
        lead: Object.fromEntries(
          TIMERS.map((t) => [t.id, leadChoices(t).includes(lead[t.id] as number) ? (lead[t.id] as number) : t.lead]),
        ) as Record<TimerId, number>,
        shown: Object.fromEntries(
          TIMERS.map((t) => [t.id, bool((v.shown as Partial<Record<TimerId, unknown>> | undefined)?.[t.id], defaultShown(t))]),
        ) as Record<TimerId, boolean>,
      } as Settings[K]
    }
    case 'minimap': {
      const v = (value ?? {}) as Partial<Settings['minimap']>
      return {
        ...fields(v, d.minimap, {
          enabled: BOOL, position: POINT, size: whole(MINIMAP_WIDTH[0], MINIMAP_WIDTH[1]), opacity: range(0.3, 1), zoom: range(1, 40),
          gatherables: BOOL,
        }),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, MINIMAP_HEIGHT[0], MINIMAP_HEIGHT[1], d.minimap.size)),
        collapsed: bool(v.collapsed, false),
      } as Settings[K]
    }
    case 'mapPage': {
      const v = (value ?? {}) as Partial<Settings['mapPage']>
      return {
        ...fields(v, d.mapPage, {
          needed: BOOL, cubes: BOOL, gatherables: BOOL,
        }),
        hiddenPets: Array.isArray(v.hiddenPets) ? [...new Set(v.hiddenPets.filter((n) => Number.isInteger(n)))].slice(0, MAX_PINNED) : [],
      } as Settings[K]
    }
    case 'gameMap': {
      const v = (value ?? {}) as Partial<Settings['gameMap']>
      return {
        ...fields(v, d.gameMap, {
          enabled: BOOL, gatherables: BOOL, pets: BOOL, cubes: BOOL, enemies: BOOL, showArea: BOOL,
        }),
        region: rect(v.region),
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
        ...fields(v, d.timerBar, {
          enabled: BOOL, position: POINT, opacity: range(0.3, 1),
        }),
        layout: v.layout === 'list' ? 'list' : 'bar',
      } as Settings[K]
    }
    case 'unified': {
      const v = (value ?? {}) as Partial<Settings['unified']>
      const u = d.unified
      return {
        ...fields(v, d.unified, {
          enabled: BOOL, position: POINT, opacity: range(0, 1), scale: range(0.75, 1.75), events: BOOL, countdownMinutes: whole(1, 60), ping: BOOL,
          target: BOOL, targetSeconds: whole(3, 60), kina: BOOL, abyssRate: BOOL, season: BOOL, rift: BOOL,
          cubes: BOOL, death: BOOL, deathMinutes: whole(1, 60), enemies: BOOL, bosses: BOOL, clock: BOOL, odyle: BOOL,
          replace: BOOL, logo: BOOL, kinaSession: BOOL, applicants: BOOL, bests: BOOL, corridors: BOOL,
        }),
        apIcon: v.apIcon === 'word' ? 'word' : 'icon',
        kinaIcon: (KINA_ICONS as readonly unknown[]).includes(v.kinaIcon) ? v.kinaIcon! : u.kinaIcon,
        widgets: Array.isArray(v.widgets) ? HUD_WIDGETS.filter((w) => v.widgets!.includes(w)) : [...u.widgets],
        targetStyle: v.targetStyle === 'strip' ? 'strip' : 'inline',
        targetMode: v.targetMode === 'players' || v.targetMode === 'meter' ? v.targetMode : 'always',
      } as Settings[K]
    }
    case 'aggro': {
      const v = (value ?? {}) as Partial<Settings['aggro']>
      return fields(v, d.aggro, { enabled: BOOL, position: POINT, opacity: range(0, 1), collapsed: BOOL }) as Settings[K]
    }
    case 'applicants': {
      const v = (value ?? {}) as Partial<Settings['applicants']>
      return {
        ...fields(v, d.applicants, {
          enabled: BOOL, position: POINT, opacity: range(0, 1), hideAfter: whole(APPLICANTS_HIDE[0], APPLICANTS_HIDE[1]),
        }),
        collapsed: bool(v.collapsed, false),
      } as Settings[K]
    }
    case 'gather': {
      const v = (value ?? {}) as Partial<Settings['gather']>
      const g = d.gather
      return {
        ...fields(v, d.gather, {
          enabled: BOOL, position: POINT, opacity: range(0.2, 1), scale: range(0.6, 2), icon: BOOL, fail: BOOL, rare: BOOL, plain: BOOL, crafts: BOOL,
          soundFail: BOOL, soundRare: BOOL, volume: range(0, 1),
        }),
        style: v.style === 'pill' || v.style === 'gauges' ? v.style : 'ring',
        soundId: isSound(v.soundId) && v.soundId !== 'custom' ? v.soundId : g.soundId,
      } as Settings[K]
    }
    case 'flight': {
      const v = (value ?? {}) as Partial<Settings['flight']>
      return { enabled: bool(v.enabled, d.flight.enabled), position: point(v.position), opacity: num(v.opacity, 0.2, 1, d.flight.opacity) } as Settings[K]
    }
    case 'party': {
      const v = (value ?? {}) as Partial<Settings['party']>
      return {
        ...fields(v, d.party, {
          hideIdle: BOOL, idleSeconds: whole(5, 600),
          enabled: BOOL, position: POINT, opacity: range(0, 1), self: BOOL, header: BOOL, icon: BOOL, debuffIcons: BOOL, shields: BOOL,
          bossTarget: BOOL, width: whole(100, 320), barHeight: whole(14, 40), gap: whole(0, 12), fontSize: whole(9, 18), hpColor: COLOUR,
          afflictedColor: COLOUR,
        }),
        collapsed: bool(v.collapsed, false),
        hpText: (PARTY_HP_TEXT as readonly unknown[]).includes(v.hpText) ? v.hpText! : d.party.hpText,
        afflictedBy: (PARTY_AFFLICTED_BY as readonly unknown[]).includes(v.afflictedBy) ? v.afflictedBy! : d.party.afflictedBy,
      } as Settings[K]
    }
    case 'enemies': {
      const v = (value ?? {}) as Partial<Settings['enemies']>
      return {
        ...fields(v, d.enemies, {
          enabled: BOOL, position: POINT, opacity: range(0, 1), collapsed: BOOL, mapPins: BOOL, gearScore: BOOL, combatPower: BOOL, sound: BOOL,
          pvpOnly: BOOL, volume: range(0, 1),
        }),
        soundId: isSound(v.soundId) ? v.soundId : d.enemies.soundId,
        customName: typeof v.customName === 'string' && v.customName ? v.customName.slice(0, 200) : null,
      } as Settings[K]
    }
    case 'killFeed': {
      const v = (value ?? {}) as Partial<Settings['killFeed']>
      return {
        ...fields(v, d.killFeed, {
          hideIdle: BOOL, idleSeconds: whole(5, 600),
          open: BOOL, position: POINT, opacity: range(0, 1), collapsed: BOOL, target: BOOL,
        }),
        width: v.width === null || v.width === undefined ? null : Math.round(num(v.width, KILLFEED_WIDTH[0], KILLFEED_WIDTH[1], 300)),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, KILLFEED_HEIGHT[0], KILLFEED_HEIGHT[1], 200)),
      } as Settings[K]
    }
    case 'skills': {
      const v = (value ?? {}) as Partial<Settings['skills']>
      return {
        ...fields(v, d.skills, {
          hideIdle: BOOL, idleSeconds: whole(5, 600),
          enabled: BOOL, position: POINT, rows: whole(1, 20), opacity: range(0.3, 1),
        }),
      } as Settings[K]
    }
    case 'buffs': {
      const v = (value ?? {}) as Partial<Settings['buffs']>
      return {
        ...fields(v, d.buffs, {
          hideIdle: BOOL, idleSeconds: whole(5, 600),
          enabled: BOOL, position: POINT, opacity: range(0.3, 1), size: whole(22, 56), perRow: whole(4, 20), debuffs: BOOL, passives: BOOL,
          consumables: BOOL, cc: BOOL, ccPosition: POINT, ccDebuffs: BOOL,
        }),
      } as Settings[K]
    }
    case 'dummy': {
      const v = (value ?? {}) as Partial<Settings['dummy']>
      return {
        ...fields(v, d.dummy, {
          hideIdle: BOOL, idleSeconds: whole(5, 600),
          overlay: BOOL, position: POINT, autoStart: BOOL,
        }),
        goal: v.goal === 'damage' ? 'damage' : 'time',
        limitMs: v.limitMs === null || DUMMY_LIMITS.some((l) => l.id === v.limitMs) ? (v.limitMs ?? null) : d.dummy.limitMs,
        damageGoal: DUMMY_DAMAGE_GOALS.includes(v.damageGoal as number) ? (v.damageGoal as number) : d.dummy.damageGoal,
        collapsed: bool(v.collapsed, false),
      } as Settings[K]
    }
    case 'meter': {
      const v = (value ?? {}) as Partial<Settings['meter']>
      return {
        ...fields(v, d.meter, {
          enabled: BOOL, position: POINT, rows: whole(1, 24), opacity: range(0.3, 1), width: whole(METER_WIDTH[0], METER_WIDTH[1]), hideIdle: BOOL,
          idleSeconds: whole(5, 300), deaths: BOOL, barsBackground: range(0, 1),
        }),
        targetMode: (TARGET_MODES as readonly unknown[]).includes(v.targetMode) ? v.targetMode : d.meter.targetMode,
        players: v.players === 'me' || v.players === 'all' ? v.players : 'party',
        stat: v.stat === 'healing' || v.stat === 'taken' ? v.stat : 'damage',
        collapsed: bool(v.collapsed, false),
        height: v.height === null || v.height === undefined ? null : Math.round(num(v.height, METER_HEIGHT[0], METER_HEIGHT[1], METER_HEIGHT[0])),
        power: v.power === 'beside' || v.power === 'below' ? v.power : 'off',
        gear: v.gear === 'beside' || v.gear === 'below' ? v.gear : 'off',
        style: v.style === 'flat' || v.style === 'bold' ? v.style : 'compact',
        barsOnly: bool(v.barsOnly, false),
      } as Settings[K]
    }
    case 'language':
      // French or English; Spanish, gone, reads as English.
      return (value === 'fr' ? 'fr' : 'en') as Settings[K]
    case 'faction':
      return (value === 'asmodians' ? 'asmodians' : 'elyos') as Settings[K]
    case 'layoutVersion':
      return Math.round(num(value, 0, 99, 0)) as Settings[K]
    case 'playerLevel':
      return (typeof value === 'number' && Number.isFinite(value) ? Math.round(num(value, 1, 99, 1)) : null) as Settings[K]
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
