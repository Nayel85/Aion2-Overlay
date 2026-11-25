<script setup lang="ts">
// The Kill Feed: this session's kills and deaths, and each player kill around you (pages/KillFeedPage.vue).
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { bridge } from '@/lib/bridge.ts'
import { useApp } from '@/stores/app.ts'
import type { Settings } from '@shared/settings.ts'

const store = useApp()
const open = computed(() => store.settings.killFeed.open)
const toggle = (): void => void bridge().invoke(open.value ? 'killfeed:close' : 'killfeed:open')
const set = (patch: Partial<Settings['killFeed']>): void => void store.set('killFeed', { ...store.settings.killFeed, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show the Kill Feed" hint="This session's kills and deaths, and each player kill around you as it happens.">
      <Toggle :model-value="open" @update:model-value="toggle" />
    </SettingRow>
    <SettingRow label="Your target" hint="Under the kills and deaths: the player you last targeted, with level, server, class and combat power (enemies in red). For 2 minutes, or until you target another.">
      <Toggle :model-value="store.settings.killFeed.target" @update:model-value="set({ target: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="killfeed" setting="killFeed" :opacity-min="0" opacity-label="Kill feed background" opacity-hint="At None the text keeps a dark glow, readable on the game." idle />
  </Section>
</template>
