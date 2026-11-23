<script setup lang="ts">
// A session's gathering stats: how many gatherings, failed, doubled, ranked up, and the ones that
// worked by the grade of what they gave (white, green, blue, gold).
import { computed } from 'vue'
import { t } from '@/lib/i18n.ts'
import { GATHER_GRADES, type GatherStats } from '@shared/sessions.ts'
import { gradeClass } from './sessionIcons.ts'

const props = defineProps<{ stats: GatherStats }>()

const GRADE_LABELS: Record<number, string> = { 11: 'White', 21: 'Green', 31: 'Blue', 41: 'Gold' }
const worked = computed(() => props.stats.done - props.stats.failed)
const pct = (n: number): string => (props.stats.done ? `${Math.round((n / props.stats.done) * 100)}%` : '')
const tiles = computed(() => [
  { label: 'Gatherings', n: props.stats.done, sub: '', class: 'text-default' },
  { label: 'Failed', n: props.stats.failed, sub: pct(props.stats.failed), class: props.stats.failed ? 'text-red' : 'text-darker' },
  { label: '×2', n: props.stats.doubles, sub: pct(props.stats.doubles), class: props.stats.doubles ? 'text-accent' : 'text-darker' },
  { label: 'Rank up', n: props.stats.rankUps, sub: pct(props.stats.rankUps), class: props.stats.rankUps ? 'text-green' : 'text-darker' },
])
</script>

<template>
  <div class="space-y-1.5 text-xs">
    <div class="grid grid-cols-4 gap-1.5">
      <div v-for="tile in tiles" :key="tile.label" class="rounded-md bg-dark px-2 py-1 text-center">
        <div :class="['text-base font-semibold tabular-nums', tile.class]">{{ tile.n }}</div>
        <div class="text-[10px] text-darker">{{ t(tile.label) }}<template v-if="tile.sub"> · {{ tile.sub }}</template></div>
      </div>
    </div>
    <!-- The ones that worked, by the grade of what they gave. -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span class="text-darker">{{ t('Successes') }} <span class="font-semibold tabular-nums text-default">{{ worked }}</span></span>
      <span v-for="grade in GATHER_GRADES" :key="grade" :class="['flex items-center gap-1 tabular-nums', stats.byGrade[grade] ? gradeClass(grade) : 'text-darkest']">
        <span class="size-2 rounded-full bg-current" />{{ t(GRADE_LABELS[grade]!) }} <span class="font-semibold">{{ stats.byGrade[grade] ?? 0 }}</span>
      </span>
    </div>
  </div>
</template>
