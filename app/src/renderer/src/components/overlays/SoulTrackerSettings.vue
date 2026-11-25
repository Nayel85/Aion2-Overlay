<script setup lang="ts">
// The Soul Tracker: souls as they drop, the soul monsters around you and your pets' progress
// (pages/HudPage.vue).
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const HUD_MODES = [
  { id: 'recent' as const, label: "This session's pets" },
  { id: 'pinned' as const, label: 'Pinned pets' },
]
</script>

<template>
  <Section bare>
    <SettingRow label="Show the Soul Tracker" hint="Souls as they drop, the soul monsters around you and your pets' progress, over the game (borderless or windowed mode).">
      <Toggle :model-value="store.settings.hud.enabled" @update:model-value="store.setHud({ enabled: $event })" />
    </SettingRow>
    <SettingRow label="Nearby section" hint="At the top: the soul monsters around you, with the pet each drops.">
      <Toggle :model-value="store.settings.hud.nearby" @update:model-value="store.setHud({ nearby: $event })" />
    </SettingRow>
    <SettingRow v-if="store.settings.hud.nearby" label="How many nearby">
      <Slider :model-value="store.settings.hud.nearbyCount" :min="1" :max="8" :step="1" @update:model-value="store.setHud({ nearbyCount: $event })" />
    </SettingRow>
    <SettingRow label="Below it" :hint="({ pinned: 'Pin pets on the Pets page.', recent: 'Pets you gained souls for, latest first.' })[store.settings.hud.mode]">
      <SelectBox :model-value="store.settings.hud.mode" :options="HUD_MODES" @update:model-value="store.setHud({ mode: $event })" />
    </SettingRow>
    <SettingRow v-if="store.settings.hud.mode !== 'pinned'" label="How many this session">
      <Slider :model-value="store.settings.hud.recentCount" :min="1" :max="8" :step="1" @update:model-value="store.setHud({ recentCount: $event })" />
    </SettingRow>
    <SettingRow label="Soul pop-ups" hint="A line for each soul as it drops.">
      <Toggle :model-value="store.settings.hud.toasts" @update:model-value="store.setHud({ toasts: $event })" />
    </SettingRow>
    <SettingRow label="Hide without game traffic" hint="When the game has sent nothing for 15 seconds.">
      <Toggle :model-value="store.settings.hud.hideWithoutGame" @update:model-value="store.setHud({ hideWithoutGame: $event })" />
    </SettingRow>
    <SettingRow label="Clear between fights" hint="After this long with no kills or drops the HUD clears and hides until the next fight.">
      <Slider
        :model-value="store.settings.hud.idleHideSeconds"
        :min="0"
        :max="300"
        :step="15"
        :format="(v: number) => (v ? `${v}s` : t('Off'))"
        @update:model-value="store.setHud({ idleHideSeconds: $event })"
      />
    </SettingRow>
    <OverlayWindowSettings overlay="hud" setting="hud" :scale="[0.75, 1.75]" />
  </Section>
</template>
