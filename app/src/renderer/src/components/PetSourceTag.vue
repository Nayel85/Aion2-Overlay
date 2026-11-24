<script setup lang="ts">
// Where a pet comes from, when it is not ordinary open-world monsters (lib/petSources.ts): a boss
// in red, an instance in blue, the Black Cloud Merchant (or another known source) in yellow.
import { computed } from 'vue'
import { t } from '@/lib/i18n.ts'
import { petSourceTag } from '@/lib/petSources.ts'

const props = defineProps<{ id: number }>()
const tag = computed(() => petSourceTag(props.id))
const TONE = { boss: 'border-red/40 bg-red/10 text-red', instance: 'border-blue/40 bg-blue/10 text-blue', merchant: 'border-yellow/40 bg-yellow/10 text-yellow' } as const
/** The words, translated by their kind ("Boss: {names}"...). */
const text = computed(() => {
  const g = tag.value
  if (!g) return ''
  const [head, ...rest] = g.text.split(': ')
  return rest.length ? `${t(head!)}: ${rest.join(': ')}` : t(g.text)
})
</script>

<template>
  <span v-if="tag" :class="['inline-flex max-w-full shrink-0 items-center truncate rounded border px-1 text-[10px] font-semibold', TONE[tag.kind]]" :title="t(tag.title)">{{ text }}</span>
</template>
