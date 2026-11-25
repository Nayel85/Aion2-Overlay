<script setup lang="ts">
// The Minimap: a small map over the game that follows you (pages/MiniMapPage.vue).
import { computed } from 'vue'
import Button from '@/components/Button.vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { SETTINGS_DEFAULTS } from '@shared/settings.ts'

const store = useApp()
const mini = computed(() => store.settings.minimap)
const set = (patch: Partial<typeof mini.value>): void => void store.set('minimap', { ...mini.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show the minimap" hint="A small map over the game that follows you, with your tracked pets' spawns and the Hidden Cubes. Scroll or use + and − to zoom.">
      <Toggle :model-value="mini.enabled" @update:model-value="set({ enabled: $event })" />
    </SettingRow>
    <SettingRow label="Size" hint="Drag the map's bottom-right corner to resize it; a double-click there resets it.">
      <div class="flex items-center gap-3">
        <span class="text-sm tabular-nums text-dark">{{ mini.size }} × {{ mini.height ?? mini.size }}</span>
        <Button size="sm" :disabled="mini.size === SETTINGS_DEFAULTS.minimap.size && mini.height === null" @click="set({ size: SETTINGS_DEFAULTS.minimap.size, height: null })">{{ t('Reset') }}</Button>
      </div>
    </SettingRow>
    <SettingRow label="Gatherables" hint="Ores, gemstones, logs and plants around you, as their icons: the ones pinned on the Gatherables page, or all of them while none is.">
      <Toggle :model-value="mini.gatherables" @update:model-value="set({ gatherables: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="minimap" setting="minimap" />
  </Section>
</template>
