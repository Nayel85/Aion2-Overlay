/**
 * Abyss Points (shared/abyss.ts): this session's, and every gain kept for the PvP page's rift
 * farms. The engine tells each gain, by character (`abyss` events).
 *
 * The gains are saved to `<userData>/abyss.json` as `[at, gained, name]`, the last KEEP_MS of them,
 * a moment after each (a farm's burst is one write), so the rift farms outlive a restart.
 */
import { dataFile } from './dataFile.ts'
import { broadcast } from './broadcast.ts'
import { currentSeason, NO_ABYSS, riftFarms, type AbyssGain, type AbyssSession, type RiftFarm } from '../shared/abyss.ts'
import { earn, unearn } from '../shared/earnings.ts'
import { pveInstance } from '../shared/sessions.ts'
import { settings } from './settings.ts'

const KEEP_MS = 90 * 24 * 3_600_000
const SAVE_AFTER_MS = 3000

let session: AbyssSession = NO_ABYSS
let gains: AbyssGain[] | null = null
let farms: RiftFarm[] | null = null
const file = dataFile('abyss.json', SAVE_AFTER_MS)

function all(): AbyssGain[] {
  if (gains === null) {
    // None saved yet, or unreadable: start empty.
    const saved = file.read()
    gains = Array.isArray(saved) ? (saved as AbyssGain[]).filter((g) => Array.isArray(g) && typeof g[0] === 'number' && typeof g[1] === 'number') : []
  }
  return gains
}

function save(): void {
  file.save(() => all())
}

const withSeason = (s: AbyssSession): AbyssSession => ({ ...s, season: currentSeason(all()) })

function setSession(next: AbyssSession): void {
  session = next
  broadcast('tracker:abyss', withSeason(session))
}

export const abyss = {
  session: (): AbyssSession => withSeason(session),
  rifts: (): RiftFarm[] => (farms ??= riftFarms(all())),
  gains: (): AbyssGain[] => all(),

  /**
   * The engine's `abyss` event: the weekly figure the game sends (`ab ff`) and its limit. It did
   * not rise with the corridor's kills (2026-11-14 log), so what is earned comes from the balance
   * (`gain`), not from this.
   */
  read(ev: { points: number; limit: number }): void {
    setSession({ ...session, points: ev.points, limit: ev.limit })
  },

  /** The engine's `abyssGain` event: the Abyss Points balance rose by `gained`. */
  gain(ev: { gained: number; name: string | null; world: number | null }, now = Date.now()): void {
    if (!(ev.gained > 0)) return
    const list = all()
    list.push([now, ev.gained, ev.name, ev.world])
    const old = list.findIndex(([at]) => at > now - KEEP_MS)
    if (old > 0) list.splice(0, old)
    // What a dungeon gives counts in the rate only if the setting says (settings.rates).
    if (settings.get('rates').abyssDungeons || !pveInstance(ev.world)) setSession(earn(session, ev.gained, now))
    farms = riftFarms(list)
    broadcast('tracker:rifts', farms)
    save()
  },

  /** Up to `amount` of the gains from `from` to `to` were a reward, not farming: off the rate. */
  notFarmed(amount: number, from: number, to: number): void {
    setSession(unearn(session, amount, from, to))
  },

  /**
   * The gains from `from` to `to` were a quest's reward (a duty mission's, handed in on the
   * continent during a rift's window): not the rift's. Kept, as of no rift's world.
   */
  notRift(from: number, to: number): void {
    let changed = false
    for (const g of all()) {
      if (g[0] >= from && g[0] <= to && g[3] !== 0) {
        g[3] = 0
        changed = true
      }
    }
    if (!changed) return
    farms = riftFarms(all())
    broadcast('tracker:rifts', farms)
    save()
  },

  /** Start the session again (the Session page's reset); the kept gains stay. */
  reset(): void {
    setSession({ ...NO_ABYSS, points: session.points, limit: session.limit })
  },
}
