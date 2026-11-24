/**
 * Lokthar (an Aion 2 overlay: pet collection, timers, the guild's field boss sync): a tray app with a floating bubble, a panel and an in-game HUD, fed by the
 * engine (engine/, Rust) running as a child process.
 */
import { app, session } from 'electron'
import { DISPLAY_NAME, LOKTHAR_FOLDER } from '../shared/app.ts'
import { broadcast } from './broadcast.ts'
import { startApplicants } from './applicants.ts'
import { startParty } from './party.ts'
import { pruneRecordings } from './recordings.ts'
import { startFlight } from './flight.ts'
import { startGather } from './gather.ts'
import { startCharacters } from './characters.ts'
import { startSessions } from './sessions.ts'
import { startInventory } from './inventory.ts'
import { startDuty } from './duty.ts'
import { startMerchantSeen } from './merchantSeen.ts'
import { registerIconScheme, startIcons } from './icons.ts'
import { applyGameMap, onGameMapStatus, startGameMap } from './gameMap.ts'
import { startFieldBosses } from './fieldBosses.ts'
import { startHealthWatch } from './health.ts'
import { registerIpc } from './ipc.ts'
import { applyLayoutUpdates, settings } from './settings.ts'
import { startIdleWatch } from './idle.ts'
import { startLokthar } from './lokthar.ts'
import { join } from 'node:path'
import { copyDataFolder, moveDataFolder, OLD_NAMES } from './migrate.ts'
import { startHotkeys, stopHotkeys } from './hotkeys.ts'
import { startDummy } from './dummy.ts'
import { startUpdater } from './updater.ts'
import { startPackets } from './packets.ts'
import { pvpLog } from './pvpLog.ts'
import { stopShopScreen, watchShopScreen } from './shopScreen.ts'
import { startMeter } from './meter.ts'
import { startTimers } from './timers.ts'
import { finishLog, killTrackerNow, log, startNpcapWatch, stopTracker, tracker } from './tracker.ts'
import { tr } from './i18n.ts'
import { setPlayerRegion } from '../shared/timers.ts'
import { createTray, setTrayTooltip } from './tray.ts'
import { applyWindowSettings, closeOverlay, markQuitting, openOverlay, overlayBounds, overlayOpen, setForeground, showPanel, startOnTopWatch } from './windows.ts'

// The name is also the data folder's (%APPDATA%\<name>): Lokthar's is copied in on the first start,
// older names' are moved across once.
app.setName(DISPLAY_NAME)
// The item icons not bundled come through their own scheme (icons.ts): declared before ready.
registerIconScheme()
const copied = copyDataFolder(join(app.getPath('appData'), LOKTHAR_FOLDER), app.getPath('userData'))
/** A moment after a merchant tab or the duty board opens before anything is taken as you having left it (a position the same traffic brings). */
const SHOP_SETTLE_MS = 1_500
const migrated = OLD_NAMES.map((name) => moveDataFolder(join(app.getPath('appData'), name), app.getPath('userData')))
  .filter((m) => m !== 'nothing to move')
  .join('; ')
// Nayel85's build: its own id, so it installs beside Lokthar rather than over it (Windows ties the shortcut to it).
app.setAppUserModelId('com.nayel85.aion2-overlay')

