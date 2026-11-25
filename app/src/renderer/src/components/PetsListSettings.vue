<script setup lang="ts">
// The Pets page's own settings: the pets left out (maxed). The Soul Tracker's and the Black Cloud
// Merchant window's are on the Overlays page; the Hidden Cubes' on the Map page.
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
</script>

<template>
  <Section title="Pets list" icon="M2.5 3.5h11M2.5 8h11M2.5 12.5h7">
    <SettingRow label="Hide maxed (Lv3) pets" hint="They earn no more souls: left out of the Pets page, Nearby and the HUD.">
      <Toggle :model-value="store.settings.hideMaxed" @update:model-value="store.set('hideMaxed', $event)" />
    </SettingRow>
  </Section>
</template>
