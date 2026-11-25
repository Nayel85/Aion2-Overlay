/** Every invoke handler, typed against the contract in shared/ipc.ts. */
import { app, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { STORAGE_CLEARABLE, type StorageId } from '../shared/storage.ts'
import { OVERLAY_IDS, type OverlayId } from '../shared/ipc.ts'
import { dummy } from './dummy.ts'
import { updater } from './updater.ts'
import { meterState } from './meter.ts'
import { applicantStore } from './applicants.ts'
import { partyStore } from './party.ts'
import { flightStore } from './flight.ts'
import { gatherStore } from './gather.ts'
import { characterStore } from './characters.ts'
import { restartSession, sessionStore } from './sessions.ts'
import { inventoryStore } from './inventory.ts'
import { dutyStore } from './duty.ts'
import { expeditionsStore } from './expeditions.ts'
import { merchantSeen } from './merchantSeen.ts'
import { itemDetails } from './itemDetails.ts'
import { gameMap, regionDisplay } from './gameMap.ts'
import { mapDetail } from './gameMapDetail.ts'
import { lokthar } from './lokthar.ts'
import { pvpLog } from './pvpLog.ts'
import { packets } from './packets.ts'
import { settings } from './settings.ts'
import { sounds } from './sounds.ts'
import { clearStorage, storageUsage } from './storage.ts'
import { timers } from './timers.ts'
import { logPath, tracker } from './tracker.ts'
import {
  bubbleDragEnded,
  closeDetails,
  closeOverlay,
  detailsDragEnded,
  detailsSource,
  hidePanel,
  isArranging, setArranging,
  markQuitting,
  minimizePanel,
  moveBubble,
  moveDetails,
  openDetails,
  overlayDragEnded,
  overlayMove,
  overlayResetPosition,
  overlayResize,
  overlaysHidden,
  setHudEditing,
  setKillFeedOpen,
  showCharactersInPanel,
  showPanel,
  showPetInPanel,
  showTimersInPanel,
  toggleMaximizePanel,
  toggleOverlays,
  togglePanel,
} from './windows.ts'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '../shared/ipc.ts'
import type { SettingKey } from '../shared/settings.ts'
import { SETTINGS_DEFAULTS } from '../shared/settings.ts'

function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>,
): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as InvokeArgs<C>)))
}

/** A saved fight's id: one file name, nothing that leaves the history folder. */
const isPlainId = (id: unknown): id is string => typeof id === 'string' && /^[\w.-]{1,128}$/.test(id) && !id.includes('..')

const isOverlay = (id: unknown): id is OverlayId => (OVERLAY_IDS as readonly unknown[]).includes(id)
const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === 'object' && p !== null && Number.isFinite((p as { x: unknown }).x) && Number.isFinite((p as { y: unknown }).y)

