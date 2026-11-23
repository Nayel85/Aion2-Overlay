// The recordings folder (<data folder>/recordings): packet logs and traffic recordings, made for
// diagnosis and never read back by the app. Those older than a month are deleted as the app starts,
// so the folder does not grow for ever (61 MB in two days of the owner's tests).
import { app } from 'electron'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './tracker.ts'

/** Kept this long. */
const KEEP_MS = 30 * 86_400_000

export function pruneRecordings(now = Date.now()): void {
  const dir = join(app.getPath('userData'), 'recordings')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  let gone = 0
  for (const name of names) {
    if (!/\.(log|txt|pcapng?)$/.test(name)) continue
    const file = join(dir, name)
    try {
      if (now - statSync(file).mtimeMs > KEEP_MS) {
        unlinkSync(file)
        gone++
      }
    } catch {
      // In use or gone: next time.
    }
  }
  if (gone) log(`recordings: ${gone} older than ${KEEP_MS / 86_400_000} days deleted`)
}
