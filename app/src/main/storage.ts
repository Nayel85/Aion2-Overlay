/**
 * What the app keeps on disk, measured and cleared for the Cache page (shared/storage.ts).
 * Cleared: the map tiles (downloaded again when needed), the browser's own caches, the logs, the
 * update installers left in the temp folder, and the packet recordings. Never touched: settings,
 * the saved fights (Combat history), the characters, the Kina and Abyss records.
 */
import { app, session } from 'electron'
import { readdir, rm, stat, truncate } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { STORAGE_CLEARABLE, type StorageId, type StorageItem, type StorageUsage } from '../shared/storage.ts'
import { meterState } from './meter.ts'
import { settings } from './settings.ts'
import { logPath } from './tracker.ts'

/** Chromium's caches inside the data folder. */
const BROWSER_CACHES = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'Service Worker', 'blob_storage']

const userData = (): string => app.getPath('userData')
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

/** The update installers the updater left in the temp folder. */
async function updateFolders(): Promise<string[]> {
  try {
    return (await readdir(app.getPath('temp'))).filter((n) => /^lokthar-update-/.test(n)).map((n) => join(app.getPath('temp'), n))
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
  }
}

export async function storageUsage(): Promise<StorageUsage> {
  const ids: StorageId[] = ['tiles', 'browser', 'logs', 'updates', 'recordings', 'fights']
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
      for (const folder of await updateFolders()) await rm(folder, { recursive: true, force: true })
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
