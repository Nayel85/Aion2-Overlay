/**
 * What the app keeps on disk, measured and cleared for the Cache page (shared/storage.ts).
 * Cleared: the map tiles (downloaded again when needed), the browser's own caches, the logs, the
 * update installers left in the temp folder (and at every start: clearUpdates), the packet recordings,
 * and Lokthar's own data folder (copied in at the first start; Lokthar may still be used: by hand
 * only). Never touched: settings,
 * the saved fights (Combat history), the characters, the Kina and Abyss records.
 */
import { app, session } from 'electron'
import { readdir, rm, stat, truncate } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promises as rawFs } from 'original-fs'
import { LOKTHAR_FOLDER } from '../shared/app.ts'
import { STORAGE_CLEARABLE, type StorageId, type StorageItem, type StorageUsage } from '../shared/storage.ts'
import { log } from './tracker.ts'
import { meterState } from './meter.ts'
import { settings } from './settings.ts'
import { logPath } from './tracker.ts'

/** Chromium's caches inside the data folder. */
const BROWSER_CACHES = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'Service Worker', 'blob_storage']

const userData = (): string => app.getPath('userData')
/** Lokthar's data folder, beside this app's (shared/app.ts). */
const lokthar = (): string => join(app.getPath('appData'), LOKTHAR_FOLDER)

/**
 * The updates' leftovers removed: through the raw file system (Electron's reads the app.asar in them
 * as a folder, and cannot remove it). At every start (nothing is being downloaded then), and from
 * the Cache page.
 */
export async function clearUpdates(): Promise<void> {
  for (const folder of await updateFolders()) {
    await rawFs.rm(folder, { recursive: true, force: true }).catch((err: unknown) => log(`storage: ${folder} not removed: ${String(err)}`))
  }
}
/** The data file's folder (the engine keeps `history/` and `recordings/` beside it). */
const dataDir = (): string => (settings.get('tracker').dataFile ? dirname(settings.get('tracker').dataFile) : userData())

/** The size of a file or a folder with everything in it; 0 when it is not there. */
async function sizeOf(path: string): Promise<number> {
  try {
    const s = await stat(path)
    if (!s.isDirectory()) return s.size
    let total = 0
    for (const name of await readdir(path)) total += await sizeOf(join(path, name))
    return total
  } catch {
    return 0
  }
}

/** What the updater left in the temp folder: its downloads (as named since 0.3.20, and before: `lokthar-update-`, `nayel-0.3.14`), the old install scripts. */
const UPDATE_LEFTOVER = /^((nayel|lokthar)-update-.*|nayel-\d+\.\d+\.\d+|lokthar-install-update\.cmd)$/
export async function updateFolders(): Promise<string[]> {
  try {
    return (await readdir(app.getPath('temp'))).filter((n) => UPDATE_LEFTOVER.test(n)).map((n) => join(app.getPath('temp'), n))
  } catch {
    return []
  }
}

async function bytes(id: StorageId): Promise<number> {
  switch (id) {
    case 'tiles':
      return sizeOf(join(userData(), 'maptiles'))
    case 'browser':
      return (await Promise.all(BROWSER_CACHES.map((n) => sizeOf(join(userData(), n))))).reduce((a, b) => a + b, 0)
    case 'logs':
      return sizeOf(dirname(logPath()))
    case 'updates':
      return (await Promise.all((await updateFolders()).map(sizeOf))).reduce((a, b) => a + b, 0)
    case 'recordings':
      return sizeOf(meterState.recordingsDir() ?? join(dataDir(), 'recordings'))
    case 'fights':
      return sizeOf(join(dataDir(), 'history'))
    case 'lokthar':
      return sizeOf(lokthar())
  }
}

export async function storageUsage(): Promise<StorageUsage> {
  const ids: StorageId[] = ['tiles', 'browser', 'logs', 'updates', 'recordings', 'fights', 'lokthar']
  const items: StorageItem[] = await Promise.all(ids.map(async (id) => ({ id, bytes: await bytes(id), clearable: STORAGE_CLEARABLE.includes(id) })))
  return { dir: userData(), items }
}

export async function clearStorage(id: StorageId): Promise<void> {
  switch (id) {
    case 'tiles':
      await rm(join(userData(), 'maptiles'), { recursive: true, force: true })
      return
    case 'browser':
      await session.defaultSession.clearCache()
      await session.defaultSession.clearCodeCaches({})
      await session.defaultSession.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] })
      return
    case 'logs': {
      // The files are open for writing while the app runs: emptied, not deleted.
      const dir = dirname(logPath())
      for (const name of await readdir(dir).catch(() => [] as string[])) await truncate(join(dir, name), 0).catch(() => undefined)
      return
    }
    case 'updates':
      await clearUpdates()
      return
    case 'lokthar':
      await rawFs.rm(lokthar(), { recursive: true, force: true })
      return
    case 'recordings': {
      const dir = meterState.recordingsDir() ?? join(dataDir(), 'recordings')
      const current = (await meterState.recordings()).recording
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        const path = join(dir, name)
        if (path !== current) await rm(path, { recursive: true, force: true })
      }
      return
    }
    case 'fights':
      return // the saved fights are deleted from Combat history, one at a time
  }
}
