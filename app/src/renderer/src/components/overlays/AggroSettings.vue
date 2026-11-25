<script setup lang="ts">
// Aggro: the monsters on you (pages/AggroPage.vue).
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.aggro)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('aggro', { ...cfg.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show the monsters on me" hint="While monsters are on you: each one, the bosses first, with how long it has been on you. One is on you when its last hit was on you, or when you hit it and it is on no one else; it leaves the list when it dies or lets go of you (its target none), or has done nothing to you for 6 seconds. Clicks pass through it; while this window is open it shows a preview you can drag into place.">
      <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="aggro" setting="aggro" />
  </Section>
</template>
