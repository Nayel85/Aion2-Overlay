<script setup lang="ts">
// The stats views' filters (Loot, Crafts, Gathering): the characters picked (CharacterChips; none: all of them),
// the period, then each view's own rows (FilterRow) in its slot.
import CharacterChips from '@/components/CharacterChips.vue'
import FilterRow from '@/components/FilterRow.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { PERIODS, type Period } from '@/lib/statsFilters.ts'

defineProps<{ characters: string[] }>()
const names = defineModel<string[]>('names', { required: true })
const period = defineModel<Period>('period', { required: true })

</script>

<template>
  <div class="mb-5 space-y-3 rounded-xl border border-card p-4">
    <FilterRow label="Characters">
      <CharacterChips v-model="names" multiple :characters="characters" />
    </FilterRow>
    <FilterRow label="Period">
      <Segmented v-model="period" size="sm" :options="PERIODS" />
    </FilterRow>
    <slot />
  </div>
</template>