export function registerIpc(): void {
  handle('app:info', () => ({ version: app.getVersion(), settingsFile: settings.path, logFile: logPath() }))
  handle('app:quit', () => {
    markQuitting()
    app.quit()
  })
  handle('app:openPath', (path) => {
    // Only the app's own files: the settings and the collection.
    const allowed = [settings.path, tracker.status().dataFile, logPath()].filter(Boolean)
    if (allowed.includes(path)) shell.showItemInFolder(path)
  })

  handle('settings:all', () => settings.all())
  handle('settings:set', (key, value) => {
    if (!(key in SETTINGS_DEFAULTS)) return
    settings.set(key as SettingKey, value)
  })

  handle('tracker:get', (fullPvp = true) => ({ status: tracker.status(), pets: tracker.pets(), nearby: tracker.nearby(), shop: tracker.shop(), kina: tracker.kina(), abyss: tracker.abyss(), rifts: tracker.rifts(), fieldBosses: tracker.fieldBosses(), pvp: fullPvp ? tracker.pvp() : [], pvpSummary: pvpLog.summary(), cubes: tracker.cubes(), enemies: tracker.enemies(), target: tracker.target() }))
  handle('tracker:clearPvp', () => tracker.clearPvp())
  handle('panel:open', () => showPanel())
  handle('panel:characters', () => showCharactersInPanel())
  handle('killfeed:open', () => setKillFeedOpen(true))
  handle('killfeed:close', () => setKillFeedOpen(false))
  handle('tracker:setSouls', (pet, souls) => {
    if (Number.isInteger(pet) && Number.isInteger(souls) && souls >= 0 && souls < 100000) tracker.setSouls(pet, souls)
  })
  handle('tracker:setName', (pet, name) => {
    if (Number.isInteger(pet) && typeof name === 'string' && name.trim()) tracker.setName(pet, name.trim().slice(0, 60))
  })
  handle('tracker:restart', () => tracker.restart())
  handle('gamemap:pick', () => gameMap.pick())
  handle('gamemap:setRegion', (box, view) =>
    gameMap.setRegion(box && isPoint({ x: box.width, y: box.height }) && isPoint(box) ? box : null, view && isPoint({ x: view.width, y: view.height }) ? view : null),
  )
  handle('gamemap:report', (state) => {
    if (state && typeof state.status === 'string') gameMap.report(state)
  })
  handle('gamemap:requestPreview', () => gameMap.requestPreview())
  handle('gamemap:get', () => gameMap.state())
  handle('gamemap:restart', () => gameMap.restart())
  handle('gamemap:log', (line) => gameMap.log(String(line)))
  handle('gamemap:openLog', () => gameMap.openLog())
  handle('gamemap:display', () => regionDisplay())
  handle('gamemap:grab', (w, h) => gameMap.grab(Math.round(Number(w)), Math.round(Number(h))))
  handle('gamemap:detail', (key, cols, rows, col, row) => mapDetail.get(key, cols, rows, col, row))
  handle('gamemap:saveFeatures', (key, data, col, row) => mapDetail.saveFeatures(key, data, col, row))
  handle('applicants:get', () => applicantStore.all())
  handle('party:get', () => partyStore.all())
  handle('overlay:moveTo', (id, to) => {
    if (isOverlay(id) && isPoint(to)) overlayMove(id, to)
  })
  handle('overlay:dragEnd', (id) => {
    if (isOverlay(id)) overlayDragEnded(id)
  })
  handle('overlay:resetPosition', (id) => {
    if (isOverlay(id)) overlayResetPosition(id)
  })
  handle('overlay:resize', (id, size) => {
    if (isOverlay(id) && isPoint({ x: size?.width, y: size?.height })) overlayResize(id, size)
  })
  handle('flight:get', () => flightStore.get())
  handle('gather:get', () => gatherStore.get())
  handle('applicants:dismiss', (character) => {
    if (Number.isInteger(character)) applicantStore.dismiss(character)
  })
  handle('applicants:clear', () => applicantStore.clear())
  handle('characters:get', () => characterStore.all())
  handle('sessions:get', () => sessionStore.all())
  handle('inventory:get', () => inventoryStore.all())
  handle('duty:get', () => dutyStore.get())
  handle('expeditions:get', () => expeditionsStore.get())
  handle('merchant:seen', () => merchantSeen.get())
  handle('duty:close', () => closeOverlay('duty'))
  handle('inventory:arrivals', () => inventoryStore.arrivals())
  handle('items:details', (item: number) => itemDetails(item))
  handle('characters:refresh', (id) => characterStore.refresh(id))
  handle('characters:forget', (id) => characterStore.forget(id))
  handle('lokthar:test', () => lokthar.test())
  handle('lokthar:sync', () => lokthar.syncNow())
  handle('lokthar:last', () => lokthar.last())
  handle('tracker:resetSession', () => restartSession())

  handle('bubble:moveTo', (to) => {
    if (isPoint(to)) moveBubble(to)
  })
  handle('bubble:dragEnd', () => bubbleDragEnded())
  handle('panel:toggle', () => togglePanel())
  handle('panel:hide', () => hidePanel())
  handle('panel:arranging', () => isArranging())
  handle('panel:arrange', (on) => setArranging(on))
  handle('panel:minimize', () => minimizePanel())
  handle('panel:maximize', () => toggleMaximizePanel())

  handle('hud:setEditing', (editing) => setHudEditing(Boolean(editing)))

  handle('merchant:close', () => closeOverlay('merchant'))
  handle('merchant:bought', (item) => {
    if (Number.isInteger(item)) tracker.markBought(item)
  })
  handle('timers:get', () => timers.alerting())
  handle('timers:dismiss', () => timers.dismiss())
  handle('timers:open', () => {
    const ids = timers.alerting().map((a) => a.id)
    timers.dismiss()
    showTimersInPanel(ids)
  })
  handle('panel:showPet', (pet) => {
    if (Number.isInteger(pet)) showPetInPanel(pet)
  })

  handle('meter:get', () => meterState.meter())
  handle('meter:reset', () => meterState.reset())
  handle('skills:get', () => meterState.personal())
  handle('update:get', () => updater.get())
  handle('update:peek', () => updater.peek())
  handle('update:check', () => updater.check())
  handle('update:download', () => updater.download())
  handle('update:install', () => updater.install())
  handle('dummy:get', () => dummy.get())
  handle('dummy:start', (name) => dummy.start(typeof name === 'string' ? name : undefined))
  handle('dummy:stop', (save) => dummy.stop(save === true))
  handle('dummy:newGroup', () => dummy.newGroup())
  handle('dummy:delete', (id) => {
    if (typeof id === 'string') dummy.remove(id)
  })
  handle('recordings:get', () => meterState.recordings())
  handle('storage:get', () => storageUsage())
  handle('storage:clear', async (id) => {
    if (typeof id === 'string' && STORAGE_CLEARABLE.includes(id as StorageId)) await clearStorage(id as StorageId)
    return storageUsage()
  })
  handle('packets:get', () => packets.get())
  handle('packets:set', (on) => packets.set(on === true))
  handle('packets:mark', (text) => packets.mark(typeof text === 'string' ? text : ''))
  handle('packets:show', () => packets.show())
  handle('sounds:pickCustom', (slot) => sounds.pickCustom(slot))
  handle('sounds:custom', (slot) => sounds.custom(slot))
  handle('recordings:set', (on) => meterState.record(on === true))
  handle('recordings:open', async () => {
    const dir = meterState.recordingsDir()
    if (!dir) return
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
  handle('overlays:toggle', () => toggleOverlays())
  handle('overlays:hidden', () => overlaysHidden())
  handle('buffs:get', () => meterState.buffs())
  handle('details:open', (source) => {
    const ok = source?.kind === 'live' ? Number.isInteger(source.target) : (source?.kind === 'saved' || source?.kind === 'run' || source?.kind === 'pvp') && isPlainId(source.id)
    if (ok) openDetails(source)
  })
  handle('details:get', () => {
    const source = detailsSource()
    if (source?.kind === 'run') return dummy.details(source.id)
    return source ? meterState.details(source, true) : null
  })
  handle('details:view', (source) => {
    const ok = source?.kind === 'live' ? Number.isInteger(source.target) : (source?.kind === 'saved' || source?.kind === 'run' || source?.kind === 'pvp') && isPlainId(source.id)
    if (!ok) return null
    return source.kind === 'run' ? dummy.details(source.id) : meterState.details(source)
  })
  handle('details:close', () => closeDetails())
  handle('details:moveTo', (to) => {
    if (isPoint(to)) moveDetails(to)
  })
  handle('details:dragEnd', () => detailsDragEnded())
  handle('history:list', () => meterState.history())
  handle('history:bests', () => meterState.bests())
  handle('history:delete', (id) => {
    if (isPlainId(id)) meterState.deleteFight(id)
  })
}
