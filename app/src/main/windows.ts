/**
 * The app's three windows, all loading the same renderer on different routes:
 *
 *   bubble  #/bubble  a small floating icon: drag it anywhere, click it to open the panel
 *   panel   #/panel   the dashboard: the app itself, always in the taskbar; the bubble brings it up
 *   hud       #/hud       the in-game overlay: click-through, sized to its content
 *   merchant  #/merchant  the Black Cloud Merchant's pets worth buying: opened when a tab of the
 *                         shop is, always movable, closed with its X
 *   minimap   #/minimap   the map overlay: your zone around you, tracked pets' spawns, Hidden Cubes
 *   skills    #/skills    your own damage on the meter's target, skill by skill: with the meter
 *   buffs     #/buffs     your buffs and debuffs, with what is left of each
 *   training  #/training  the Training overlay: a training dummy run's clock and DPS, start and stop
 *   cc        #/cc        the CC / Debuffs banner: stunned, rooted... while it lasts; click-through
 *   details   #/details   a fight's breakdown by player and skill: opened from a meter row or a
 *                         saved fight in the History page, moved by its header, closed with its X
 *   timerbar  #/timerbar  the timers with an alert on, as a bar of countdowns: open while the game
 *                         is, sized to what it shows (hidden with nothing within 13 hours)
 *   unified   #/unified   the Unified HUD: one small bar at the top of the game, unfolded on hover,
 *                         showing things as they matter; sized to what it shows, around its top centre
 *   killfeed  #/killfeed  player kills around you, as they happen: opened from the PvP page
 *   applicants #/applicants join requests to your party, as people apply (its own widget; up while there are any)
 *   party      #/party      party frames: each member's HP, while in a party
 *   gather     #/gather     a gathering's outcome as it starts (fail, rank up, x2); click-through
 *   flight     #/flight     the flight timer: seconds of flight left, while flying or refilling; click-through
 *   meter     #/meter     the DPS meter: open while the game is (and the meter is on), movable by
 *                         its header, sized to its rows
 *
 * Overlay rules carried over from marnis-app (docs/09 there): 'screen-saver' level so they sit
 * above a borderless game (exclusive fullscreen cannot be drawn over by anything), shown with
 * showInactive() so they never take focus from the game, and each window only as large as what it
 * shows. A big transparent window made the game drop frames on every alt-tab there.
 *
 * While the game is closed the bubble and the HUD do not exist at all (idle.ts): the panel can
 * still be opened from the tray, where the bubble would be. While another program is in front
 * (an alt-tab), every window hides, and comes back with the game (setForeground).
 */
import { applyGameMap } from './gameMap.ts'
import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { broadcast, registerWindowRoute, send } from './broadcast.ts'
import { DISPLAY_NAME } from '../shared/app.ts'
import { settings } from './settings.ts'
import { log, tracker } from './tracker.ts'
import type { EventChannels, OverlayId } from '../shared/ipc.ts'
import type { DetailsSource } from '../shared/meter.ts'
import type { Point } from '../shared/settings.ts'
import type { TimerId } from '../shared/timers.ts'

const BUBBLE_SIZE = 64
const EDGE = 24

let bubble: BrowserWindow | null = null
let panel: BrowserWindow | null = null
let details: BrowserWindow | null = null
let detailsShowing: DetailsSource | null = null
let hudEditing = false
let quitting = false
const panelListeners = new Set<(visible: boolean) => void>()

/** Told when the panel is shown or hidden. */
export function onPanelVisible(fn: (visible: boolean) => void): () => void {
  panelListeners.add(fn)
  return () => panelListeners.delete(fn)
}

/** The dashboard is up on screen: shown and not minimised to the taskbar. */
export function panelVisible(): boolean {
  return alive(panel) && panel.isVisible() && !panel.isMinimized()
}

export function markQuitting(): void {
  quitting = true
}

const alive = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()

function overlayWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    icon: join(__dirname, '../renderer/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Overlays spend a lot of time hidden or behind the game; a throttled renderer stops
      // laying out and observing, and then never asks to be shown again.
      backgroundThrottling: false,
      // The timers' chime plays without a click first (Chromium's default wants one).
      autoplayPolicy: 'no-user-gesture-required',
      // Chromium's spellchecker can download dictionaries; nothing here needs it.
      spellcheck: false,
    },
    ...options,
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setContentProtection(settings.get('hideFromCapture'))
  // Links go to the browser; the windows themselves never navigate away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(url.startsWith('file://') || (dev && url.startsWith(dev)))) event.preventDefault()
  })
  // A window's errors in the app's log, with its page: one that fails shows nothing, and says so here.
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') log(`window ${win.webContents.getURL().split('#')[1] ?? '?'}: ${e.level} ${e.message} (${e.sourceId.split('/').pop()}:${e.lineNumber})`)
  })
  win.webContents.on('render-process-gone', (_e, d) => log(`window ${win.webContents.getURL().split('#')[1] ?? '?'}: gone (${d.reason})`))
  return win
}

export function load(win: BrowserWindow, route: string): void {
  registerWindowRoute(win, route)
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && dev) void win.loadURL(`${dev}#/${route}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

/**
 * The size a window's page measured itself at, for moving it: never the window's own size. On a
 * scaled display (125%, 150%) Windows can hand a window back a pixel larger than it was set to, so
 * a move that kept the window's size grew it a little each time; the window is transparent, so it
 * did not show, but the room left to drag it on the screen shrank with every drag. Before the page
 * has measured itself, the window's size.
 */
function measured(win: BrowserWindow, size: { width: number; height: number }): { width: number; height: number } {
  if (size.width > 0 && size.height > 0) return size
  const { width, height } = win.getBounds()
  return { width, height }
}

/** Keep a rectangle on a display: on the one it mostly overlaps, inside its work area. */
function clampToDisplay(rect: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(rect).workArea
  return {
    ...rect,
    x: Math.round(Math.min(Math.max(rect.x, area.x), area.x + area.width - rect.width)),
    y: Math.round(Math.min(Math.max(rect.y, area.y), area.y + area.height - rect.height)),
  }
}

// ---- bubble ---------------------------------------------------------------------------------

function bubbleBounds(at: Point | null): Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  const p = at ?? { x: area.x + area.width - BUBBLE_SIZE - EDGE, y: area.y + area.height - BUBBLE_SIZE - EDGE }
  return clampToDisplay({ x: p.x, y: p.y, width: BUBBLE_SIZE, height: BUBBLE_SIZE })
}

export function createBubble(): BrowserWindow {
  if (alive(bubble)) return bubble
  // Focusable, unlike the HUD: with the game in front, Windows ate the mouse-down on a window that
  // can never be activated and passed on only the release, so clicks never opened the panel
  // (traced 2026-10-10: pointerup and mouseup arrived, pointerdown never). It still appears with
  // showInactive(), so it takes focus only when clicked, which opens the panel anyway.
  const win = overlayWindow({ ...bubbleBounds(settings.get('bubble')) })
  bubble = win
  win.once('ready-to-show', () => reveal(win))
  win.on('closed', () => (bubble = null))
  load(win, 'bubble')
  return win
}

export function moveBubble(to: Point): void {
  if (!alive(bubble)) return
  bubble.setBounds(clampToDisplay({ x: to.x, y: to.y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }))
}

export function bubbleDragEnded(): void {
  if (!alive(bubble)) return
  const { x, y } = bubble.getBounds()
  settings.set('bubble', { x, y })
}

// ---- dashboard (the panel) ------------------------------------------------------------------

/** The dashboard's smallest size: the sidebar and a page beside it. */
const DASHBOARD_MIN = { width: 900, height: 600 }

/** Where it was left, at the size it was left; the middle of the primary display the first time. */
function dashboardBounds(): Rectangle {
  const { width, height } = settings.get('panel')
  const at = settings.get('panelPosition')
  const area = screen.getPrimaryDisplay().workArea
  const w = Math.min(width, area.width)
  const h = Math.min(height, area.height)
  const p = at ?? { x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2) }
  return clampToDisplay({ x: p.x, y: p.y, width: w, height: h })
}

/**
 * The dashboard: the app itself, a window of its own (not an overlay): resizable, always in the
 * taskbar, with its own title bar (DashboardPage). Opened when the app starts; its X (and Alt+F4)
 * minimises it to the taskbar, as does clicking from it into the game (panelLeftForGame), and
 * only quitting (the tray) closes it. Not transparent, as Windows
 * will not resize a transparent window.
 */
export function createPanel(): BrowserWindow {
  if (alive(panel)) return panel
  const win = overlayWindow({
    ...dashboardBounds(),
    transparent: false,
    backgroundColor: '#09090b',
    resizable: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    hasShadow: true,
    minWidth: DASHBOARD_MIN.width,
    minHeight: DASHBOARD_MIN.height,
    title: DISPLAY_NAME,
    alwaysOnTop: settings.get('panelOnTop'),
  })
  if (!settings.get('panelOnTop')) win.setAlwaysOnTop(false)
  panel = win
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    hidePanel()
  })
  // Minimised from the taskbar or its own button, and back.
  win.on('minimize', () => panelShown(false))
  win.on('restore', () => panelShown(true))
  win.on('closed', () => (panel = null))
  win.on('blur', () => (panelBlurredAt = Date.now()))
  win.on('focus', syncArranging)
  // Its size and place are remembered as they change (not maximised or minimised ones).
  let saveTimer: NodeJS.Timeout | null = null
  const remember = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
      const { x, y, width, height } = win.getBounds()
      settings.set('panel', { width, height })
      settings.set('panelPosition', { x, y })
    }, 500)
  }
  win.on('resize', remember)
  win.on('move', remember)
  win.on('maximize', () => send(win, 'panel:maximized', true))
  win.on('unmaximize', () => send(win, 'panel:maximized', false))
  load(win, 'panel')
  return win
}

export function showPanel(): void {
  const win = createPanel()
  const reveal = (): void => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    panelShown(true)
  }
  if (win.webContents.isLoading()) win.once('ready-to-show', reveal)
  else reveal()
}

export function minimizePanel(): void {
  if (alive(panel)) panel.minimize()
}

export function toggleMaximizePanel(): void {
  if (!alive(panel)) return
  if (panel.isMaximized()) panel.unmaximize()
  else panel.maximize()
}

/**
 * Open the panel on a pet's drop locations (a click in the merchant window). A panel that is still
 * loading is told once it has: its page listens from when it mounts.
 */
export function showPetInPanel(pet: number): void {
  sendToPanel('panel:showPet', pet)
}

/** The dashboard on these timers' page, them highlighted: a click on the bubble during an alert. */
export function showTimersInPanel(ids: TimerId[]): void {
  sendToPanel('panel:showTimers', ids)
}

/** The dashboard on the Characters page: a click on the Unified HUD's Odyle energy. */
export function showCharactersInPanel(): void {
  sendToPanel('panel:showCharacters', null)
}

/** Show the panel (open if hidden, never toggled shut) and tell it what to show, once loaded. */
function sendToPanel<C extends 'panel:showPet' | 'panel:showTimers' | 'panel:showCharacters'>(channel: C, payload: EventChannels[C]): void {
  showPanel()
  const win = panel
  if (!alive(win)) return
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** The dashboard's X: down to the taskbar, where it stays. */
export function hidePanel(): void {
  if (alive(panel) && !panel.isMinimized()) panel.minimize()
}

/** When the dashboard last lost the keyboard: a click on the game right after hides it. */
let panelBlurredAt = 0
const CLICKED_AWAY_MS = 1_500

/**
 * The game came to the front: if that was you leaving the dashboard for it (a click on the game, an
 * alt-tab), down it goes, like a modal clicked outside. Not when the dashboard never had the focus
 * (Alt+E over the game can open it without), so it is never hidden as it opens.
 */
function panelLeftForGame(): void {
  if (!settings.get('panelHideOnGame') || !panelVisible()) return
  if (panel?.isFocused() || Date.now() - panelBlurredAt > CLICKED_AWAY_MS) return
  hidePanel()
}

/** The dashboard came up on screen, or went down to the taskbar. */
let panelUp = false
function panelShown(up: boolean): void {
  if (up !== panelUp) {
    panelUp = up
    for (const fn of panelListeners) fn(up)
  }
  syncArranging()
}

/**
 * Arranging the overlays: they show previews, the HUD and the others can be dragged, and take the
 * mouse. While the dashboard is up and, when it stays open over the game (not hidden on a click in
 * the game), while it or an overlay being placed has the focus: a click in the game ends it, so the
 * overlays never catch clicks meant for the game and their previews go.
 */
let arranging = false
/** Asked by a window as it opens: the change alone reaches only those already open. */
export const isArranging = (): boolean => arranging
function arrangingNow(): boolean {
  if (!panelVisible()) return false
  if (settings.get('panelHideOnGame')) return true
  // The dashboard, or an overlay being dragged into place; not the meter or the Unified HUD, which
  // take clicks as you play.
  const focused = BrowserWindow.getFocusedWindow()
  return focused !== null && (focused === panel || MEASURED.some((m) => !m.takesClicks && m.win() === focused))
}
function syncArranging(): void {
  const on = arrangingNow()
  if (on === arranging) return
  arranging = on
  log(`overlays: ${on ? 'being placed (the dashboard in front)' : 'placed'}`)
  broadcast('panel:visible', on)
  // The HUD shows (even when empty) and takes the mouse; otherwise back to click-through, so it
  // never catches a click meant for the game.
  setHudEditing(on, false)
  for (const m of MEASURED) m.panelUp(on)
  // The ones opened by their module (the merchant with the shop) open now too, to be placed.
  if (on) for (const m of MEASURED) if (m.manual && m.placeable) m.create()
}
// Focus moving between the app's windows (a drag starts on an overlay) and the game: a moment
// later, once the window taking it has it.
app.on('browser-window-focus', () => setTimeout(syncArranging, 50))
app.on('browser-window-blur', () => setTimeout(syncArranging, 50))
settings.onChanged(syncArranging)

/**
 * Alt+E and the tray: the dashboard down when it is up where you can see it (in front, or kept on
 * top of the game), else up. One left behind the game (not on top) comes forward instead.
 */
export function togglePanel(): void {
  if (panelVisible() && (panel?.isFocused() || panel?.isAlwaysOnTop())) hidePanel()
  else showPanel()
}

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
function measuredOverlay(o: {
  route: string
  enabled: () => boolean
  saved: () => Point | null
  /** Where it goes before it is placed, given the size its page measured (0 × 0 before). */
  fallback: (size: { width: number; height: number }) => Point
  save: (p: Point) => void
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
        log(`overlay ${o.route}: ${win.isVisible() ? 'shown' : `held hidden (${gameAway ? 'game not in front' : 'overlays hidden by hand'})`} at ${p.x},${p.y} ${size.width}x${size.height}`)
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
      if (o.clickThrough && !arranging) w.setIgnoreMouseEvents(true)
      else if (o.clickThrough) w.setFocusable(true)
      win = w
      size = { width: 0, height: 0 }
      log(`overlay ${o.route}: opened${arranging ? ' (being placed)' : ''}`)
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
    if (arranging) setHudEditing(true, false)
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
const OVERLAYS: Record<OverlayId, ReturnType<typeof measuredOverlay>> = {
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
}
const MEASURED = Object.values(OVERLAYS)
/** Open every overlay that is on (as the game starts): each shows once its page has measured itself. */
export function openOverlays(): void {
  for (const m of MEASURED) if (!m.manual) m.create()
}
/** One overlay opened (if on) or closed, by its module (the merchant with the shop). */
export const openOverlay = (id: OverlayId): void => OVERLAYS[id].create()
export const closeOverlay = (id: OverlayId): void => OVERLAYS[id].close()
export const overlayOpen = (id: OverlayId): boolean => OVERLAYS[id].win() !== null
export const overlayBounds = (id: OverlayId): Rectangle | null => OVERLAYS[id].bounds()
export const overlayMove = (id: OverlayId, to: Point): void => OVERLAYS[id].move(to)
export const overlayDragEnded = (id: OverlayId): void => OVERLAYS[id].dragEnded()
export const overlayResize = (id: OverlayId, size: { width: number; height: number }): void => OVERLAYS[id].resize(size)
/** The measured overlays that are open. */
const measuredWins = (): BrowserWindow[] => MEASURED.map((m) => m.win()).filter((w): w is BrowserWindow => w !== null)

// ---- details ----------------------------------------------------------------------------------

const DETAILS_SIZE = { width: 600, height: 720 }

function detailsPosition(): Point {
  const saved = settings.get('detailsWindow')
  if (saved) return saved
  const area = screen.getPrimaryDisplay().workArea
  return { x: Math.round(area.x + (area.width - DETAILS_SIZE.width) / 2), y: Math.round(area.y + (area.height - DETAILS_SIZE.height) / 2) }
}

/** What the Details window shows, if it is open. */
export function detailsSource(): DetailsSource | null {
  return alive(details) ? detailsShowing : null
}

/** Open the Details window on `source`, or point the open one at it. */
export function openDetails(source: DetailsSource): void {
  detailsShowing = source
  if (alive(details)) {
    broadcast('details:source', source)
    reveal(details)
    return
  }
  const p = detailsPosition()
  const win = overlayWindow({ ...clampToDisplay({ x: p.x, y: p.y, ...DETAILS_SIZE }) })
  details = win
  win.on('closed', () => {
    details = null
    detailsShowing = null
  })
  win.once('ready-to-show', () => reveal(win))
  load(win, 'details')
}

export function closeDetails(): void {
  if (alive(details)) details.destroy()
  details = null
  detailsShowing = null
}

export function moveDetails(to: Point): void {
  if (!alive(details)) return
  details.setBounds(clampToDisplay({ x: to.x, y: to.y, ...DETAILS_SIZE }))
}

export function detailsDragEnded(): void {
  if (!alive(details)) return
  const { x, y } = details.getBounds()
  settings.set('detailsWindow', { x, y })
}

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


// ---- the game in front ----------------------------------------------------------------------

/**
 * How long another program must be in front before the overlays hide, so holding Alt+Tab (the
 * switcher is in front meanwhile) doesn't flicker them. A2Tools DPS Meter waits 1.5 s for this.
 */
const AWAY_GRACE_MS = 1000

/** Another program is in front (not the game, not one of ours): the overlays are hidden. */
let gameAway = false
/** The windows hidden for it, shown again when the game is back. */
const awayHidden = new Set<BrowserWindow>()
let awayTimer: NodeJS.Timeout | null = null

/** Every overlay hidden by hand (Alt+Shift+E) until shown again; the dashboard stays. */
let overlaysOff = false

/** Hidden now, by the game being away or by hand: shows once neither holds it. */
const held = (win: BrowserWindow): boolean => gameAway || (overlaysOff && win !== panel)

/** Show an overlay without taking the focus; while it is held hidden, once it is not. */
function reveal(win: BrowserWindow): void {
  if (held(win)) awayHidden.add(win)
  else win.showInactive()
}

/** Show again the windows hidden for a reason that is gone. */
function restoreHidden(): void {
  for (const win of [...awayHidden]) {
    if (alive(win) && held(win)) continue
    awayHidden.delete(win)
    // The overlays decide below whether they have anything to show.
    if (alive(win) && !measuredWins().includes(win)) win.showInactive()
  }
  for (const m of MEASURED) m.refresh()
}

/** Alt+Shift+E: every overlay off, or back on. The dashboard is left as it is. True when off. */
export function toggleOverlays(): boolean {
  overlaysOff = !overlaysOff
  applyGameMap()
  if (overlaysOff) {
    for (const win of [bubble, details, ...measuredWins()]) {
      if (!alive(win) || !win.isVisible()) continue
      awayHidden.add(win)
      win.hide()
    }
  } else {
    restoreHidden()
  }
  broadcast('overlays:hidden', overlaysOff)
  return overlaysOff
}

export const overlaysHidden = (): boolean => overlaysOff
export const gameMapHidden = (): boolean => overlaysOff || gameAway

/** What is in front, as the engine sees it (Windows): the game, one of our windows, or neither. */
export function setForeground(game: boolean, app: boolean): void {
  if (game) panelLeftForGame()
  const away = settings.get('hideWhenGameAway') && !game && !app
  if (awayTimer) clearTimeout(awayTimer)
  awayTimer = null
  if (away === gameAway) return
  if (away) {
    awayTimer = setTimeout(() => {
      gameAway = true
      log('overlays: hidden, another program in front')
      applyGameMap()
      for (const win of [bubble, details, ...measuredWins()]) {
        if (!alive(win) || !win.isVisible()) continue
        awayHidden.add(win)
        win.hide()
      }
      // The dashboard stays in the taskbar: it only stops sitting above the other program.
      if (alive(panel)) panel.setAlwaysOnTop(false)
    }, AWAY_GRACE_MS)
    return
  }
  gameAway = false
  log(`overlays: back, ${game ? 'the game' : 'the app'} in front`)
  applyGameMap()
  if (alive(panel)) panel.setAlwaysOnTop(settings.get('panelOnTop'), 'screen-saver')
  restoreHidden()
}

// ---- all ------------------------------------------------------------------------------------

const ON_TOP_EVERY_MS = 5_000

/**
 * Keep the overlays above the game. Windows can leave an always-on-top window below a game that
 * takes the foreground, with its topmost flag still set (seen 2026-10-13: the bubble 10 places below
 * the borderless game window, invisible, while the app thought it was showing). So every few seconds
 * each visible overlay is put back on top; moveTop() does not take the focus, and the game keeps it.
 * The panel is left alone: it is a window to click into, and has its own on-top setting.
 */
export function startOnTopWatch(): void {
  setInterval(() => {
    for (const win of [bubble, details, ...measuredWins()]) {
      if (!alive(win) || !win.isVisible()) continue
      win.setAlwaysOnTop(true, 'screen-saver')
      win.moveTop()
    }
  }, ON_TOP_EVERY_MS).unref()
}

/** Settings that change how the windows behave, applied live. */
export function applyWindowSettings(): void {
  const hidden = settings.get('hideFromCapture')
  for (const w of [bubble, panel, details, ...measuredWins()]) if (alive(w)) w.setContentProtection(hidden)
  // Each overlay sized to its page: closed when turned off, opened when turned on while the others are up.
  // Each overlay: closed when turned off; turned on, opened with the others while they are up (the
  // bubble is, awake), and the ones opened by their module while being placed.
  for (const m of MEASURED) {
    if (!m.enabled()) m.close()
    else if (m.manual ? arranging && m.placeable : alive(bubble)) m.create()
  }
  if (gameAway && !settings.get('hideWhenGameAway')) setForeground(true, false)
  if (alive(panel) && !gameAway) {
    const onTop = settings.get('panelOnTop')
    panel.setAlwaysOnTop(onTop, 'screen-saver')
  }
}

/**
 * Close the bubble, the HUD, the merchant window and the meter. The dashboard stays: it is the app,
 * in the taskbar.
 */
export function closeOverlays(): void {
  if (alive(bubble)) bubble.destroy()
  for (const m of MEASURED) m.close()
  bubble = null
  awayHidden.clear()
  hudEditing = false

}

/**
 * Replace a window whose renderer cannot be brought back: destroy it and build a fresh one in the
 * same state. A frozen renderer survived reload(), loadURL() and killing its process in testing;
 * a new window always comes back. Returns which window it was.
 */
export function rebuildWindow(win: BrowserWindow): string | null {
  if (win === bubble) {
    win.destroy()
    bubble = null
    createBubble()
    return 'bubble'
  }
  for (const [route, m] of Object.entries(OVERLAYS)) {
    if (win !== m.win()) continue
    m.close()
    m.create()
    return route
  }
  if (win === details) {
    const source = detailsShowing
    win.destroy()
    details = null
    if (source) openDetails(source)
    return 'details'
  }
  if (win === panel) {
    const up = panelVisible()
    win.destroy()
    panel = null
    showPanel()
    // It was down in the taskbar: back there.
    if (!up) hidePanel()
    return 'panel'
  }
  return null
}
