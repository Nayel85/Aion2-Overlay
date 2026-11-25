<script setup lang="ts">
// The characters to pick from, each a chip with their class icon (CharName): one (a string, or null for
// all of them) or several (a list, empty for all), "All characters" first unless one must be picked.
// Every page that filters by character uses it.
import CharName from '@/components/CharName.vue'
import Chip from '@/components/ui/Chip.vue'
import { t } from '@/lib/i18n.ts'

const props = withDefaults(
  defineProps<{
    /** Their names, or ids with their names (the Inventory's). */
    characters: (string | { id: string; name: string })[]
    /** Several at once (the model a list), or one (a string, null for all). */
    multiple?: boolean
    /** "All characters" first; false: one must be picked. */
    all?: boolean
  }>(),
  { multiple: false, all: true },
)
const model = defineModel<string | null | string[]>({ required: true })

const id = (c: string | { id: string }): string => (typeof c === 'string' ? c : c.id)
const name = (c: string | { name: string }): string => (typeof c === 'string' ? c : c.name)
const none = (): boolean => (Array.isArray(model.value) ? !model.value.length : model.value === null)
const picked = (c: string | { id: string }): boolean => (Array.isArray(model.value) ? model.value.includes(id(c)) : model.value === id(c))
function pick(c: string | { id: string }): void {
  if (!props.multiple) return void (model.value = id(c))
  const list = Array.isArray(model.value) ? model.value : []
  model.value = list.includes(id(c)) ? list.filter((x) => x !== id(c)) : [...list, id(c)]
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Chip v-if="all" :on="none()" @click="model = multiple ? [] : null">{{ t('All characters') }}</Chip>
    <Chip v-for="c in characters" :key="id(c)" :on="picked(c)" @click="pick(c)"><CharName :name="name(c)" /></Chip>
    <slot />
  </div>
</template>
