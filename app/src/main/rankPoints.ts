/**
 * Rank points: every change the engine tells (`rankPoints`, from the game's total: a kill's gain, a
 * death's loss), kept for the PvP page to put on each kill and death. Saved to
 * `<userData>/rank.json` as `[at, change, name]`, the last KEEP_MS of them, a moment after each.
 */
import { broadcast } from './broadcast.ts'
import { dataFile } from './dataFile.ts'
import type { RankChange } from '../shared/abyss.ts'

const KEEP_MS = 90 * 24 * 3_600_000
const file = dataFile('rank.json', 3000)
let changes: RankChange[] | null = null

function all(): RankChange[] {
  if (changes === null) {
    const saved = file.read()
    changes = Array.isArray(saved) ? (saved as RankChange[]).filter((c) => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') : []
  }
  return changes
}

export const rankPoints = {
  changes: (): RankChange[] => all(),

  /** The engine's `rankPoints`: the total now, and the change from the character's last (null: none known). */
  read(ev: { change: number | null; name: string | null }, now = Date.now()): void {
    if (!ev.change) return
    const list = all()
    list.push([now, ev.change, ev.name])
    const old = list.findIndex(([at]) => at > now - KEEP_MS)
    if (old > 0) list.splice(0, old)
    file.save(() => all())
    broadcast('tracker:rank', list)
  },
}
