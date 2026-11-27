/**
 * The overlays that size themselves to their page (`measuredOverlay`): every one of them, as windows.ts
 * opens, places, shows and hides them; the HUD's move mode.
 */
import { BrowserWindow, screen, type Rectangle } from 'electron'
import { broadcast, send } from '../broadcast.ts'
import { settings } from '../settings.ts'
import { log } from '../tracker.ts'
import type { OverlayId } from '../../shared/ipc.ts'
import type { Point } from '../../shared/settings.ts'
import { gameIsAway, isArranging, reveal } from '../windows.ts'
import { alive, clampToDisplay, EDGE, load, measured, overlayWindow } from './frame.ts'

let hudEditing = false

// ---- hud ------------------------------------------------------------------------------------

/**
 * `focus`: take the keyboard too (so Escape ends move mode). Not when the panel turned move mode
 * on: the panel keeps the focus it was just given.
 */
export function setHudEditing(editing: boolean, focus = true): void {
  const hud = OVERLAYS.hud.win()
  if (!hud || hudEditing === editing) return
  hudEditing = editing
  // Edit mode is the only time the HUD takes the mouse: click-through the rest of the time.
  hud.setIgnoreMouseEvents(!editing)
  hud.setFocusable(editing)
  if (editing && focus) hud.focus()
  broadcast('hud:editing', editing)
}

export function hudIsEditing(): boolean {
  return hudEditing
}

const MERCHANT_WIDTH = 400
const KILL_FEED_WIDTH = 312

// ---- measured overlays: your skills, the map, your buffs --------------------------------------

/**
 * An overlay that sizes itself to its page (which reports 0 x 0 with nothing to show, and is then
 * kept hidden), moved by its header, its position saved in its own setting.
 */
export function measuredOverlay(o: {
  route: string
  enabled: () => boolean
  saved: () => Point | null
  /** Where it goes before it is placed, given the size its page measured (0 × 0 before). */
  fallback: (size: { width: number; height: number }) => Point
  /** Its place kept; null: forgotten, back to where it goes first. */
  save: (p: Point | null) => void
  /** Its place is its top centre, not its top left: it grows both ways around it (the Unified HUD). */
  centred?: boolean
  /** Taken clicks as you play (the meter, the Unified HUD): its focus does not mean it is being placed. */
  takesClicks?: boolean
  /** A `manual` one is opened all the same while the overlays are being placed, to place it (not the packet log's pill). */
  placeable?: boolean
  /** Told once its page has loaded (the pets HUD: its move mode). */
  loaded?: (w: BrowserWindow) => void
  /** Clicks go through to the game, except while the dashboard is up (to move it). */
  clickThrough?: boolean
  /** Kept with its bottom right corner here, whatever its size (not moved by hand). */
  corner?: () => Point
  /** Opened by its own module only (the merchant with the shop, the packet log's pill), not with the others. */
  manual?: boolean
}) {
  let win: BrowserWindow | null = null
  let size = { width: 0, height: 0 }
  const position = (): Point => {
    if (o.corner) {
      const c = o.corner()
      return { x: c.x - size.width, y: c.y - size.height }
    }
    const p = o.saved() ?? o.fallback(size)
    return o.centred ? { x: Math.round(p.x - size.width / 2), y: p.y } : p
  }
  const refresh = (): void => {
    if (!alive(win)) return
    if (size.width > 0 && size.height > 0) {
      const p = position()
      const next = clampToDisplay({ x: p.x, y: p.y, ...size })
      const now = win.getBounds()
      if (next.x !== now.x || next.y !== now.y || next.width !== now.width || next.height !== now.height) win.setBounds(next)
      if (!win.isVisible()) {
        reveal(win)
        log(`overlay ${o.route}: ${win.isVisible() ? 'shown' : `held hidden (${gameIsAway() ? 'game not in front' : 'overlays hidden by hand'})`} at ${p.x},${p.y} ${size.width}x${size.height}`)
      }
    } else if (win.isVisible()) {
      win.hide()
      log(`overlay ${o.route}: nothing to show, hidden`)
    }
  }
  return {
    win: (): BrowserWindow | null => (alive(win) ? win : null),
    enabled: o.enabled,
    manual: o.manual === true,
    placeable: o.placeable !== false,
    takesClicks: o.takesClicks === true,
    /** Where it is while it shows, else null. */
    bounds: (): Rectangle | null => (alive(win) && win.isVisible() ? win.getBounds() : null),
    /** Open it, unless it is turned off. It shows once its page has measured itself. */
    create(): void {
      if (!o.enabled() || alive(win)) return
      const p = position()
      const w = overlayWindow({ x: p.x, y: p.y, width: 300, height: 120, ...(o.clickThrough ? { focusable: false } : {}) })
      if (o.clickThrough && !isArranging()) w.setIgnoreMouseEvents(true)
      else if (o.clickThrough) w.setFocusable(true)
      win = w
      size = { width: 0, height: 0 }
      log(`overlay ${o.route}: opened${isArranging() ? ' (being placed)' : ''}`)
      w.on('closed', () => {
        if (win === w) win = null
      })
      if (o.loaded) w.webContents.once('did-finish-load', () => alive(w) && o.loaded!(w))
      load(w, o.route)
    },
    close(): void {
      if (alive(win)) win.destroy()
      win = null
    },
    refresh,
    /** The dashboard came up (it can be moved) or went down (clicks pass through). */
    panelUp(up: boolean): void {
      if (!o.clickThrough || !alive(win)) return
      win.setIgnoreMouseEvents(!up)
      // As the HUD in move mode: a window that can never be activated loses its presses to
      // Windows over the game, and with no press there is no drag.
      win.setFocusable(up)
    },
    resize(to: { width: number; height: number }): void {
      size = { width: Math.ceil(to.width), height: Math.ceil(to.height) }
      refresh()
    },
    move(to: Point): void {
      if (alive(win)) win.setBounds(clampToDisplay({ x: to.x, y: to.y, ...measured(win, size) }))
    },
    /** Back to where it goes first (its setting's Reset). */
    resetPosition(): void {
      o.save(null)
      refresh()
    },
    dragEnded(): void {
      if (!alive(win)) return
      const { x, y } = win.getBounds()
      o.save(o.centred ? { x: Math.round(x + measured(win, size).width / 2), y } : { x, y })
    },
  }
}

