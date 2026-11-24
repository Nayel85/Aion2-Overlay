<script setup lang="ts">
// The duty board (shared/duty.ts), the account's: today's 15 offered missions in the game's order
// (by quest), each with its 5 rewards and their chances, what it is worth to you, the ones to take
// highlighted, and whether a reroll is worth its cost; the missions taken apart. Below, what each
// kind of reward is worth to you (settings.duty), which ranks them, and the board's window over the game.
import { computed } from 'vue'
import DutyAdvice from '@/components/DutyAdvice.vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import { gradeClass } from '@/components/panel/sessionIcons.ts'
import { dutyRows, useDuty } from '@/lib/duty.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { compact } from '@shared/format.ts'
import { DUTY_CATEGORIES, dutyAdvice, type DutyCategory } from '@shared/duty.ts'

const store = useApp()
const state = useDuty()
const cfg = computed(() => store.settings.duty)
const values = computed(() => cfg.value.values)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('duty', { ...cfg.value, ...patch })
const setValue = (id: DutyCategory, v: number): void => set({ values: { ...values.value, [id]: Number.isFinite(v) && v >= 0 ? v : 0 } })

const board = computed(() => state.value.board)
const picked = computed(() => new Set(dutyAdvice(state.value, values.value)?.picks ?? []))
const rows = computed(() => dutyRows(state.value, values.value))

const kina = (n: number): string => compact(Math.round(n))
const when = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })
/** The rerolls' costs learned, in order. */
const costs = computed(() => Object.entries(state.value.rerollCosts).sort((a, b) => Number(a[0]) - Number(b[0])))
</script>

<template>
  <div>
    <PageHeader
      title="Duty board"
      about="Your account's duty missions (the same for all your characters, 5 a day between them), read as you open the board in game or reroll it: each mission's rewards and their chances, what it is worth to you, the ones to take, and whether a reroll pays."
    />

    <div v-if="!board" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No duty board yet today.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t("With the overlay open, open the duty board in game: today's shows here.") }}</div>
    </div>

    <template v-else>
      <DutyAdvice :state="state" :values="values" class="mb-4 text-sm" />

      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-darker">
        <span>{{ plural(board.rerolls, '{n} reroll today', '{n} rerolls today') }}</span>
        <span v-if="board.expires">{{ t('New board {when}', { when: when(board.expires) }) }}</span>
        <span>{{ t('Read {when}', { when: when(board.at) }) }}</span>
      </div>

      <!-- Offered: the ones to take highlighted. -->
      <div class="rounded-xl border border-card">
        <div
          v-for="m in rows.offered"
          :key="m.quest"
          :class="['border-b border-card px-4 py-2 last:border-b-0', picked.has(m.quest) && 'bg-accent/10 shadow-[inset_3px_0_0] shadow-accent']"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="font-medium">{{ m.name }}</span>
            <span v-if="picked.has(m.quest)" class="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{{ t('Recommended') }}</span>
            <span class="ml-auto tabular-nums" :class="m.value > 0 ? 'font-semibold' : 'text-darkest'">{{ kina(m.value) }}</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span v-for="r in m.rewards" :key="r.key" :class="['flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums', r.counts ? 'bg-dark' : 'opacity-50']" :title="r.name">
              <img v-if="r.icon" :src="r.icon" alt="" class="size-4 rounded-sm" draggable="false" loading="lazy" />
              <span :class="gradeClass(r.grade)">{{ r.name }}</span>
              <span v-if="r.amount > 1">×{{ r.amount.toLocaleString(loc()) }}</span>
              <span class="text-darker">{{ r.chance }}%</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Taken. -->
      <div v-if="rows.taken.length" class="mt-4">
        <div class="mb-1 text-xs font-medium text-darker">{{ t('Taken') }}</div>
        <div class="rounded-xl border border-card opacity-70">
          <div v-for="m in rows.taken" :key="m.quest" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-card px-4 py-1.5 text-xs last:border-b-0">
            <span class="font-medium">{{ m.name }}</span>
            <span v-for="r in m.rewards" :key="r.key" :class="gradeClass(r.grade)">{{ r.name }}<template v-if="r.amount > 1"> ×{{ r.amount.toLocaleString(loc()) }}</template> {{ r.chance }}%</span>
          </div>
        </div>
      </div>
    </template>

    <!-- What each reward is worth to you. -->
    <Section title="What you are after" class="mt-6">
      <p class="mb-3 text-xs text-darker">{{ t('What one of each is worth to you, in Kina: the missions are ranked by it, 0 leaves it out. Each reward counts at its chance.') }}</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <label v-for="c in DUTY_CATEGORIES" :key="c.id" class="flex items-center gap-3 rounded-lg bg-card px-3 py-2" :title="t(c.hint)">
          <span class="flex-1 text-sm">{{ t(c.label) }}</span>
          <input
            type="number"
            min="0"
            :step="c.id === 'kina' ? 1 : 1000"
            :value="values[c.id]"
            class="h-7 w-28 rounded-md border border-light bg-default px-2 text-right text-sm tabular-nums focus:border-accent"
            @change="setValue(c.id, Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <p class="mt-3 text-xs text-darker">
        {{ plural(state.history.length, '{n} board seen', '{n} boards seen') }}<template v-if="costs.length"> · {{ t('Rerolls paid:') }} {{ costs.map(([n, c]) => `${n}: ${kina(c)}`).join(', ') }}</template>
      </p>
    </Section>

    <!-- Its window over the game. -->
    <Section title="Window over the game" class="mt-6">
      <SettingRow label="Show as you open the board" hint="As you open the duty board in game, reroll it or take a mission, its advice shows over the game; it closes as you move, fight or close the board, or with its X.">
        <Toggle :model-value="cfg.overlay" @update:model-value="set({ overlay: $event })" />
      </SettingRow>
      <OverlayWindowSettings v-if="cfg.overlay" overlay="duty" setting="duty" />
    </Section>
  </div>
</template>
