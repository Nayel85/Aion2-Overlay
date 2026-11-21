import { readFileSync } from 'node:fs'
import { appendFile, open, rename, unlink } from 'node:fs/promises'
import { addToPvpSummary, PVP_LIMIT, pvpSummary, type PvpKill, type PvpSummary } from '../shared/tracker.ts'

const SAVE_AFTER_MS = 3000
const WRITE_BATCH = 512

function readLegacy(path: string, limit: number): PvpKill[] {
  try {
    const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(saved) ? (saved as PvpKill[]).slice(-limit).map((k) => ({ ...k, legion: k.legion === true })) : []
  } catch {
    return []
  }
}

function lines(kills: PvpKill[]): string {
  return kills.map((kill) => JSON.stringify(kill) + '\n').join('')
}

/** The ordered kill feed and its journal. Array order on disk, in IPC and in the UI is oldest first. */
export class PvpHistory {
  private readonly path: string
  private readonly onError: (err: unknown) => void
  private readonly limit: number
  private kills: PvpKill[]
  private first = 0
  private stats: PvpSummary
  private diskCount = 0
  private replace = false
  private pending: PvpKill[] = []
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> | null = null

  constructor(
    path: string,
    legacy: string,
    onError: (err: unknown) => void,
    limit = PVP_LIMIT,
  ) {
    this.path = path
    this.onError = onError
    this.limit = limit
    this.kills = this.load(legacy)
    this.stats = pvpSummary(this.kills)
  }

  private load(legacy: string): PvpKill[] {
    let text: string
    try {
      text = readFileSync(this.path, 'utf8')
    } catch (err) {
      // Once the journal exists it supersedes the legacy file, including after a clear.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.onError(err)
        return []
      }
      const kills = readLegacy(legacy, this.limit)
      this.replace = kills.length > 0
      return kills
    }
    const entries = text.split('\n')
    // The final fragment has no newline when a write was interrupted. Rewrite before appending.
    this.replace = entries.pop() !== ''
    this.diskCount = entries.length
    const kills: PvpKill[] = []
    for (let i = entries.length - 1; i >= 0 && kills.length < this.limit; i--) {
      try {
        const kill = JSON.parse(entries[i]!) as PvpKill
        if (kill && typeof kill.at === 'number' && kill.killer) kills.push(kill)
      } catch {
        this.replace = true
      }
    }
    return kills.reverse()
  }

  all(): PvpKill[] {
    if (this.first === 0) return this.kills.slice()
    return this.kills.slice(this.first).concat(this.kills.slice(0, this.first))
  }

  summary(): PvpSummary {
    return this.stats
  }

  add(kill: PvpKill): void {
    const old = this.kills.length === this.limit ? this.kills[this.first] : undefined
    if (old) {
      this.kills[this.first] = kill
      this.first = (this.first + 1) % this.limit
    } else {
      this.kills.push(kill)
    }
    addToPvpSummary(this.stats, kill, old)
    if (!this.replace) {
      this.pending.push(kill)
      if (this.pending.length >= this.limit) {
        this.replace = true
        this.pending = []
      }
    }
    this.schedule()
  }

  clear(): void {
    this.kills = []
    this.first = 0
    this.stats = pvpSummary([])
    this.pending = []
    this.replace = true
    this.schedule()
  }

  private schedule(): void {
    this.timer ??= setTimeout(() => void this.flush(), SAVE_AFTER_MS)
    this.timer.unref()
  }

  flush(): Promise<void> | null {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.writing && (this.replace || this.pending.length)) {
      this.writing = this.drain().finally(() => { this.writing = null })
    }
    return this.writing
  }

  private async drain(): Promise<void> {
    while (this.replace || this.pending.length) {
      const pending = this.pending
      const snapshot = this.replace || this.diskCount + pending.length > 2 * this.limit ? this.all() : null
      this.pending = []
      this.replace = false
      try {
        if (snapshot) {
          await this.writeSnapshot(snapshot)
          this.diskCount = snapshot.length
        } else {
          await appendFile(this.path, lines(pending), 'utf8')
          this.diskCount += pending.length
        }
      } catch (err) {
        // Some of an append may already be on disk. Retry from the current history, without duplicates.
        this.replace = true
        this.pending = []
        this.onError(err)
        return
      }
    }
  }

  private async writeSnapshot(kills: PvpKill[]): Promise<void> {
    const temp = this.path + '.tmp'
    const handle = await open(temp, 'w')
    try {
      try {
        for (let i = 0; i < kills.length; i += WRITE_BATCH) {
          await handle.writeFile(lines(kills.slice(i, i + WRITE_BATCH)), 'utf8')
        }
      } finally {
        await handle.close()
      }
      await rename(temp, this.path)
    } catch (err) {
      await unlink(temp).catch(() => {})
      throw err
    }
  }
}
