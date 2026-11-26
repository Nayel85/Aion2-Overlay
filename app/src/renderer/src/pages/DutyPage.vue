<script setup lang="ts">
// The duty board's advice over the game, in a window of its own as the merchant's: main opens it as
// you open the board in game, reroll it or take a mission (main/index.ts), it moves by its header,
// and the X closes it until the next time. The offered missions in the game's order, the ones to take
// highlighted, one line each with all its rewards; the advice in words is the dashboard's page alone.
import { computed, nextTick, onMounted, watch } from 'vue'
import DutyRewards from '@/components/DutyRewards.vue'
import { bridge } from '@/lib/bridge.ts'
import { dutyRows, useDuty, useDutyPricing } from '@/lib/duty.ts'
import { t } from '@/lib/i18n.ts'
import { useOverlay } from '@/lib/overlay.ts'
import { useApp } from '@/stores/app.ts'
import { compact } from '@shared/format.ts'
import { dutyAdvice, type DutyState } from '@shared/duty.ts'

const store = useApp()
const live = useDuty()
/**
 * No board yet while the overlays are being placed: the last one seen as a sample to place it by,
 * as every overlay has.
 */
const state = computed<DutyState>(() => (live.value.board || !store.panelVisible ? live.value : { ...live.value, board: live.value.history.at(-1) ?? null }))
const values = computed(() => store.settings.duty.values)
const pricing = useDutyPricing(() => store.settings.duty.market, () => store.settings.duty.excluded)
const advice = computed(() => dutyAdvice(state.value, values.value, pricing.value))
/** Something to take: the 5 missions of the day taken, nothing to advise, and it closes (the sample shows whatever). */
const open = computed(() => state.value.board !== null && (store.panelVisible || (advice.value?.free ?? 0) > 0))
const { report, drag } = useOverlay('duty', () => open.value)

const rows = computed(() => dutyRows(state.value, values.value, pricing.value).offered)
const picked = computed(() => new Set(advice.value?.picks ?? []))
const kina = (n: number): string => compact(Math.round(n))
const close = (): void => void bridge().invoke('duty:close')

/** Tell main how big the window is; no board measures 0, and main keeps it hidden. */
watch([rows, picked, open, () => store.ready], () => void nextTick(report), { deep: true })
onMounted(() => report())
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div v-if="open" class="m-1.5 w-[460px] rounded-lg border border-accent/40 bg-darker/95 shadow-card" :style="{ opacity: store.settings.duty.opacity }">
        <header class="flex cursor-move items-center gap-2 border-b border-card px-3 py-2" :title="t('Drag to move')" @pointerdown="drag.onPointerDown">
          <span class="size-1.5 rounded-full bg-accent" />
          <span class="text-[11px] font-semibold uppercase tracking-wide text-accent">{{ t('Duty board') }}</span>
          <!-- The best way: the lit ones taken, then a reroll for the slots left (its cost). -->
          <span
            v-if="advice?.reroll"
            class="rounded-full bg-green/20 px-2 py-0.5 text-[11px] font-semibold text-green"
            :title="t('{kina} expected in all, {more} more than taking {free} now.', { kina: kina(advice.expected), more: kina(advice.expected - advice.takeAll), free: advice.free })"
          >{{ advice.picks.length ? t('Take, then reroll · {cost}', { cost: kina(advice.nextCost!) }) : t('Reroll all · {cost}', { cost: kina(advice.nextCost!) }) }}</span>
          <button
            type="button"
            class="ml-auto flex size-6 items-center justify-center rounded text-darker hover:bg-dark hover:text-default"
            :title="t('Close (it opens again with the board)')"
            @pointerdown.stop
            @click="close"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" /></svg>
          </button>
        </header>

        <!-- One line a mission, the ones to take lit: its name, its rewards, what it is worth to you. A fixed cap, not vh: the window is sized to this list. -->
        <ul class="max-h-[720px] space-y-0.5 overflow-y-auto p-1.5">
          <li
            v-for="m in rows"
            :key="m.quest"
            :class="['flex items-center gap-2 rounded-md border-l-2 px-2 py-0.5', picked.has(m.quest) ? 'border-accent bg-accent/10' : 'border-transparent opacity-70']"
          >
            <span :class="['min-w-0 flex-1 truncate text-xs', picked.has(m.quest) ? 'font-semibold' : 'font-medium text-dark']" :title="m.name">{{ m.name }}</span>
            <DutyRewards :rewards="m.rewards" />
            <span class="w-9 shrink-0 text-right text-xs tabular-nums" :class="m.value > 0 ? 'font-semibold' : 'text-darkest'">{{ kina(m.value) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
