<script setup lang="ts">
// The Stats tabs' luck verdict (shared/luck.ts): for the filters picked, one of five, from no luck at
// all to very lucky, with the share of players it beats. `compact`: its level alone, a line under a
// table's figure (a loot category's).
import { computed } from 'vue'
import { t } from '@/lib/i18n.ts'
import { LUCK_LEVELS, type LuckVerdict } from '@shared/luck.ts'

/** `what`: what it is over (runs, crafts); `about`: what it counts, for its tooltip. */
const props = defineProps<{ verdict: LuckVerdict | null; what: string; about: string; compact?: boolean }>()
const STYLE = ['border-red/40 bg-red/10 text-red', 'border-red/25 bg-red/5 text-red', 'border-card bg-card/40 text-dark', 'border-green/25 bg-green/5 text-green', 'border-green/40 bg-green/10 text-green']
const TEXT = ['text-red', 'text-red/70', 'text-dark', 'text-green/80', 'text-green']
const beats = computed(() => Math.round((props.verdict?.beats ?? 0) * 100))
</script>

<template>
  <div v-if="verdict && compact" :class="['text-[10px] font-normal', TEXT[verdict.level]]" :title="t('Luckier than {n}% of players over the same {what}', { n: beats, what: t(what) })">{{ t(LUCK_LEVELS[verdict.level]) }}</div>
  <div v-else-if="verdict" :class="['mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5', STYLE[verdict.level]]" :title="t(about)">
    <span class="text-sm font-semibold">{{ t(LUCK_LEVELS[verdict.level]) }}</span>
    <span class="text-xs text-dark">{{ t('Luckier than {n}% of players over the same {what}', { n: beats, what: t(what) }) }}</span>
  </div>
</template>
