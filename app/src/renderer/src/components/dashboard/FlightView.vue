<script setup lang="ts">
// The flight timer: the ring over the game with your seconds of flight left (pages/FlightPage.vue),
// and its settings.
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import { percent } from '@shared/format.ts'
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.flight)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('flight', { ...cfg.value, ...patch })
</script>

<template>
  <div>
    <PageHeader title="Flight timer" :about="t('A ring over the game with your seconds of flight left at the way you fly now; on the ground, how long until your flight power is full again.')" />

    <Section title="Over the game">
      <SettingRow label="Flight timer" hint="Up while flying or refilling, gone at full. Clicks go through it; while the dashboard is open, drag it into place.">
        <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
      </SettingRow>
      <OverlayWindowSettings v-if="cfg.enabled" overlay="flight" setting="flight" :opacity-min="0.2" />
    </Section>

    <Section title="Good to know">
      <p class="px-4 py-3 text-[13px] leading-relaxed text-dark">
        {{ t('The seconds change with the way you fly: gliding drains less than flying, flying fast more. Green, then yellow under 15 seconds and red under 5. The maximum is known once you log in a character: started mid-game, the ring shows no gauge until then.') }}
      </p>
    </Section>
  </div>
</template>
