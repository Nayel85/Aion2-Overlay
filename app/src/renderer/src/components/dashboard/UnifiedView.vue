<script setup lang="ts">
// The Unified HUD's page: what it is, a preview of the bar as these settings make it (a sample:
// Kina coming in, an event a few minutes away), and its settings (pages/UnifiedPage.vue).
import { computed } from 'vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import Segmented from '@/components/ui/Segmented.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { EVENT_ICONS } from '@/lib/timerView.ts'
import { useApp } from '@/stores/app.ts'
import { HUD_WIDGETS, KINA_ICONS, type HudWidget, type KinaIcon } from '@shared/settings.ts'

const store = useApp()
const cfg = computed(() => store.settings.unified)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('unified', { ...cfg.value, ...patch })
const pct = (v: number): string => `${Math.round(v * 100)}%`
const minutes = (list: number[]) => list.map((m) => ({ id: m, label: t('{n} min', { n: m }) }))
const COUNTDOWN = [5, 10, 15, 20, 30]
const STAY = [2, 5, 10, 15, 30]
const KINA_ICON_IMG: Record<KinaIcon, string | null> = {
  game: 'items/loot/Icon_Currency_Coin_GoldNonbinding.webp',
  bound: 'items/loot/Icon_Currency_Coin_GoldBinding.webp',
  gold: 'items/loot/Icon_Currency_Coin_gold.webp',
  drawn: null,
  word: null,
}
const KINA_ICON_LABELS: Record<KinaIcon, string> = { game: "The game's Kina", bound: "The game's bound Kina", gold: 'Gold coin', drawn: 'Drawn coin', word: 'The word' }
const WIDGET_LABELS: Record<HudWidget, string> = {
  party: 'Party frames', buffs: 'Buffs', cc: 'CC / Debuffs', flight: 'Flight timer', gather: 'Gathering outcome', applicants: 'Join requests', training: 'Training',
}
const SECONDS = [5, 8, 12, 20, 30]
const TARGET_STYLES = [
  { id: 'inline' as const, label: 'In the bar' },
  { id: 'strip' as const, label: 'Two lines under the bar' },
]
const TARGET_MODES = [
  { id: 'always' as const, label: 'Always' },
  { id: 'players' as const, label: 'While a player is selected' },
  { id: 'meter' as const, label: "As the meter is set" },
]
const BUTTON_ICONS = [
  'M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5',
  'M1.5 4l4.5-2 4 2 4.5-2v10l-4.5 2-4-2-4.5 2zM6 2v10M10 4v10',
  'M3 13 13 3M9.5 3H13v3.5M3 3l4 4M13 13l-3-3',
  'M2.5 4h2M2.5 8h2M2.5 12h2M6.5 4h7M6.5 8h7M6.5 12h4',
]
</script>

