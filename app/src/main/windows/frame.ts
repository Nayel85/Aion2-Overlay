/**
 * How every window of the app is made and placed (windows.ts, windows/overlays.ts): a frameless,
 * transparent window on top of the game, never taking its focus; loaded on its route; kept on its display.
 */
import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { registerWindowRoute } from '../broadcast.ts'
import { settings } from '../settings.ts'
import { log } from '../tracker.ts'

/** The margin kept from a display's edges. */
export const EDGE = 24

export const alive = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()

export function overlayWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
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
export function measured(win: BrowserWindow, size: { width: number; height: number }): { width: number; height: number } {
  if (size.width > 0 && size.height > 0) return size
  const { width, height } = win.getBounds()
  return { width, height }
}

/** Keep a rectangle on a display: on the one it mostly overlaps, inside its work area. */
export function clampToDisplay(rect: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(rect).workArea
  return {
    ...rect,
    x: Math.round(Math.min(Math.max(rect.x, area.x), area.x + area.width - rect.width)),
    y: Math.round(Math.min(Math.max(rect.y, area.y), area.y + area.height - rect.height)),
  }
}
