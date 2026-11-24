<script setup lang="ts">
// The stats views' filters (Loot, Crafts, Gathering): the characters picked (none: all of them),
// the period, then each view's own rows (FilterRow) in its slot.
import ClassIcon from '@/components/ClassIcon.vue'
import FilterRow from '@/components/FilterRow.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { t } from '@/lib/i18n.ts'
import { namePicker, PERIODS, type Period } from '@/lib/statsFilters.ts'
import { toRef } from 'vue'

const props = defineProps<{ characters: string[]; classOf: (name: string) => string | null }>()
const names = defineModel<string[]>('names', { required: true })
const period = defineModel<Period>('period', { required: true })

const { toggleName: toggle, picked } = namePicker(names, toRef(props, 'characters'))
</script>

<template>
  <div class="mb-5 space-y-3 rounded-xl border border-card p-4">
    <FilterRow label="Characters">
      <button
        v-for="name in characters"
        :key="name"
        type="button"
        :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', picked(name) ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
        @click="toggle(name)"
      >
        <ClassIcon :class-name="classOf(name)" :size="14" />{{ name }}
      </button>
      <button v-if="names.length" type="button" class="text-xs text-darker hover:text-default hover:underline" @click="names = []">{{ t('All') }}</button>
    </FilterRow>
    <FilterRow label="Period">
      <Segmented v-model="period" size="sm" :options="PERIODS" />
    </FilterRow>
    <slot />
  </div>
</template>
