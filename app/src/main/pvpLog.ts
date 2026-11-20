// Copied from Nyerk (GPL-3.0), https://github.com/xCROv/aion2-nyerk
// app/src/main/pvpLog.ts at ddcdc48 (0.2.17).

/**
 * The PvP kill feed: every player kill around you, oldest first, kept until Clear. Saved to
 * `<userData>/pvp.json` (a moment after each kill, so a siege's burst is one write), so a restart
 * or an update keeps it. Windows get each new kill on its own (`tracker:pvpKill`); the whole list
 * only when they open or it is cleared (`tracker:pvp`).
 */
import { app } from 'electron'
import { readFileSync, writeFile, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { PVP_LIMIT, pvpSummary, appendPvpKill, type PvpKill, type PvpSummary } from '../shared/tracker.ts'

const views = ['panel', 'killfeed', 'minimap', 'gamemap', 'unified']
let summary: PvpSummary | null = null
const SAVE_AFTER_MS = 3000

let kills: PvpKill[] | null = null
let saveTimer: NodeJS.Timeout | null = null
const file = (): string => join(app.getPath('userData'), 'pvp.json')

function list(): PvpKill[] {
  if (kills === null) {
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as unknown
      kills = Array.isArray(saved) ? (saved as PvpKill[]).slice(-PVP_LIMIT).map((k) => ({ ...k, legion: k.legion === true })) : []
    } catch {
      kills = [] // none saved yet, or unreadable: start empty
    }
  }
  return kills
}

function save(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    writeFile(file(), JSON.stringify(list()), () => {})
  }, SAVE_AFTER_MS)
}

export const pvpLog = {
  summary: (): PvpSummary => summary ??= pvpSummary(list()),
  all: (): PvpKill[] => list(),
  add(kill: PvpKill): void {
    const all = list()
    const s = pvpLog.summary()
    appendPvpKill(all, s, kill)
    broadcast('tracker:pvpSummary', s, views)
    broadcast('tracker:pvpKill', kill, ['panel', 'killfeed'])
    save()
  },
  /** Write a pending save now (the app is quitting). */
  flush(): void {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = null
    try {
      writeFileSync(file(), JSON.stringify(list()))
    } catch {
      // a full disk or a locked file: the last save stands
    }
  },
  clear(): void {
    kills = []
    summary = pvpSummary(kills)
    broadcast('tracker:pvpSummary', summary, views)
    broadcast('tracker:pvp', kills, ['panel', 'killfeed'])
    save()
  },
}
