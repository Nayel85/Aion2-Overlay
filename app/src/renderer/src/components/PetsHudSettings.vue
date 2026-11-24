<script setup lang="ts">
// The Pets page's settings, each part on its own: the pets HUD over the game (pages/HudPage.vue),
// the Black Cloud Merchant's window (pages/MerchantPage.vue), and the pets left out (maxed). The Hidden
// Cubes' are on the Map page; the session's Kina and Abyss Points per hour on the Unified HUD.
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import { percent } from '@shared/format.ts'
import Button from '@/components/Button.vue'
import SettingRow from '@/components/SettingRow.vue'
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
  </Section>

  <Section title="Black Cloud Merchant window" icon="M2.5 5.5h11l-1 8h-9zM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" class="mt-6">
    <SettingRow label="Show as you open the shop" hint="When you open one of its tabs, a window lists the pets it sells that you have not maxed: prices, where they come from, and where they spawn.">
      <Toggle :model-value="store.settings.hud.merchant" @update:model-value="store.setHud({ merchant: $event })" />
    </SettingRow>
    <OverlayWindowSettings v-if="store.settings.hud.merchant" overlay="merchant" setting="hud" :opacity-min="null" />
  </Section>

  <Section title="Pets list" icon="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" class="mt-6">
    <SettingRow label="Hide maxed (Lv3) pets" hint="They earn no more souls: left out of the Pets page, Nearby and the HUD.">
      <Toggle :model-value="store.settings.hideMaxed" @update:model-value="store.set('hideMaxed', $event)" />
    </SettingRow>
  </Section>
</template>