const skillsOverlay = measuredOverlay({
  route: 'skills',
  enabled: () => settings.get('skills').enabled,
  saved: () => settings.get('skills').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + EDGE, y: area.y + 480 }
  },
  save: (position) => settings.set('skills', { ...settings.get('skills'), position }),
})

const miniMapOverlay = measuredOverlay({
  route: 'minimap',
  enabled: () => settings.get('minimap').enabled,
  saved: () => settings.get('minimap').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    const size = settings.get('minimap').size
    return { x: area.x + area.width - size - 2 * EDGE, y: area.y + area.height - size - 4 * EDGE }
  },
  save: (position) => settings.set('minimap', { ...settings.get('minimap'), position }),
})

const buffsOverlay = measuredOverlay({
  route: 'buffs',
  enabled: () => settings.get('buffs').enabled,
  saved: () => settings.get('buffs').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 200), y: area.y + area.height - 260 }
  },
  save: (position) => settings.set('buffs', { ...settings.get('buffs'), position }),
})

const ccOverlay = measuredOverlay({
  route: 'cc',
  enabled: () => settings.get('buffs').cc,
  saved: () => settings.get('buffs').ccPosition,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 190), y: Math.round(area.y + area.height * 0.28) }
  },
  save: (ccPosition) => settings.set('buffs', { ...settings.get('buffs'), ccPosition }),
  clickThrough: true,
})

/** Aggro: the monsters on you, left of centre, below the middle (where your eyes are in a fight). */
const aggroOverlay = measuredOverlay({
  route: 'aggro',
  enabled: () => settings.get('aggro').enabled,
  saved: () => settings.get('aggro').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width * 0.3), y: Math.round(area.y + area.height * 0.55) }
  },
  save: (position) => settings.set('aggro', { ...settings.get('aggro'), position }),
  clickThrough: true,
})

/** Enemies nearby: top centre, under where the CC banner sits. */
const enemiesOverlay = measuredOverlay({
  route: 'enemies',
  enabled: () => enemiesOn(),
  saved: () => settings.get('enemies').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 130), y: Math.round(area.y + area.height * 0.12) }
  },
  save: (position) => settings.set('enemies', { ...settings.get('enemies'), position }),
  clickThrough: true,
})

