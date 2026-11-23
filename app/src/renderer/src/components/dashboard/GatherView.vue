<script setup lang="ts">
// Gathering outcome: the pill over the game that says, as a gathering starts, how it will end
// (pages/GatherPage.vue), and its settings.
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import Button from '@/components/Button.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { playSound } from '@/lib/sound.ts'
import { useApp } from '@/stores/app.ts'
import { GATHER_DEFAULT_COLORS } from '@shared/settings.ts'
import { SOUNDS } from '@shared/sounds.ts'

const store = useApp()
const cfg = computed(() => store.settings.gather)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('gather', { ...cfg.value, ...patch })
const pct = (v: number): string => `${Math.round(v * 100)}%`
const times = (v: number): string => `×${v.toFixed(1)}`
/** The shipped sounds (your own mp3 belongs to the cube and enemy alerts). */
const sounds = SOUNDS.filter((s) => s.id !== 'custom').map((s) => ({ id: s.id, label: t(s.label) }))
</script>

<template>
  <div>
    <PageHeader title="Gathering outcome" :about="t('The game decides a gathering or a craft as it starts, seconds before the result: whether it fails, ranks up (Fine Odyle), gives twice as much, or procs (a craft\'s green item). This says it over the game as soon as it starts, with what it will give.')" />

    <Section title="Over the game">
      <SettingRow label="Gathering outcome" hint="A pill as each gathering starts, gone with its result. Clicks go through it; while the dashboard is open it shows a sample you can drag into place.">
        <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
      </SettingRow>
      <template v-if="cfg.enabled">
        <SettingRow label="Item icon" hint="What it will give. Each spot's kind is learnt from its first gathering (Odyle is known already).">
          <Toggle :model-value="cfg.icon" @update:model-value="set({ icon: $event })" />
        </SettingRow>
        <SettingRow label="Size">
          <Slider :model-value="cfg.scale" :min="0.6" :max="2" :step="0.1" :format="times" @update:model-value="set({ scale: $event })" />
        </SettingRow>
        <SettingRow label="Opacity">
          <Slider :model-value="cfg.opacity" :min="0.2" :max="1" :step="0.05" :format="pct" @update:model-value="set({ opacity: $event })" />
        </SettingRow>
      </template>
    </Section>

    <Section v-if="cfg.enabled" title="What to show">
      <SettingRow label="Will fail">
        <span class="flex items-center gap-2">
          <button v-if="cfg.failColor !== GATHER_DEFAULT_COLORS.fail" type="button" class="text-xs text-darker hover:text-default" @click="set({ failColor: GATHER_DEFAULT_COLORS.fail })">{{ t('Reset') }}</button>
          <input type="color" class="h-7 w-10 cursor-pointer rounded border border-light bg-transparent" :value="cfg.failColor" @change="set({ failColor: ($event.target as HTMLInputElement).value })" />
          <Toggle :model-value="cfg.fail" @update:model-value="set({ fail: $event })" />
        </span>
      </SettingRow>
      <SettingRow label="Rank up, x2 or proc" hint="A Fine Odyle from an Odyle node, twice as much, or a craft's better item (a green Splendent one where a white one is crafted).">
        <span class="flex items-center gap-2">
          <button v-if="cfg.rareColor !== GATHER_DEFAULT_COLORS.rare" type="button" class="text-xs text-darker hover:text-default" @click="set({ rareColor: GATHER_DEFAULT_COLORS.rare })">{{ t('Reset') }}</button>
          <input type="color" class="h-7 w-10 cursor-pointer rounded border border-light bg-transparent" :value="cfg.rareColor" @change="set({ rareColor: ($event.target as HTMLInputElement).value })" />
          <Toggle :model-value="cfg.rare" @update:model-value="set({ rare: $event })" />
        </span>
      </SettingRow>
      <SettingRow label="Crafts" hint="Crafts too: as each one starts, whether it will proc.">
        <Toggle :model-value="cfg.crafts" @update:model-value="set({ crafts: $event })" />
      </SettingRow>
      <SettingRow label="Plain ones" hint="Also the gatherings and crafts that will give the usual, in grey.">
        <Toggle :model-value="cfg.plain" @update:model-value="set({ plain: $event })" />
      </SettingRow>
    </Section>

    <Section v-if="cfg.enabled" title="Sound">
      <SettingRow label="When it will fail">
        <Toggle :model-value="cfg.soundFail" @update:model-value="set({ soundFail: $event })" />
      </SettingRow>
      <SettingRow label="When it will rank up, give x2 or proc">
        <Toggle :model-value="cfg.soundRare" @update:model-value="set({ soundRare: $event })" />
      </SettingRow>
      <template v-if="cfg.soundFail || cfg.soundRare">
        <SettingRow label="Sound">
          <span class="flex items-center gap-2">
            <Button size="sm" @click="playSound('cube', cfg.soundId, cfg.volume, true)">{{ t('Try it') }}</Button>
            <SelectBox size="sm" :model-value="cfg.soundId" :options="sounds" @update:model-value="set({ soundId: $event })" />
          </span>
        </SettingRow>
        <SettingRow label="Volume">
          <Slider :model-value="cfg.volume" :min="0" :max="1" :step="0.05" :format="pct" @update:model-value="set({ volume: $event })" />
        </SettingRow>
      </template>
    </Section>

    <Section title="Good to know">
      <p class="px-4 py-3 text-[13px] leading-relaxed text-dark">
        {{ t('Read from the message the game sends as a gathering starts: on the owner\'s first 17 gatherings, the outcome and the doubling it said were right every time. Cancelled, the pill goes away after 12 seconds.') }}
      </p>
    </Section>
  </div>
</template>
