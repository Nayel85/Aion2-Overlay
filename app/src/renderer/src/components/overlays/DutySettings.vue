<script setup lang="ts">
// The Duty Board window: the board's advice over the game as you open it (pages/DutyPage.vue); what
// each reward is worth to you is on the Duty Board page.
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.duty)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('duty', { ...cfg.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show as you open the board" hint="As you open the duty board in game, reroll it or take a mission, its advice shows over the game; it closes as you move, fight or close the board, or with its X.">
      <Toggle :model-value="cfg.overlay" @update:model-value="set({ overlay: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="duty" setting="duty" />
  </Section>
</template>
