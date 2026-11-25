<script setup lang="ts">
// Join requests: the widget over the game that lists everyone who asks to join your party
// (pages/ApplicantsPage.vue), and its settings. The game shows only the first request until it is
// answered; this shows all of them, with class, combat power and gear score.
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.applicants)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('applicants', { ...cfg.value, ...patch })
/** How long it stays after the last request. */
const HIDE = [15, 30, 45, 60, 90, 120, 180, 300]
const label = (s: number): string => (s < 60 ? t('{n} seconds', { n: s }) : s === 60 ? t('1 minute') : t('{n} minutes', { n: s / 60 }))
const choices = computed(() => [...new Set([...HIDE, cfg.value.hideAfter])].sort((a, b) => a - b).map((s) => ({ id: s, label: label(s) })))
</script>

<template>
  <div>
    <PageHeader
      title="Join requests"
      :about="t('The game only shows the first person who asks to join your party until you answer it. This lists all of them, with their class, combat power and gear score, as they apply.')"
    />

    <Section title="Over the game">
      <SettingRow label="Join requests list" hint="Comes up by itself when someone applies to your party. Move it by its header; its dash minimizes it and its X hides it until the next request. The X on a row takes that person off the list.">
        <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
      </SettingRow>
      <SettingRow label="Hides after" hint="With no new request for this long, the list goes away. A new request brings it back, and starts the time over.">
        <SelectBox size="sm" :model-value="cfg.hideAfter" :options="choices" @update:model-value="set({ hideAfter: $event })" />
      </SettingRow>
      <OverlayWindowSettings overlay="applicants" setting="applicants" :opacity-min="0" />
    </Section>

    <Section title="Good to know">
      <p class="px-4 py-3 text-[13px] leading-relaxed text-dark">
        {{ t('A person leaves the list when they join your party or cancel. The game sends nothing when you reject someone, so a rejected request stays until the time above passes, or until you remove it with its X.') }}
      </p>
    </Section>
  </div>
</template>
