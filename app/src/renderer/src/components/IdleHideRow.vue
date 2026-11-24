<script setup lang="ts">
// An overlay's "Hide while idle": a switch and, on, after how long without a fight.
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import type { IdleHide } from '@shared/settings.ts'

defineProps<{ value: IdleHide }>()
const emit = defineEmits<{ set: [patch: Partial<IdleHide>] }>()
const AFTER = [10, 30, 60, 120, 300].map((s) => ({ id: s, label: s < 60 ? t('{n} s', { n: s }) : t('{n} min', { n: s / 60 }) }))
</script>

<template>
  <SettingRow label="Hide while idle" hint="Hidden after this long with no fight (no hit, heal or damage taken, yours or your party's); back with the next one.">
    <div class="flex items-center gap-3">
      <SelectBox v-if="value.hideIdle" size="sm" :model-value="value.idleSeconds" :options="AFTER" @update:model-value="emit('set', { idleSeconds: $event })" />
      <Toggle :model-value="value.hideIdle" @update:model-value="emit('set', { hideIdle: $event })" />
    </div>
  </SettingRow>
</template>
