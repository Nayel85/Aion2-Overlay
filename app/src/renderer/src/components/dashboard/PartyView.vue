<script setup lang="ts">
// Party frames: the widget over the game with each member of your party, their class, name and HP
// (pages/PartyPage.vue), and its settings.
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.party)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('party', { ...cfg.value, ...patch })
const pct = (v: number): string => `${Math.round(v * 100)}%`
const flight = computed(() => store.settings.flight)
const setFlight = (patch: Partial<typeof flight.value>): void => void store.set('flight', { ...flight.value, ...patch })
</script>

<template>
  <div>
    <PageHeader title="Party frames" :about="t('Each member of your party over the game: class, name and HP, as the game sends it about once a second. Up while you are in a party.')" />

    <Section title="Over the game">
      <SettingRow label="Party frames" hint="Comes up by itself in a party. Move it by its header; its dash minimizes it and its X hides it until the next party.">
        <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
      </SettingRow>
      <template v-if="cfg.enabled">
        <SettingRow label="Show yourself" hint="Your own frame among the others.">
          <Toggle :model-value="cfg.self" @update:model-value="set({ self: $event })" />
        </SettingRow>
        <SettingRow label="Opacity">
          <Slider :model-value="cfg.opacity" :min="0" :max="1" :step="0.05" :format="pct" @update:model-value="set({ opacity: $event })" />
        </SettingRow>
      </template>
    </Section>

    <Section title="Flight timer">
      <SettingRow label="Flight timer" hint="Seconds of flight left at the way you fly now, with a gauge of your flight power; on the ground, how long until it is full again. Clicks go through it; while the dashboard is open, drag it into place.">
        <Toggle :model-value="flight.enabled" @update:model-value="setFlight({ enabled: $event })" />
      </SettingRow>
      <SettingRow v-if="flight.enabled" label="Opacity">
        <Slider :model-value="flight.opacity" :min="0.2" :max="1" :step="0.05" :format="pct" @update:model-value="setFlight({ opacity: $event })" />
      </SettingRow>
    </Section>

    <Section title="Good to know">
      <p class="px-4 py-3 text-[13px] leading-relaxed text-dark">
        {{ t('A member at 0 HP is down: dimmed, with a skull. One the game has said nothing of for 10 seconds is out of range, and fades. The game names the members as the party changes: a member who joined before the overlay started shows once the party changes again, or once they are seen.') }}
      </p>
    </Section>
  </div>
</template>
