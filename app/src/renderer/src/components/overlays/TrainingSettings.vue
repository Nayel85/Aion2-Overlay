<script setup lang="ts">
// The Training overlay: a training dummy run's clock and DPS over the game (pages/TrainingPage.vue);
// the runs themselves are on the Training page.
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.dummy)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('dummy', { ...cfg.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show the Training overlay" hint="A small panel over the game while you train: the clock, your DPS, start and stop.">
      <Toggle :model-value="cfg.overlay" @update:model-value="set({ overlay: $event })" />
    </SettingRow>
    <OverlayWindowSettings v-if="cfg.overlay" overlay="training" setting="dummy" :opacity-min="null" idle />
  </Section>
</template>