const trainingOverlay = measuredOverlay({
  route: 'training',
  enabled: () => settings.get('dummy').overlay,
  saved: () => settings.get('dummy').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + area.width - 300 - EDGE, y: Math.round(area.y + area.height * 0.3) }
  },
  save: (position) => settings.set('dummy', { ...settings.get('dummy'), position }),
})

/** The packet log's pill (Alt+Shift+R): top left while it records, and a few seconds after. */
const packetsOverlay = measuredOverlay({
  route: 'packets',
  enabled: () => true,
  saved: () => null,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + EDGE, y: area.y + EDGE }
  },
  save: () => {},
  clickThrough: true,
  manual: true,
  placeable: false,
})
export const createPacketsHud = packetsOverlay.create
export const closePacketsHud = packetsOverlay.close

/** Join requests: left of centre, a fifth of the way down (clickable: it has buttons). */
const applicantsOverlay = measuredOverlay({
  route: 'applicants',
  enabled: () => settings.get('applicants').enabled,
  saved: () => settings.get('applicants').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width * 0.3), y: Math.round(area.y + area.height * 0.2) }
  },
  save: (position) => settings.set('applicants', { ...settings.get('applicants'), position }),
})
export const createApplicants = applicantsOverlay.create

/** Party frames: at the left, a third of the way down (as the game's own). */
const partyOverlay = measuredOverlay({
  route: 'party',
  enabled: () => settings.get('party').enabled,
  saved: () => settings.get('party').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width * 0.02), y: Math.round(area.y + area.height * 0.3) }
  },
  save: (position) => settings.set('party', { ...settings.get('party'), position }),
})
export const createParty = partyOverlay.create

/** The flight timer: under the centre of the screen, where you look while flying (click-through). */
const flightOverlay = measuredOverlay({
  route: 'flight',
  enabled: () => settings.get('flight').enabled,
  saved: () => settings.get('flight').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 86), y: Math.round(area.y + area.height * 0.62) }
  },
  save: (position) => settings.set('flight', { ...settings.get('flight'), position }),
  clickThrough: true,
})

/** The gathering outcome: a little above the middle of the screen, where you look (click-through). */
const gatherOverlay = measuredOverlay({
  route: 'gather',
  enabled: () => settings.get('gather').enabled,
  saved: () => settings.get('gather').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 110), y: Math.round(area.y + area.height * 0.38) }
  },
  save: (position) => settings.set('gather', { ...settings.get('gather'), position }),
  clickThrough: true,
})

/** The pets HUD: top right; click-through but while placed, or moved by hand (setHudEditing). */
const hudOverlay = measuredOverlay({
  route: 'hud',
  enabled: () => settings.get('hud').enabled,
  saved: () => settings.get('hud').position,
  fallback: (size) => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + area.width - Math.max(size.width, 260) - EDGE, y: area.y + 120 }
  },
  save: (position) => settings.set('hud', { ...settings.get('hud'), position }),
  clickThrough: true,
  // A new window starts out of the hand move mode; being placed is told once its page listens.
  loaded: (w) => {
    hudEditing = false
    if (isArranging()) setHudEditing(true, false)
    else send(w, 'hud:editing', false)
  },
})

/** The Black Cloud Merchant's pets: opened by a tab of the shop (main/index.ts), and to be placed. */
const merchantOverlay = measuredOverlay({
  route: 'merchant',
  enabled: () => settings.get('hud').merchant,
  saved: () => settings.get('merchantWindow'),
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - MERCHANT_WIDTH / 2), y: area.y + 120 }
  },
  save: (p) => settings.set('merchantWindow', p),
  manual: true,
})

/** The duty board's advice: opened as you open the board in game (main/index.ts), right of centre. */
const dutyOverlay = measuredOverlay({
  route: 'duty',
  enabled: () => settings.get('duty').overlay,
  saved: () => settings.get('duty').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width * 0.62), y: area.y + 140 }
  },
  save: (position) => settings.set('duty', { ...settings.get('duty'), position }),
  manual: true,
})

/** The DPS meter: top left. */
const meterOverlay = measuredOverlay({
  route: 'meter',
  enabled: () => settings.get('meter').enabled,
  saved: () => settings.get('meter').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + EDGE, y: area.y + 160 }
  },
  save: (position) => settings.set('meter', { ...settings.get('meter'), position }),
  takesClicks: true,
})

