<script setup lang="ts">
// The Event Bar: the events with an alert on, as countdowns over the game (pages/TimerBarPage.vue);
// which events alert is set on the Events page.
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const bar = computed(() => store.settings.timerBar)
const set = (patch: Partial<typeof bar.value>): void => void store.set('timerBar', { ...bar.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show the Event Bar" hint="The events with an alert on (set on the Events page), starting within 13 hours, over the game.">
      <Toggle :model-value="bar.enabled" @update:model-value="set({ enabled: $event })" />
    </SettingRow>
    <SettingRow label="Layout">
      <Segmented size="sm" :model-value="bar.layout" :options="[{ id: 'bar', label: 'Bar' }, { id: 'list', label: 'List' }] as const" @update:model-value="set({ layout: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="timerbar" setting="timerBar" />
  </Section>
</template>
