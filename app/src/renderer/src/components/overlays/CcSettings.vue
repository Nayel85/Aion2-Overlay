<script setup lang="ts">
// CC / Debuffs: a banner while you lose control (pages/CcPage.vue).
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.buffs)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('buffs', { ...cfg.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show when I lose control" hint="A banner mid-screen while you are stunned, knocked down, rooted, feared, silenced... with the seconds left. Clicks pass through it; while this window is open it shows a preview you can drag into place.">
      <Toggle :model-value="cfg.cc" @update:model-value="set({ cc: $event })" />
    </SettingRow>
    <SettingRow label="Monsters' other debuffs" hint="Under the banner: the other debuffs monsters put on you (poisons, slows...), with their time left.">
      <Toggle :model-value="cfg.ccDebuffs" @update:model-value="set({ ccDebuffs: $event })" />
    </SettingRow>
    <OverlayWindowSettings overlay="cc" setting="buffs" :opacity-min="null" />
  </Section>
</template>
