// The duty board as the dashboard's page and its window show it: today's state from main, kept up to
// date, and each mission as a row (its name, worth, rewards and whether each counts for you).
import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { missionValue, NO_DUTY, unitValue, type DutyMission, type DutyPricing, type DutyState, type DutyValues } from '@shared/duty.ts'
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
  /** Each reward: `unit` what one is worth (null: not counted), `market` whether that is its market price, `excluded` left out by you. */
  rewards: { key: number; item: number; name: string; icon: string | null; grade: number; amount: number; chance: number; counts: boolean; unit: number | null; market: boolean; excluded: boolean }[]
}
export function dutyRow(m: DutyMission, values: DutyValues, pricing?: DutyPricing): DutyRow {
  return {
    quest: m.quest,
    name: questName(m.quest),
    value: missionValue(m, values, pricing),
    rewards: m.rewards.map((r, i) => {
      const info = itemInfo(r.item)
      const unit = unitValue(r.item, values, pricing)
      const market = unit !== null && !!pricing?.prices && marketValue(pricing.prices[r.item]) !== null
      return { key: i, item: r.item, excluded: !!pricing?.excluded?.includes(r.item), name: (info?.name ?? `#${r.item}`).replace(' (Bound)', ''), icon: itemIcon(info?.icon), grade: info?.grade ?? 11, amount: r.amount, chance: Math.round(r.chance * 100), counts: (unit ?? 0) > 0, unit, market }
    }),
  }
}
/** The offered missions in the game's order (by quest), and those taken. */
export function dutyRows(state: DutyState, values: DutyValues, pricing?: DutyPricing): { offered: DutyRow[]; taken: DutyRow[] } {
  const missions = [...(state.board?.missions ?? [])].sort((a, b) => a.quest - b.quest)
  return { offered: missions.filter((m) => m.place === 0).map((m) => dutyRow(m, values, pricing)), taken: missions.filter((m) => m.place !== 0).map((m) => dutyRow(m, values, pricing)) }
}

/** The rewards' pricing as the settings say: your server's market prices, from main as they come (none with the setting off), and the items left out. */
export function useDutyPricing(market: () => boolean, excluded: () => number[]): ComputedRef<DutyPricing> {
  const prices = ref<MarketPrices>({})
  let off: (() => void) | null = null
  onMounted(async () => {
    off = bridge().on('market:changed', (p) => (prices.value = p))
    prices.value = await bridge().invoke('market:get')
  })
  onBeforeUnmount(() => off?.())
  return computed(() => ({ prices: market() ? prices.value : undefined, excluded: excluded() }))
}