<template>
  <div>
    <PageHeader
      title="Unified HUD"
      about="One small bar at the top of the game, in place of a screen full of widgets. It stays compact, works by click, and shows things only when they matter. Every overlay can still open on its own from its buttons."
    >
      <Toggle :model-value="cfg.enabled" @update:model-value="set({ enabled: $event })" />
    </PageHeader>

    <!-- The bar as these settings make it. -->
    <div class="mb-6 flex flex-col items-center gap-2.5 rounded-xl border border-card bg-[#1b2224] px-4 py-5">
      <div class="flex h-9 items-center gap-2.5 whitespace-nowrap rounded-[14px] border px-2.5" :style="{ ...panelStyle(cfg.opacity), textShadow: cfg.opacity < 0.6 ? '0 1px 3px rgb(0 0 0 / 0.9)' : 'none', zoom: cfg.scale }">
        <template v-if="cfg.kina || cfg.kinaSession || cfg.season || cfg.abyssRate">
          <span v-if="cfg.kina || cfg.kinaSession" class="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-yellow">
            <img v-if="KINA_ICON_IMG[cfg.kinaIcon]" :src="KINA_ICON_IMG[cfg.kinaIcon]!" alt="" class="size-4" draggable="false" />
            <svg v-else-if="cfg.kinaIcon === 'drawn'" viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M6 6.2c.3-.7 1-1 2-1s1.9.5 1.9 1.3c0 1.8-3.8 1-3.8 2.9 0 .8.8 1.3 1.9 1.3s1.7-.3 2-1" stroke-linecap="round" /></svg>
            <span v-else class="font-medium text-darker">Kina</span>
            <span v-if="cfg.kinaSession">2.4M</span>
            <span v-if="cfg.kina" class="font-medium">1.72M<span class="text-darker">/h</span></span>
          </span>
          <span v-if="cfg.season || cfg.abyssRate" class="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-blue">
            <img :src="'items/abyss-point.webp'" alt="AP" class="size-4" draggable="false" />
            <span v-if="cfg.season">12.3k</span>
            <span v-if="cfg.abyssRate" class="font-medium">8.4k<span class="text-darker">/h</span></span>
          </span>
          <span class="h-4 w-px bg-light" />
        </template>
        <img src="/icon.png" alt="" class="size-[18px]" draggable="false" />
        <span v-if="cfg.clock" class="text-xs font-medium tabular-nums text-dark">21:52</span>
        <span v-if="cfg.odyle" class="flex items-center gap-1 text-xs font-medium tabular-nums text-dark"><img :src="'items/odyle-energy.webp'" alt="" class="size-4" draggable="false" />120</span>
        <template v-if="cfg.events">
          <span class="flex items-center gap-1 text-orange">
            <svg viewBox="0 0 16 16" class="size-[15px]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="EVENT_ICONS.shugo" /></svg>
            <span class="text-xs font-semibold tabular-nums">7:42</span>
          </span>
          <svg viewBox="0 0 16 16" class="size-[15px] text-darker" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="EVENT_ICONS.rift" /></svg>
        </template>
        <template>
          <span class="h-4 w-px bg-light" />
          <svg v-for="d in BUTTON_ICONS" :key="d" viewBox="0 0 16 16" class="mx-1 size-4 text-darker" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="d" /></svg>
        </template>
        <span v-if="cfg.ping" class="flex items-center gap-1.5 text-xs font-medium tabular-nums text-dark"><span class="size-1.5 rounded-full bg-green" />42 ms</span>
      </div>
      <span class="text-xs text-[#c4d0d3]">{{ t('A sample: at rest, with Kina coming in and an event 8 minutes away. Drag the real one in game to place it.') }}</span>
    </div>

    <p v-if="!cfg.enabled" class="rounded-xl border border-dashed border-card px-4 py-6 text-center text-sm text-darker">{{ t('The Unified HUD is off. Turn it on (top right) to choose what it shows.') }}</p>

    <template v-else>
      <Section title="Always on the bar">
        <SettingRow label="Next events" hint="The next two timers that have an alert on, as small icons: grey while far away, yellow within half an hour, orange with a countdown when close. Hover them for the whole list.">
          <div class="flex items-center gap-3">
            <SelectBox v-if="cfg.events" size="sm" :model-value="cfg.countdownMinutes" :options="minutes(COUNTDOWN)" @update:model-value="set({ countdownMinutes: $event })" />
            <Toggle :model-value="cfg.events" @update:model-value="set({ events: $event })" />
          </div>
        </SettingRow>
        <SettingRow label="Odyle Energy" hint="The Odyle Energy of the character you are playing.">
          <Toggle :model-value="cfg.odyle" @update:model-value="set({ odyle: $event })" />
        </SettingRow>
        <SettingRow label="Ping" hint="Your ping to the game server.">
          <Toggle :model-value="cfg.ping" @update:model-value="set({ ping: $event })" />
        </SettingRow>
        <SettingRow label="Local time" hint="A clock, for when you play full screen.">
          <Toggle :model-value="cfg.clock" @update:model-value="set({ clock: $event })" />
        </SettingRow>
      </Section>

      <Section title="Your target">
        <SettingRow label="Show my target" hint="When you hit something, the bar unfolds with its health, your damage and your DPS. For a player you select: class, legion, combat power and gear score. It folds away this long after your last hit.">
          <div class="flex items-center gap-3">
            <SelectBox v-if="cfg.target" size="sm" :model-value="cfg.targetSeconds" :options="SECONDS.map((s) => ({ id: s, label: t('{n} s', { n: s }) }))" @update:model-value="set({ targetSeconds: $event })" />
            <Toggle :model-value="cfg.target" @update:model-value="set({ target: $event })" />
          </div>
        </SettingRow>
        <SettingRow v-if="cfg.target" label="Target style" hint="In the bar: one short segment (name, combat power, health, DPS) that covers nothing under the bar, like the game's own target frame. Two lines under the bar: more detail, but it opens over what is below.">
          <SelectBox size="sm" :model-value="cfg.targetStyle" :options="TARGET_STYLES.map((o) => ({ id: o.id, label: t(o.label) }))" @update:model-value="set({ targetStyle: $event })" />
        </SettingRow>
        <SettingRow v-if="cfg.target" label="Follow my last hit" hint="Which target the DPS meter shows, here and in its own overlay. Always: the last thing you hit, a player or a boss, so hitting a player shows at once. While a player is selected: only then, and the meter's own setting the rest of the time.">
          <SelectBox size="sm" :model-value="cfg.targetMode" :options="TARGET_MODES.map((o) => ({ id: o.id, label: t(o.label) }))" @update:model-value="set({ targetMode: $event })" />
        </SettingRow>
      </Section>

      <Section title="Kina and Abyss Points">
        <SettingRow label="Abyss Points this session" hint="The Abyss Points you earned since you logged in with this character, with a coin, to the left of the bar. The Session page has them by source.">
          <Toggle :model-value="cfg.season" @update:model-value="set({ season: $event })" />
        </SettingRow>
        <SettingRow label="Kina this session" hint="The Kina you earned since you logged in with this character, rewards included, with a coin, to the left of the bar.">
          <Toggle :model-value="cfg.kinaSession" @update:model-value="set({ kinaSession: $event })" />
        </SettingRow>
        <SettingRow label="Kina icon">
          <div class="flex items-center gap-1">
            <button
              v-for="i in KINA_ICONS"
              :key="i"
              type="button"
              :class="['flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-xs font-semibold text-yellow', cfg.kinaIcon === i ? 'border-accent bg-accent/15' : 'border-light hover:bg-dark']"
              :title="t(KINA_ICON_LABELS[i])"
              @click="set({ kinaIcon: i })"
            >
              <img v-if="KINA_ICON_IMG[i]" :src="KINA_ICON_IMG[i]!" alt="" class="size-5" draggable="false" />
              <svg v-else-if="i === 'drawn'" viewBox="0 0 16 16" class="size-5" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M6 6.2c.3-.7 1-1 2-1s1.9.5 1.9 1.3c0 1.8-3.8 1-3.8 2.9 0 .8.8 1.3 1.9 1.3s1.7-.3 2-1" stroke-linecap="round" /></svg>
              <span v-else>Kina</span>
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Kina per hour" hint="Your farming's Kina per hour, always shown while on: quests', supply requests' and duty missions' rewards are left out.">
          <Toggle :model-value="cfg.kina" @update:model-value="set({ kina: $event })" />
        </SettingRow>
        <SettingRow label="Abyss Points per hour" hint="Your farming's Abyss Points per hour, at your pace of the last 15 seconds, always shown while on: rewards are left out.">
          <Toggle :model-value="cfg.abyssRate" @update:model-value="set({ abyssRate: $event })" />
        </SettingRow>
        <SettingRow label="Rift farm" hint="During a Spacetime Rift, show that rift's total Abyss Points instead of the hourly rate.">
          <Toggle :model-value="cfg.rift" @update:model-value="set({ rift: $event })" />
        </SettingRow>
      </Section>

      <Section title="Shows up when it matters">
        <SettingRow label="Join requests" hint="How many ask to join your party; click it for each one's class, combat power and gear score.">
          <Toggle :model-value="cfg.applicants" @update:model-value="set({ applicants: $event })" />
        </SettingRow>
        <SettingRow label="Personal bests" hint="A personal best you just beat, for 10 minutes; click it for its fight.">
          <Toggle :model-value="cfg.bests" @update:model-value="set({ bests: $event })" />
        </SettingRow>
        <SettingRow label="Corridors" hint="How many corridors the character you play still has to do since the last reset; click it for each character's.">
          <Toggle :model-value="cfg.corridors" @update:model-value="set({ corridors: $event })" />
        </SettingRow>
        <SettingRow label="Enemies nearby" hint="A red count of the players in view who can attack you (PvP on, or anyone in the Abyss). Click it for the list.">
          <Toggle :model-value="cfg.enemies" @update:model-value="set({ enemies: $event })" />
        </SettingRow>
        <SettingRow label="Field boss alive" hint="A field boss you have an alert for stays on the bar, as its portrait, while it is alive.">
          <Toggle :model-value="cfg.bosses" @update:model-value="set({ bosses: $event })" />
        </SettingRow>
        <SettingRow label="Hidden Cube" hint="A cube in view, with how far away it is and which way. Click it for the map.">
          <Toggle :model-value="cfg.cubes" @update:model-value="set({ cubes: $event })" />
        </SettingRow>
        <SettingRow label="Your last death" hint="A skull on the bar; click it to see where you died. It goes away this long after.">
          <div class="flex items-center gap-3">
            <SelectBox v-if="cfg.death" size="sm" :model-value="cfg.deathMinutes" :options="minutes(STAY)" @update:model-value="set({ deathMinutes: $event })" />
            <Toggle :model-value="cfg.death" @update:model-value="set({ death: $event })" />
          </div>
        </SettingRow>
      </Section>

      <Section title="Look">
        <SettingRow label="Opacity" hint="0% removes the background and leaves only the text, with a soft shadow.">
          <Slider :model-value="cfg.opacity" :min="0" :max="1" :step="0.02" :format="pct" @update:model-value="set({ opacity: $event })" />
        </SettingRow>
        <SettingRow label="Size">
          <Slider :model-value="cfg.scale" :min="0.75" :max="1.75" :step="0.05" :format="pct" @update:model-value="set({ scale: $event })" />
        </SettingRow>
        <SettingRow label="Position" hint="Drag the bar in game to move it. This puts it back at the top centre of the screen.">
          <button type="button" class="rounded-md border border-light px-2.5 py-1 text-xs text-dark hover:bg-dark" @click="set({ position: null })">{{ t('Reset') }}</button>
        </SettingRow>
      </Section>

      <Section title="Overlay buttons">
        <SettingRow label="Buttons on the bar" hint="Besides the DPS meter, Map, Kill feed and Pets: a click turns each overlay on or off.">
          <div class="flex flex-wrap justify-end gap-1">
            <button
              v-for="w in HUD_WIDGETS"
              :key="w"
              type="button"
              :class="['rounded-md border px-2 py-0.5 text-xs', cfg.widgets.includes(w) ? 'border-accent bg-accent/15 text-accent' : 'border-light text-dark hover:bg-dark']"
              @click="set({ widgets: cfg.widgets.includes(w) ? cfg.widgets.filter((x) => x !== w) : HUD_WIDGETS.filter((x) => x === w || cfg.widgets.includes(x)) })"
            >
              {{ t(WIDGET_LABELS[w]) }}
            </button>
          </div>
        </SettingRow>
      </Section>

      <Section title="Widgets">
        <SettingRow label="Hide the widgets it replaces" hint="Keeps the Enemies overlay closed while the Unified HUD is on, since the bar shows the same things. The enemy sound still plays.">
          <Toggle :model-value="cfg.replace" @update:model-value="set({ replace: $event })" />
        </SettingRow>
      </Section>
    </template>
  </div>
</template>
