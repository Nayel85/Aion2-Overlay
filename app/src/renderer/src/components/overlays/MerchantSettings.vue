<script setup lang="ts">
// The Black Cloud Merchant window: the pets it sells that you have not maxed, as you open its shop
// (pages/MerchantPage.vue).
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
</script>

<template>
  <Section bare>
    <SettingRow label="Show as you open the shop" hint="When you open one of its tabs, a window lists the pets it sells that you have not maxed: prices, where they come from, and where they spawn.">
      <Toggle :model-value="store.settings.hud.merchant" @update:model-value="store.setHud({ merchant: $event })" />
    </SettingRow>
    <OverlayWindowSettings v-if="store.settings.hud.merchant" overlay="merchant" setting="hud" :opacity-min="null" />
  </Section>
</template>
