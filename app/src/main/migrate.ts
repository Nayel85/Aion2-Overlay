/**
 * The app was renamed three times, and its data folder with it: "Aion 2 Drop Tracker" became "Aion2
 * Pet Tracker" in 0.1.11, that became "Nyerk" in 0.2.0, and this private build is "Lokthar" from
 * 0.3.0. On the first start after a rename the old
 * folder is moved across whole (collection, settings, logs, the updater's id, the field bosses),
 * before anything reads or writes the new one. If it cannot be moved, the collection and settings
 * are copied instead and the old folder is left as it was. index.ts calls it right after
 * app.setName(), before the single-instance lock or anything else uses the folder. (No Electron
 * import here, so the tests can run it.)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** The data folders of older names, newest first: an install that skipped versions has the oldest. */
export const OLD_NAMES = ['Nyerk', 'Aion2 Pet Tracker', 'Aion 2 Drop Tracker']

/**
 * Move the app's own files from `from` into `to`, drop the rest (Chromium's caches and state, which
 * it rebuilds), and remove `from` once it is empty. Returns what was done, for the log.
 *
 * By the time the app's code runs, Chromium has already made the new folder and is writing its own
 * files there (seen 2026-10-10), so the old folder cannot be renamed into place, and moving
 * Chromium's files across races it ("Local State" came out as "Local State.bad"). An app file the
 * new folder has already is never overwritten or deleted: the old one stays, and so does the old
 * folder.
 */
export function moveDataFolder(from: string, to: string): string {
  if (from === to || !existsSync(from)) return 'nothing to move'
  if (!existsSync(to)) {
    try {
      renameSync(from, to)
      return `moved ${from} to ${to}`
    } catch {
      // Something holds a file in it open: file by file, below.
    }
  }
  mkdirSync(to, { recursive: true })
  const moved: string[] = []
  const left: string[] = []
  for (const name of readdirSync(from)) {
    const src = join(from, name)
    try {
      if (!APP_FILES.includes(name)) rmSync(src, { recursive: true, force: true })
      else if (existsSync(join(to, name))) left.push(name)
      else {
        renameSync(src, join(to, name))
        moved.push(name)
      }
    } catch {
      left.push(name)
    }
  }
  if (!left.length) rmSync(from, { recursive: true, force: true })
  return `moved ${moved.join(', ') || 'nothing'} from ${from} to ${to}` + (left.length ? `; left there: ${left.join(', ')}` : '; removed the old folder')
}

/** Chromium's own files and folders in a data folder (caches and state it rebuilds): not copied. */
const CHROMIUM = new Set(['Cache', 'Code Cache', 'GPUCache', 'GPUPersistentCache', 'GrShaderCache', 'ShaderCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Shared Dictionary', 'Network', 'Session Storage', 'blob_storage', 'Crashpad', 'DIPS', 'DIPS-wal', 'Local State', 'Preferences', 'lockfile', 'SingletonLock', 'declarative_performance_observer.db', 'declarative_performance_observer.db-journal'])

/**
 * Lokthar's data folder (`from`) copied into this app's (`to`) on its first start: everything but
 * Chromium's caches (the collection, settings, sessions, rifts, characters, fights, captures, logs,
 * the windows' storage), nothing overwritten, and `from` left as it was. Only while `to` has no
 * settings yet: once this app has run, never again. Returns what was done, for the log.
 */
export function copyDataFolder(from: string, to: string): string {
  if (from === to || !existsSync(from) || existsSync(join(to, 'settings.json'))) return 'nothing to copy'
  mkdirSync(to, { recursive: true })
  const copied: string[] = []
  const failed: string[] = []
  for (const name of readdirSync(from)) {
    if (CHROMIUM.has(name) || existsSync(join(to, name))) continue
    try {
      cpSync(join(from, name), join(to, name), { recursive: true, errorOnExist: false, force: false })
      copied.push(name)
    } catch {
      failed.push(name)
    }
  }
  return `copied ${copied.join(', ') || 'nothing'} from ${from} to ${to}` + (failed.length ? `; could not copy: ${failed.join(', ')}` : '')
}

/** The app's own files in its data folder; everything else there is Chromium's. */
const APP_FILES = ['collection.json', 'settings.json', 'logs', '.updaterId', 'fieldbosses.json', 'machine-id']
