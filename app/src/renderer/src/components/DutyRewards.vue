<script setup lang="ts">
// A duty mission's rewards, all of them, each with the game's icon, its amount and its chance: the
// ones that count for you (settings.duty) on a chip, the others dimmed. The dashboard's page and
// the window over the game show the same.
import { amount } from '@/lib/format.ts'
import { gradeClass } from '@/lib/grades.ts'
import type { DutyRow } from '@/lib/duty.ts'

defineProps<{ rewards: DutyRow['rewards'] }>()
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <span v-for="r in rewards" :key="r.key" :class="['flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums', r.counts ? 'bg-dark' : 'opacity-50']" :title="r.name">
      <img v-if="r.icon" :src="r.icon" alt="" class="size-4 rounded-sm" draggable="false" loading="lazy" />
      <span :class="gradeClass(r.grade)">{{ r.name }}</span>
      <span v-if="r.amount > 1">×{{ amount(r.amount) }}</span>
      <span class="text-darker">{{ r.chance }}%</span>
    </span>
  </div>
</template>
