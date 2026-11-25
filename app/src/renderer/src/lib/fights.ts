// The saved fights' summaries (the Combat history's), kept up to date as fights are saved, and a run's
// best fight in them: your DPS on a boss while you were in it (a Nightmare's boss, a dungeon's).
import { ref, type Ref } from 'vue'
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

/** Your DPS in a fight: your damage over its length. */
export const fightDps = (f: FightSummary): number => (f.myDamage ?? 0) / Math.max(1, f.durationMs / 1000)

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
