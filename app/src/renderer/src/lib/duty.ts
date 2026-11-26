// The duty board as the dashboard's page and its window show it: today's state from main, kept up to
// date, and each mission as a row (its name, worth, rewards and whether each counts for you).
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { missionValue, NO_DUTY, unitValue, type DutyMission, type DutyState, type DutyValues } from '@shared/duty.ts'
import { marketValue, type MarketPrices } from '@shared/market.ts'
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
  /** Each reward: `unit` what one is worth (null: not counted), `market` whether that is its market price. */
  rewards: { key: number; name: string; icon: string | null; grade: number; amount: number; chance: number; counts: boolean; unit: number | null; market: boolean }[]
}
export function dutyRow(m: DutyMission, values: DutyValues, prices?: MarketPrices): DutyRow {
  return {
    quest: m.quest,
    name: questName(m.quest),
    value: missionValue(m, values, prices),
    rewards: m.rewards.map((r, i) => {
      const info = itemInfo(r.item)
      const unit = unitValue(r.item, values, prices)
      const market = prices ? marketValue(prices[r.item]) !== null : false
      return { key: i, name: (info?.name ?? `#${r.item}`).replace(' (Bound)', ''), icon: itemIcon(info?.icon), grade: info?.grade ?? 11, amount: r.amount, chance: Math.round(r.chance * 100), counts: (unit ?? 0) > 0, unit, market }
    }),
  }
}
/** The offered missions in the game's order (by quest), and those taken. */
export function dutyRows(state: DutyState, values: DutyValues, prices?: MarketPrices): { offered: DutyRow[]; taken: DutyRow[] } {
  const missions = [...(state.board?.missions ?? [])].sort((a, b) => a.quest - b.quest)
  return { offered: missions.filter((m) => m.place === 0).map((m) => dutyRow(m, values, prices)), taken: missions.filter((m) => m.place !== 0).map((m) => dutyRow(m, values, prices)) }
}

/** Your server's market prices, from main, as they come; none when the setting is off (your own worths only). */
export function useMarket(on: () => boolean): Ref<MarketPrices | undefined> {
  const prices = ref<MarketPrices>({})
  const shown = ref<MarketPrices | undefined>(undefined)
  const update = (): void => void (shown.value = on() ? prices.value : undefined)
  let off: (() => void) | null = null
  onMounted(async () => {
    off = bridge().on('market:changed', (p) => {
      prices.value = p
      update()
    })
    prices.value = await bridge().invoke('market:get')
    update()
  })
  onBeforeUnmount(() => off?.())
  watch(on, update)
  return shown
}
