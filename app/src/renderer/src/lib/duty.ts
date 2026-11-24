// The duty board as the dashboard's page and its window show it: today's state from main, kept up to
// date, and each mission as a row (its name, worth, rewards and whether each counts for you).
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { dutyCategory, missionValue, NO_DUTY, type DutyMission, type DutyState, type DutyValues } from '@shared/duty.ts'
import { itemIcon, itemInfo, questName } from '@shared/sessions.ts'

/** The duty board's state, from main, as it changes. */
export function useDuty(): Ref<DutyState> {
  const state = ref<DutyState>(NO_DUTY)
  let off: (() => void) | null = null
  onMounted(async () => {
    off = bridge().on('duty:changed', (s) => (state.value = s))
    state.value = await bridge().invoke('duty:get')
  })
  onBeforeUnmount(() => off?.())
  return state
}

export interface DutyRow {
  quest: number
  name: string
  value: number
  rewards: { key: number; name: string; icon: string | null; grade: number; amount: number; chance: number; counts: boolean }[]
}
export function dutyRow(m: DutyMission, values: DutyValues): DutyRow {
  return {
    quest: m.quest,
    name: questName(m.quest),
    value: missionValue(m, values),
    rewards: m.rewards.map((r, i) => {
      const info = itemInfo(r.item)
      const c = dutyCategory(r.item)
      return { key: i, name: (info?.name ?? `#${r.item}`).replace(' (Bound)', ''), icon: itemIcon(info?.icon), grade: info?.grade ?? 11, amount: r.amount, chance: Math.round(r.chance * 100), counts: c !== null && values[c] > 0 }
    }),
  }
}
/** The offered missions in the game's order (by quest), and those taken. */
export function dutyRows(state: DutyState, values: DutyValues): { offered: DutyRow[]; taken: DutyRow[] } {
  const missions = [...(state.board?.missions ?? [])].sort((a, b) => a.quest - b.quest)
  return { offered: missions.filter((m) => m.place === 0).map((m) => dutyRow(m, values)), taken: missions.filter((m) => m.place !== 0).map((m) => dutyRow(m, values)) }
}
