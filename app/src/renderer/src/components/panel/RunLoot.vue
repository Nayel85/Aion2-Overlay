<script setup lang="ts">
// What a dungeon run gave, as a list: one line an item, with the game's icon. Its Abyss Points,
// Kina and currencies first (all it earned in there), then its cubes' items in their grade's
// colour, the best first.
import { formatAmount } from '@shared/earnings.ts'
import { formatKina } from '@shared/kina.ts'
import { AP_ITEM, type DungeonRun, KINA_ITEM, plainName, type RewardRow, runRewards } from '@shared/sessions.ts'
import { ICON } from './sessionIcons.ts'
import { gradeClass } from '@/lib/grades.ts'

defineProps<{ run: DungeonRun }>()

const amount = (r: RewardRow): string =>
  r.id === String(KINA_ITEM) ? formatKina(r.amount) : r.id === String(AP_ITEM) ? formatAmount(r.amount) : r.currency ? r.amount.toLocaleString('en-US') : `×${r.amount}`
const colour = (r: RewardRow): string =>
  r.id === String(KINA_ITEM) ? 'text-yellow' : r.id === String(AP_ITEM) ? 'text-blue' : r.currency ? 'text-green' : gradeClass(r.grade)
</script>

<template>
  <!-- No wider than a short list, so each amount stays by its name, however wide the panel. -->
  <ul v-if="runRewards(run).length" class="w-full max-w-xs space-y-0.5 py-0.5 pl-5 text-[11px]">
    <li v-for="r in runRewards(run)" :key="r.id" class="flex items-center gap-1.5">
      <img v-if="r.icon" :src="r.icon" alt="" class="size-4 shrink-0 rounded-sm" draggable="false" />
      <!-- No icon of its own (a usable item, a skin...): a box in its grade's colour. -->
      <svg v-else viewBox="0 0 16 16" :class="['size-4 shrink-0', colour(r)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
      <span :class="['min-w-0 flex-1 truncate', colour(r)]">{{ plainName(r.name) }}</span>
      <span :class="['tabular-nums', r.currency ? colour(r) : 'text-dark']">{{ amount(r) }}</span>
    </li>
  </ul>
</template>
