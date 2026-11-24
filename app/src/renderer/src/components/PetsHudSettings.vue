<script setup lang="ts">
// The pets HUD's settings (pages/HudPage.vue), on the Pets page: what it shows, its look, and the
// pets left out (maxed) and the Black Cloud Merchant's window.
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import { percent } from '@shared/format.ts'
import Button from '@/components/Button.vue'
import SettingRow from '@/components/SettingRow.vue'
import SoundPicker from '@/components/SoundPicker.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const HUD_MODES = [
  { id: 'recent' as const, label: "This session's pets" },
  { id: 'pinned' as const, label: 'Pinned pets' },
]
</script>

<template>
  <Section title="Pets HUD" icon="M5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 9c-2 0-3.5 2-3.5 3.3 0 1 1 1.2 2.2 1.2.6 0 .9-.3 1.3-.3s.7.3 1.3.3c1.2 0 2.2-.2 2.2-1.2C11.5 11 10 9 8 9Z">
    <SettingRow label="Show the HUD" hint="Souls as they drop, the soul monsters around you and Hidden Cubes, over the game (borderless or windowed mode).">
      <Toggle :model-value="store.settings.hud.enabled" @update:model-value="store.setHud({ enabled: $event })" />
    </SettingRow>
    <template v-if="store.settings.hud.enabled">
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
      <SettingRow label="Kina per hour" hint="This session's Kina per hour, at the top right of the HUD.">
        <Toggle :model-value="store.settings.hud.kina" @update:model-value="store.setHud({ kina: $event })" />
      </SettingRow>
      <SettingRow label="Abyss Points per hour" hint="This session's Abyss Points per hour, beside the Kina at the top right of the HUD.">
        <Toggle :model-value="store.settings.hud.abyss" @update:model-value="store.setHud({ abyss: $event })" />
      </SettingRow>
      <SettingRow label="Hidden Cubes" hint="A cube in view (the game tells you within about 100 m) at the top of the HUD, with how far and which way.">
        <Toggle :model-value="store.settings.hud.cubes" @update:model-value="store.setHud({ cubes: $event })" />
      </SettingRow>
      <SettingRow v-if="store.settings.hud.cubes" label="Sound for a cube" hint="When one comes into view.">
        <Toggle :model-value="store.settings.hud.cubeSound" @update:model-value="store.setHud({ cubeSound: $event })" />
      </SettingRow>
      <template v-if="store.settings.hud.cubes && store.settings.hud.cubeSound">
        <SoundPicker kind="cube" label="Cube sound" />
      </template>
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
    </template>
    <SettingRow label="Hide maxed (Lv3) pets" hint="They earn no more souls: left out of the Pets page, Nearby and the HUD.">
      <Toggle :model-value="store.settings.hideMaxed" @update:model-value="store.set('hideMaxed', $event)" />
    </SettingRow>
    <SettingRow label="Black Cloud Merchant pets" hint="When you open one of its tabs, a window lists the pets it sells that you have not maxed: prices, and where they spawn.">
      <Toggle :model-value="store.settings.hud.merchant" @update:model-value="store.setHud({ merchant: $event })" />
    </SettingRow>
    <OverlayWindowSettings v-if="store.settings.hud.merchant" overlay="merchant" setting="hud" :opacity-min="null" />
  </Section>
</template>