// One instance: a second launch opens the first one's panel instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showPanel())

  void app.whenReady().then(() => {
    startIcons()
    if (migrated) log(`data folder: ${migrated}`)
    if (copied !== 'nothing to copy') log(`data folder: ${copied}`)
    applyLayoutUpdates()
    blockNetwork()
    startHealthWatch()
    startFieldBosses()
    startCharacters()
    startSessions()
    startInventory()
    startDuty()
    startMerchantSeen()
    startApplicants()
    startParty()
    startFlight()
    startGather()
    startGameMap()
    startLokthar()
    startOnTopWatch()
    registerIpc()
    startNpcapWatch()
    createTray()
    startHotkeys()
    // The dashboard is the app: up when it starts, and in the taskbar from then on.
    showPanel()

    // The player's region: the rifts' windows (Abyss Points' sources) and the corridors' returns on its clock.
    setPlayerRegion(settings.get('timers').region)
    settings.onChanged((all) => {
      broadcast('settings:changed', all)
      applyWindowSettings()
      applyGameMap()
      setPlayerRegion(all.timers.region)
    })
    startMeter()
    pruneRecordings()
    startDummy()
    startUpdater()
    startPackets()
    // An alt-tab away from the game hides the overlays; back to it shows them.
    let gameInFront = true
    tracker.onEvent('focus', (ev) => {
      gameInFront = ev['game'] === true
      setForeground(ev['game'] === true, ev['app'] === true)
    })
    // A window opened by a screen of the game: the Black Cloud Merchant's pets worth buying as a tab
    // of its shop opens, the duty board's advice as you open it, reroll it or take a mission. The game
    // says nothing when that screen is closed, so the window closes when you are plainly out of it:
    // you moved or fought, Map V2 found the game's map again (the screen covered it), or the screen is
    // gone (shopScreen.ts: one watched at a time, the two never up together). Opened again, it is back.
    const SCREENS = ['merchant', 'duty'] as const
    type Screen = (typeof SCREENS)[number]
    const screenAt: Record<Screen, { at: number; position: string } | null> = { merchant: null, duty: null }
    const openedBy = (id: Screen): void => {
      openOverlay(id)
      screenAt[id] = { at: Date.now(), position: String(tracker.nearby().position) }
      if (overlayOpen(id)) watchShopScreen({ open: () => overlayOpen(id), window: () => overlayBounds(id), gameInFront: () => gameInFront, gone: (share) => left(id, `its screen is gone (${Math.round(share * 100)}% changed)`, true) })
    }
    // `seen`: told by the screen itself, so taken at once (the settling is for the packets' signs).
    const left = (id: Screen, why: string, seen = false): void => {
      const at = screenAt[id]
      if (!at || (!seen && Date.now() - at.at < SHOP_SETTLE_MS)) return
      screenAt[id] = null
      stopShopScreen()
      log(`${id} window closed: ${why}`)
      closeOverlay(id)
    }
    const leftAll = (why: string): void => SCREENS.forEach((id) => left(id, why))
    tracker.onShop(() => openedBy('merchant'))
    tracker.onEvent('dutyBoard', (ev) => ev['opened'] === true && openedBy('duty'))
    tracker.onEvent('dutyTaken', () => openedBy('duty'))
    tracker.onEvent('nearby', () => SCREENS.forEach((id) => screenAt[id] && String(tracker.nearby().position) !== screenAt[id]!.position && left(id, 'you moved')))
    tracker.onEvent('combat', () => leftAll('you are fighting'))
    onGameMapStatus((status, was) => status === 'found' && was !== 'found' && leftAll("the game's map is back"))
    tracker.onStatus((status) => {
      const what = {
        starting: 'starting…',
        listening: 'waiting for the game',
        locked: status.gameActive ? 'tracking' : 'connected, no game traffic',
        idle: 'asleep until Aion 2 starts',
        stopped: 'replay finished',
        error: 'error',
        exited: 'restarting',
      }[status.state]
      setTrayTooltip(`${DISPLAY_NAME}: ${tr(what)}`)
    })

    // The bubble, the HUD and the tracker, once it is known whether the game is running.
    void startIdleWatch()
    startTimers()
  })

  /**
   * No network: the windows only ever load the app's own files, so any http(s) or websocket
   * request from them (a stray URL, a library reaching out) is cancelled, on top of index.html's
   * CSP. A development run still reaches its local Vite server. Links the user clicks open in the
   * browser (windows.ts) and are not affected, nor is the Lokthar sync, which is off unless turned
   * on and goes from the main process to the one address in Settings (lokthar.ts).
   */
  function blockNetwork(): void {
    const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }
    session.defaultSession.webRequest.onBeforeRequest(filter, (details, done) => {
      const host = new URL(details.url).hostname
      const devServer = !app.isPackaged && (host === 'localhost' || host === '127.0.0.1')
      if (!devServer) log(`network: blocked ${details.url}`)
      done({ cancel: !devServer })
    })
  }

  // Tray app: closing every window is not quitting.
  app.on('window-all-closed', () => undefined)

  app.on('before-quit', () => {
    markQuitting()
    stopHotkeys()
    stopTracker()
  })
  app.once('will-quit', (event) => {
    const saved = pvpLog.flush()
    const logged = finishLog()
    if (saved || logged) {
      event.preventDefault()
      void Promise.all([saved, logged]).then(() => app.quit())
    }
  })
  // Windows children outlive their parent: make sure the engine goes with us.
  process.on('exit', killTrackerNow)
}
