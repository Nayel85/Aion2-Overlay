<script setup lang="ts">
// My Skills: your own damage on the meter's target, skill by skill (pages/SkillsPage.vue).
import { computed } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const skills = computed(() => store.settings.skills)
const set = (patch: Partial<typeof skills.value>): void => void store.set('skills', { ...skills.value, ...patch })
</script>

<template>
  <Section bare>
    <SettingRow label="Show my skills over the game" hint="Your own damage on the meter's target, skill by skill: DPS, share and damage of each.">
      <Toggle :model-value="skills.enabled" @update:model-value="set({ enabled: $event })" />
    </SettingRow>
    <SettingRow v-if="skills.enabled" label="Skills listed">
      <Slider :model-value="skills.rows" :min="1" :max="20" :step="1" @update:model-value="set({ rows: $event })" />
    </SettingRow>
    <OverlayWindowSettings v-if="skills.enabled" overlay="skills" setting="skills" idle />
  </Section>
</template>
