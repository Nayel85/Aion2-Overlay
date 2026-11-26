<script setup lang="ts">
// A duty mission's rewards, all of them, as the game shows them: the item's icon with its amount on
// it, its chance under it, its name on hover. The ones that count for you (settings.duty) bright, the
// others dimmed. The dashboard's page and the window over the game show the same.
import { compact } from '@shared/format.ts'
import { gradeClass } from '@/lib/grades.ts'
import type { DutyRow } from '@/lib/duty.ts'
import { ICON } from '@/components/panel/sessionIcons.ts'

defineProps<{ rewards: DutyRow['rewards'] }>()
</script>

<template>
  <div class="flex shrink-0 gap-1">
    <span
      v-for="r in rewards"
      :key="r.key"
      :class="['flex w-9 flex-col items-center leading-none', !r.counts && 'opacity-40']"
      :title="`${r.name}${r.amount > 1 ? ` ×${r.amount.toLocaleString('en-US')}` : ''} · ${r.chance}%${r.unit ? ` · ${compact(r.unit)}${r.market ? ' (market)' : ''}` : ''}`"
    >
      <span class="relative">
        <img v-if="r.icon" :src="r.icon" alt="" class="size-7 rounded" draggable="false" loading="lazy" />
        <svg v-else viewBox="0 0 16 16" :class="['size-7 p-1', gradeClass(r.grade)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
        <span v-if="r.amount > 1" class="absolute -bottom-0.5 -right-1 rounded bg-darker/90 px-0.5 text-[9px] font-semibold tabular-nums text-default">{{ compact(r.amount) }}</span>
      </span>
      <span class="mt-0.5 text-[9px] tabular-nums text-darker">{{ r.chance }}%</span>
    </span>
  </div>
</template>
