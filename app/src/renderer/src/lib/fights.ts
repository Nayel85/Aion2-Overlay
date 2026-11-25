// The saved fights' summaries (the Combat history's), kept up to date as fights are saved, and a run's
// best fight in them: your DPS on a boss while you were in it (a Nightmare's boss, a dungeon's).
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { onHistory } from '@/lib/history.ts'
import type { FightSummary } from '@shared/meter.ts'
import type { DungeonRun } from '@shared/sessions.ts'

export function useFights(): Ref<FightSummary[]> {
  const fights = ref<FightSummary[]>([])
  onHistory(async () => {
    fights.value = await bridge().invoke('history:list')
  })
  return fights
}

/** How a fight opens: a page that shows fights in itself (Personal bests, Combat history) provides its own. */
const OPENER: InjectionKey<(id: string) => void> = Symbol('openFight')
export const provideFightOpener = (open: (id: string) => void): void => provide(OPENER, open)
/** Opens a saved fight: in the page that shows fights, else in the fight's own window. */
export const useOpenFight = (): ((id: string) => void) => inject(OPENER, (id: string) => void bridge().invoke('details:open', { kind: 'saved', id }))

/** Your DPS in a fight: your damage over its length. */
export const fightDps = (f: FightSummary): number => (f.myDamage ?? 0) / Math.max(1, f.durationMs / 1000)

/** A run's clearing fight: the last one in its instance before it was cleared (its last boss's), or null. */
export function runClearFight(run: Pick<DungeonRun, 'world' | 'start' | 'cleared'>, fights: FightSummary[]): FightSummary | null {
  if (run.cleared === undefined) return null
  let last: FightSummary | null = null
  for (const f of fights) {
    if (f.dungeonId !== run.world || f.startTimeMs < run.start || f.startTimeMs > run.cleared) continue
    if (!last || f.startTimeMs > last.startTimeMs) last = f
  }
  return last
}

/** A run's fight with your best DPS (in its instance, while it lasted), or null. */
export function runFight(run: DungeonRun, fights: FightSummary[]): FightSummary | null {
  const end = run.end ?? Infinity
  let best: FightSummary | null = null
  for (const f of fights) {
    if (f.dungeonId !== run.world || f.startTimeMs < run.start || f.startTimeMs > end || !(f.myDamage ?? 0)) continue
    if (!best || fightDps(f) > fightDps(best)) best = f
  }
  return best
}
