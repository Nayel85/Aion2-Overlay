<script setup lang="ts">
// Nearby Enemies: players of the other faction around you (pages/EnemiesPage.vue), with their sound.
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import SoundPicker from '@/components/SoundPicker.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'
import type { Settings } from '@shared/settings.ts'

const store = useApp()
const set = (patch: Partial<Settings['enemies']>): void => void store.set('enemies', { ...store.settings.enemies, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show Nearby Enemies" hint="Players of the other faction your game has loaded around you, with server, combat power and legion. Hidden while there are none; drag it while this window is open.">
      <Toggle :model-value="store.settings.enemies.enabled" @update:model-value="set({ enabled: $event })" />
    </SettingRow>
    <SettingRow label="Enemies on the map" hint="A pin on the minimap where each enemy was last seen: as they come into view, then as effects and skills land on them. Red when they can attack you (PvP on, or anyone in the Abyss), grey with their PvP off.">
      <Toggle :model-value="store.settings.enemies.mapPins" @update:model-value="set({ mapPins: $event })" />
    </SettingRow>
    <SettingRow label="Their item level" hint="Each one's gear score (ilvl), once the game has sent their card: as you target them, or in a fight.">
      <Toggle :model-value="store.settings.enemies.gearScore" @update:model-value="set({ gearScore: $event })" />
    </SettingRow>
    <SettingRow label="Their combat power" hint="Each one's CP, once the game has sent it.">
      <Toggle :model-value="store.settings.enemies.combatPower" @update:model-value="set({ combatPower: $event })" />
    </SettingRow>
    <SettingRow label="Sound for an enemy" hint="When one comes into view (the same player at most once a minute).">
      <Toggle :model-value="store.settings.enemies.sound" @update:model-value="set({ sound: $event })" />
    </SettingRow>
    <template v-if="store.settings.enemies.sound">
      <SettingRow label="Only enemies with PvP on" hint="The sound only for those who can attack you: with their PvP on, or anyone in the Abyss. The list shows them all, PvP on first, with a PvP mark.">
        <Toggle :model-value="store.settings.enemies.pvpOnly" @update:model-value="set({ pvpOnly: $event })" />
      </SettingRow>
      <SoundPicker kind="enemy" label="Enemy sound" />
    </template>
    <OverlayWindowSettings overlay="enemies" setting="enemies" :opacity-min="0" opacity-label="Enemies background" opacity-hint="At None the text keeps a dark glow, readable on the game." />
  </Section>
</template>
