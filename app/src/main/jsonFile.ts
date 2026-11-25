/**
 * A JSON file the app keeps its data in (sessions.json, inventory.json...): every store reads and saves
 * its file through it, the same way.
 * - Read once at start: the value, or null when there is none yet or it cannot be read.
 * - Saved whole, as the store's value is then (`save(get)`): at once, or a moment after the last change
 *   (`afterMs`, changes in a burst written once).
 * - Written safely: to a file beside it, then renamed over it, so a write cut short (the app killed, a
 *   full disk) leaves the last good file, never half of one.
 * - Its path is found when used (a function): the app's data folder is only known once it is named.
 * - Every pending save is written as the app quits (`flushJsonFiles`, main/index.ts), and none is lost.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface JsonFile {
  /** Where it is (found when asked). */
  readonly path: string
  /** What the file holds, or null: none yet, or unreadable. */
  read(): unknown
  /** Save the store's value (`get`, called when it is written): at once, or `afterMs` after the last call. */
  save(get: () => unknown): void
  /** Write a pending save now. */
  flush(): void
}

const files = new Set<JsonFile>()

export function jsonFile(where: string | (() => string), afterMs = 0, onError: (err: unknown) => void = (err) => console.error(`not saved: ${String(err)}`)): JsonFile {
  const at = (): string => (typeof where === 'string' ? where : where())
  let pending: (() => unknown) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  function write(get: () => unknown): void {
    try {
      const path = at()
      mkdirSync(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      writeFileSync(tmp, JSON.stringify(get()))
      renameSync(tmp, path)
    } catch (err) {
      onError(err)
    }
  }
  const file: JsonFile = {
    get path() {
      return at()
    },
    read() {
      try {
        return JSON.parse(readFileSync(at(), 'utf8')) as unknown
      } catch {
        return null
      }
    },
    save(get) {
      if (afterMs <= 0) return write(get)
      pending = get
      if (timer) return
      timer = setTimeout(() => file.flush(), afterMs)
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = null
      const get = pending
      pending = null
      if (get) write(get)
    },
  }
  files.add(file)
  return file
}

/** Write every pending save (the app quitting). */
export function flushJsonFiles(): void {
  for (const f of files) f.flush()
}
