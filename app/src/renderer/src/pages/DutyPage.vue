<script setup lang="ts">
// The duty board's advice over the game, in a window of its own as the merchant's: main opens it as
// you open the board in game, reroll it or take a mission (main/index.ts), it moves by its header,
// and the X closes it until the next time. The offered missions in the game's order, the ones to take
// highlighted, each with all its rewards (those that count for you on a chip); above them, whether to reroll.
import { computed, nextTick, onMounted, watch } from 'vue'
import DutyAdvice from '@/components/DutyAdvice.vue'
import DutyRewards from '@/components/DutyRewards.vue'
import { bridge } from '@/lib/bridge.ts'
import { dutyRows, useDuty } from '@/lib/duty.ts'
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
const { report, drag } = useOverlay('duty', () => state.value.board !== null)

const values = computed(() => store.settings.duty.values)
const rows = computed(() => dutyRows(state.value, values.value).offered)
const picked = computed(() => new Set(dutyAdvice(state.value, values.value)?.picks ?? []))
const kina = (n: number): string => compact(Math.round(n))
const close = (): void => void bridge().invoke('duty:close')

/** Tell main how big the window is; no board measures 0, and main keeps it hidden. */
watch([rows, picked, () => store.ready], () => void nextTick(report), { deep: true })
onMounted(() => report())
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div v-if="state.board" class="m-1.5 w-[400px] rounded-lg border border-accent/40 bg-darker/95 shadow-card" :style="{ opacity: store.settings.duty.opacity }">
        <header class="flex cursor-move items-center gap-2 border-b border-card px-3 py-2" :title="t('Drag to move')" @pointerdown="drag.onPointerDown">
          <span class="size-1.5 rounded-full bg-accent" />
          <span class="text-[11px] font-semibold uppercase tracking-wide text-accent">{{ t('Duty board') }}</span>
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

        <DutyAdvice :state="state" :values="values" class="m-2 text-xs" />

        <!-- A fixed cap, not vh: the window is sized to this list. -->
        <ul class="max-h-[520px] space-y-0.5 overflow-y-auto px-2 pb-2">
          <li
            v-for="m in rows"
            :key="m.quest"
            :class="['rounded-md border-l-2 px-2 py-1', picked.has(m.quest) ? 'border-accent bg-accent/10' : 'border-transparent opacity-70']"
          >
            <div class="flex items-center gap-2 text-[13px]">
              <span :class="['truncate', picked.has(m.quest) ? 'font-semibold' : 'font-medium text-dark']">{{ m.name }}</span>
              <span class="ml-auto shrink-0 tabular-nums" :class="m.value > 0 ? 'font-semibold' : 'text-darkest'">{{ kina(m.value) }}</span>
            </div>
            <DutyRewards :rewards="m.rewards" class="mt-1 text-[11px]" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
