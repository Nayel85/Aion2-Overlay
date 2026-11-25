<script setup lang="ts">
// A label and its hint on the left, the control on the right; a warning in red under the label.
// The text is given in English and shown in the language picked (lib/i18n.ts). `data-setting`: the
// settings search finds it on its page (lib/settingsSearch.ts).
import { t } from '@/lib/i18n.ts'
defineProps<{ label: string; hint?: string; warning?: string }>()
</script>

<template>
  <div class="flex items-center justify-between gap-6 rounded-md py-3 transition-colors" :data-setting="label">
    <div class="min-w-0">
      <div class="text-sm">{{ t(label) }}</div>
      <div v-if="hint" class="text-xs leading-snug text-darker">{{ t(hint) }}</div>
      <div v-if="warning" class="text-xs leading-snug text-danger">{{ t(warning) }}</div>
    </div>
    <div class="shrink-0"><slot /></div>
  </div>
</template>
