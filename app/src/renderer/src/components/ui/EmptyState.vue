<script setup lang="ts">
// What a page shows while it has nothing: what is missing, and how it comes (its hint), in a dashed box;
// an icon above when given (its slot). Every page's empty state.
import { t } from '@/lib/i18n.ts'

withDefaults(defineProps<{ title: string; hint?: string; size?: 'sm' | 'md' }>(), { hint: undefined, size: 'md' })
</script>

<template>
  <div :class="['flex flex-col items-center gap-1 rounded-xl border border-dashed border-card px-4 text-center', size === 'sm' ? 'py-6' : 'py-10']">
    <slot />
    <div class="text-sm font-medium">{{ t(title) }}</div>
    <div v-if="hint" class="max-w-md text-xs text-darker">{{ t(hint) }}</div>
  </div>
</template>
