/** Typed sends from main to the renderer windows. */
import { BrowserWindow } from 'electron'
import type { EventChannel, EventPayload } from '../shared/ipc.ts'

const windowRoutes = new WeakMap<BrowserWindow, string>()

export function registerWindowRoute(win: BrowserWindow, route: string): void {
  windowRoutes.set(win, route)
}

export function send<C extends EventChannel>(win: BrowserWindow | null, channel: C, payload: EventPayload<C>): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/** Send to the requested renderer routes, or to all windows for shared state. */
export function broadcast<C extends EventChannel>(channel: C, payload: EventPayload<C>, routes?: readonly string[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!routes || routes.includes(windowRoutes.get(win) ?? '')) send(win, channel, payload)
  }
}
