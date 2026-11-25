<script setup lang="ts">
// A filter's pill: on or off, its own colour when on (the accent's by default), its count beside it.
// Every row of filters (characters, genera, continents, sources...) is made of these.
withDefaults(defineProps<{ on: boolean; tone?: string; count?: number; size?: 'sm' | 'md' }>(), {
  tone: 'border-accent bg-accent/15 text-default',
  count: undefined,
  size: 'md',
})
</script>

<template>
  <button
    type="button"
    :class="[
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xs transition',
      size === 'sm' ? 'py-0.5' : 'py-1',
      on ? tone : 'border-light text-darker hover:text-default',
    ]"
  >
    <slot /><span v-if="count !== undefined" class="tabular-nums opacity-60">{{ count }}</span>
  </button>
</template>