/** The timer bar: top centre. */
const timerBarOverlay = measuredOverlay({
  route: 'timerbar',
  enabled: () => timerBarOn(),
  saved: () => settings.get('timerBar').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2 - 150), y: area.y + EDGE }
  },
  save: (position) => settings.set('timerBar', { ...settings.get('timerBar'), position }),
})

/** The Unified HUD: its place is its top centre, so the bar stays where it was put as it grows. */
const unifiedOverlay = measuredOverlay({
  route: 'unified',
  enabled: () => settings.get('unified').enabled,
  saved: () => settings.get('unified').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: Math.round(area.x + area.width / 2), y: area.y }
  },
  save: (position) => settings.set('unified', { ...settings.get('unified'), position }),
  centred: true,
  takesClicks: true,
})

/** The kill feed: top right, open while the PvP page has it so. */
const killFeedOverlay = measuredOverlay({
  route: 'killfeed',
  enabled: () => settings.get('killFeed').open,
  saved: () => settings.get('killFeed').position,
  fallback: () => {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + area.width - KILL_FEED_WIDTH - EDGE, y: area.y + 120 }
  },
  save: (position) => settings.set('killFeed', { ...settings.get('killFeed'), position }),
})

/** Every overlay, by its route (shared/ipc.ts `OverlayId`): each opened, shown, placed and closed the same way. */
export const OVERLAYS: Record<OverlayId, ReturnType<typeof measuredOverlay>> = {
  aggro: aggroOverlay,
  applicants: applicantsOverlay,
  party: partyOverlay,
  flight: flightOverlay,
  gather: gatherOverlay,
  skills: skillsOverlay,
  minimap: miniMapOverlay,
  buffs: buffsOverlay,
  cc: ccOverlay,
  enemies: enemiesOverlay,
  training: trainingOverlay,
  packets: packetsOverlay,
  hud: hudOverlay,
  merchant: merchantOverlay,
  meter: meterOverlay,
  timerbar: timerBarOverlay,
  unified: unifiedOverlay,
  killfeed: killFeedOverlay,
  duty: dutyOverlay,
}
export const MEASURED = Object.values(OVERLAYS)
/** Open every overlay that is on (as the game starts): each shows once its page has measured itself. */
export function openOverlays(): void {
  for (const m of MEASURED) if (!m.manual) m.create()
}
/** One overlay opened (if on) or closed, by its module (the merchant with the shop). */
export const openOverlay = (id: OverlayId): void => OVERLAYS[id].create()
export const closeOverlay = (id: OverlayId): void => OVERLAYS[id].close()
export const overlayOpen = (id: OverlayId): boolean => OVERLAYS[id].win() !== null
export const overlayBounds = (id: OverlayId): Rectangle | null => OVERLAYS[id].bounds()
/** Where the overlays showing are: what the screen watchers leave out of their pictures. */
export const shownOverlayBounds = (): Rectangle[] => Object.values(OVERLAYS).map((o) => o.bounds()).filter((b): b is Rectangle => b !== null)
export const overlayMove = (id: OverlayId, to: Point): void => OVERLAYS[id].move(to)
export const overlayDragEnded = (id: OverlayId): void => OVERLAYS[id].dragEnded()
export const overlayResetPosition = (id: OverlayId): void => OVERLAYS[id].resetPosition()
export const overlayResize = (id: OverlayId, size: { width: number; height: number }): void => OVERLAYS[id].resize(size)
/** The measured overlays that are open. */
export const measuredWins = (): BrowserWindow[] => MEASURED.map((m) => m.win()).filter((w): w is BrowserWindow => w !== null)

// ---- unified HUD ----------------------------------------------------------------------------

/** The Unified HUD is on and stands in for Enemies nearby. */
const replaced = (): boolean => settings.get('unified').enabled && settings.get('unified').replace
// Not replaced by the HUD: it shows only the next two events, the bar (or list) every one alerted.
const timerBarOn = (): boolean => settings.get('timerBar').enabled
const enemiesOn = (): boolean => settings.get('enemies').enabled && !replaced()

/** PvP Log → Open HUD / the window's X. Remembered, so it comes back with the game (its switch, as every overlay's). */
export function setKillFeedOpen(open: boolean): void {
  settings.set('killFeed', { ...settings.get('killFeed'), open })
}


/** The HUD out of move mode (all overlays closing). */
export function resetHudEditing(): void {
  hudEditing = false
}
