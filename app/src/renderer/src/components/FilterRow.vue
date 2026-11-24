<script setup lang="ts">
// One row of a view's filters: its label (translated), then its controls.
import { t } from '@/lib/i18n.ts'

defineProps<{ label: string }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="w-24 text-xs text-darker">{{ t(label) }}</span>
    <slot />
  </div>
</template>
