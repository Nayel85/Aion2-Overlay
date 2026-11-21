// Copied from Nyerk (GPL-3.0), https://github.com/xCROv/aion2-nyerk
// app/src/main/pvpLog.ts at ddcdc48 (0.2.17).

/**
 * The PvP kill feed: every player kill around you, oldest first, kept until Clear. Saved to
 * `<userData>/pvp.jsonl` (a moment after each kill, so a siege's burst is one write), so a restart
 * or an update keeps it. Windows get each new kill on its own (`tracker:pvpKill`); the whole list
 * only when they open or it is cleared (`tracker:pvp`).
 */
import { app } from 'electron'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { PvpHistory } from './pvpHistory.ts'
import { log } from './tracker.ts'
import type { PvpKill, PvpSummary } from '../shared/tracker.ts'

const views = ['panel', 'killfeed', 'minimap', 'gamemap', 'unified']
let history: PvpHistory | null = null

function feed(): PvpHistory {
  const dir = app.getPath('userData')
  return history ??= new PvpHistory(join(dir, 'pvp.jsonl'), join(dir, 'pvp.json'), (err) => log(`PvP history: ${String(err)}`))
}

export const pvpLog = {
  summary: (): PvpSummary => feed().summary(),
  all: (): PvpKill[] => feed().all(),
  add(kill: PvpKill): void {
    const current = feed()
    current.add(kill)
    broadcast('tracker:pvpSummary', current.summary(), views)
    broadcast('tracker:pvpKill', kill, ['panel', 'killfeed'])
  },
  flush: (): Promise<void> | null => history?.flush() ?? null,
  clear(): void {
    const current = feed()
    current.clear()
    broadcast('tracker:pvpSummary', current.summary(), views)
    broadcast('tracker:pvp', [], ['panel', 'killfeed'])
  },
}
