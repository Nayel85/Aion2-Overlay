<script setup lang="ts">
// Party frames: the widget over the game with a bar per member of your party (pages/PartyPage.vue),
// and its settings: what each bar shows, its size and colours, and when it turns to the afflicted
// colour.
import { percent } from '@shared/format.ts'
import IdleHideRow from '@/components/IdleHideRow.vue'
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { PARTY_DEFAULT_COLORS } from '@shared/settings.ts'

const store = useApp()
const cfg = computed(() => store.settings.party)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('party', { ...cfg.value, ...patch })
const px = (v: number): string => `${v} px`
const HP_TEXT = [
  { id: 'none', label: 'None' },
  { id: 'percent', label: 'Percent' },
  { id: 'value', label: 'HP' },
] as const
const AFFLICTED_BY = [
  { id: 'any', label: 'Any debuff' },
  { id: 'control', label: 'Control effects' },
] as const
</script>

<template>
  <div>
    <PageHeader title="Party frames" :about="t('A bar per member of your party over the game, made to heal by: their class and name on their HP, turning to another colour while a monster\'s debuff is on them. Up while you are in a party.')" />

    <Section title="Over the game">
      <SettingRow label="Party frames" hint="Comes up by itself in a party. Drag it to move it.">
        <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
      </SettingRow>
      <template v-if="cfg.enabled">
        <SettingRow label="Show yourself" hint="Your own bar among the others.">
          <Toggle :model-value="cfg.self" @update:model-value="set({ self: $event })" />
        </SettingRow>
        <SettingRow label="Title bar" hint="A header with a button to minimize it and one to hide it until the next party.">
          <Toggle :model-value="cfg.header" @update:model-value="set({ header: $event })" />
        </SettingRow>
        <SettingRow label="Opacity">
          <Slider :model-value="cfg.opacity" :min="0.2" :max="1" :step="0.05" :format="percent" @update:model-value="set({ opacity: $event })" />
        </SettingRow>
        <IdleHideRow :value="cfg" @set="set" />
      </template>
    </Section>

    <Section v-if="cfg.enabled" title="Each bar">
      <SettingRow label="Class icon">
        <Toggle :model-value="cfg.icon" @update:model-value="set({ icon: $event })" />
      </SettingRow>
      <SettingRow label="HP as text" hint="On the right of the bar.">
        <Segmented size="sm" :model-value="cfg.hpText" :options="HP_TEXT" @update:model-value="set({ hpText: $event })" />
      </SettingRow>
      <SettingRow label="Debuff icons" hint="Under the bar, with the seconds left; those taking control ringed in red.">
        <Toggle :model-value="cfg.debuffIcons" @update:model-value="set({ debuffIcons: $event })" />
      </SettingRow>
      <SettingRow label="Shields" hint="A shield on the bar of a member with one on them (a Damage Absorption, a barrier).">
        <Toggle :model-value="cfg.shields" @update:model-value="set({ shields: $event })" />
      </SettingRow>
      <SettingRow label="Boss's target" hint="A red target on the member the boss is on: the last it hit, for 6 seconds.">
        <Toggle :model-value="cfg.bossTarget" @update:model-value="set({ bossTarget: $event })" />
      </SettingRow>
      <SettingRow label="Width">
        <Slider :model-value="cfg.width" :min="100" :max="320" :step="5" :format="px" @update:model-value="set({ width: $event })" />
      </SettingRow>
      <SettingRow label="Height">
        <Slider :model-value="cfg.barHeight" :min="14" :max="40" :step="1" :format="px" @update:model-value="set({ barHeight: $event })" />
      </SettingRow>
      <SettingRow label="Space between">
        <Slider :model-value="cfg.gap" :min="0" :max="12" :step="1" :format="px" @update:model-value="set({ gap: $event })" />
      </SettingRow>
      <SettingRow label="Text size">
        <Slider :model-value="cfg.fontSize" :min="9" :max="18" :step="1" :format="px" @update:model-value="set({ fontSize: $event })" />
      </SettingRow>
    </Section>

    <Section v-if="cfg.enabled" title="Colours">
      <SettingRow label="HP" hint="The bar as it is.">
        <span class="flex items-center gap-2">
          <button v-if="cfg.hpColor !== PARTY_DEFAULT_COLORS.hp" type="button" class="text-xs text-darker hover:text-default" @click="set({ hpColor: PARTY_DEFAULT_COLORS.hp })">{{ t('Reset') }}</button>
          <input type="color" class="h-7 w-10 cursor-pointer rounded border border-light bg-transparent" :value="cfg.hpColor" @change="set({ hpColor: ($event.target as HTMLInputElement).value })" />
        </span>
      </SettingRow>
      <SettingRow label="Afflicted" hint="The bar while a debuff is on them, to cleanse.">
        <span class="flex items-center gap-2">
          <button v-if="cfg.afflictedColor !== PARTY_DEFAULT_COLORS.afflicted" type="button" class="text-xs text-darker hover:text-default" @click="set({ afflictedColor: PARTY_DEFAULT_COLORS.afflicted })">{{ t('Reset') }}</button>
          <input type="color" class="h-7 w-10 cursor-pointer rounded border border-light bg-transparent" :value="cfg.afflictedColor" @change="set({ afflictedColor: ($event.target as HTMLInputElement).value })" />
        </span>
      </SettingRow>
      <SettingRow label="Afflicted by" hint="Any debuff a monster or the other faction put on them, or only those taking control (stuns, roots, fear, sleep...).">
        <Segmented size="sm" :model-value="cfg.afflictedBy" :options="AFFLICTED_BY" @update:model-value="set({ afflictedBy: $event })" />
      </SettingRow>
    </Section>

    <Section title="Good to know">
      <p class="px-4 py-3 text-[13px] leading-relaxed text-dark">
        {{ t('A member at 0 HP is down: grey, struck through, with a skull. One the game has said nothing of for 10 seconds is out of range, and fades; the game sends HP and debuffs only of members near you. It names the members as the party changes: a member who joined before the overlay started shows once the party changes again. A debuff is one a monster or a player of the other faction put on them; your party\'s members\' never count, whatever their faction.') }}
      </p>
    </Section>
  </div>
</template>
