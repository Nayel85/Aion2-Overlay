<script setup lang="ts">
// Party frames (shared/party.ts): one bar per member of your party, made to heal by: their class
// icon and name on a bar of their HP, in the HP colour, or in the afflicted colour while a monster's
// debuff is on them (any, or only those taking control: the setting), to cleanse. One at 0 is down
// (grey, struck through, a skull), one not heard of for a while is out of range (faded). Everything
// else is a setting (dashboard/PartyView): size, colours, the HP as text, the debuffs' icons, a title
// bar. Up while you are in a party, moved by dragging it; while the dashboard is up out of a party,
// it shows a sample to place it by. Nothing to show measures 0, and main keeps it hidden.
import { classIconUrl } from '@/lib/format.ts'
import { compact } from '@shared/format.ts'
import { useOverlay } from '@/lib/overlay.ts'
import { useNow, useIdle } from '@/lib/now.ts'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import CloseButton from '@/components/CloseButton.vue'
import CollapseButton from '@/components/CollapseButton.vue'
import { buffName, ccKind, effectsOrder, isShield, remaining, shownEffects } from '@/lib/buffs.ts'
import BuffIcon from '@/components/BuffIcon.vue'
import { t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { PartyDebuff, PartyMember, Vitals } from '@shared/party.ts'

const store = useApp()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { report } = useOverlay('party', () => list.value.length > 0)
const cfg = computed(() => store.settings.party)
// Hidden while idle, if set.
const idle = useIdle(() => store.settings.party)

/** A boss is on whom it hit last, for this long after. */
const BOSS_ON_MS = 6_000
/** Not heard of for this long: out of range (the game sends nothing of them). */
const STALE_MS = 10_000
// Ticking in a party (or with the sample shown).
const now = useNow(500, () => store.party.members.length > 1 || store.panelVisible)

const icon = classIconUrl

interface Row {
  member: PartyMember
  vitals: Vitals | null
  you: boolean
  /** Those worth showing, control effects first. */
  debuffs: PartyDebuff[]
  /** A shield on them now. */
  shielded: boolean
  /** The one a boss is on (it hit them last, within the last few seconds). */
  bossOn: boolean
}
const live = (d: PartyDebuff): boolean => d.endsAt === null || d.endsAt > now.value
/** A member's debuffs, as the Buffs overlay shows yours (lib/buffs.ts shownEffects): the controls first, then the soonest to run out. */
const shownDebuffs = (list: PartyDebuff[]): PartyDebuff[] =>
  shownEffects(list, now.value)
    .filter((d) => d.debuff)
    .sort((a, b) => Number(!!ccKind(b.id)) - Number(!!ccKind(a.id)) || effectsOrder(a, b))
/** Afflicted, as the setting says: any debuff, or one taking control. */
const afflicted = (r: Row): boolean => (cfg.value.afflictedBy === 'control' ? r.debuffs.some((d) => ccKind(d.id)) : r.debuffs.length > 0)

/** The sample: a Stun (ICON_Abnormal_Stun) of 4 s on one, over and over. */
const SAMPLE = computed<Row[]>(() => {
  const stun: PartyDebuff = { id: 12000001, stacks: 1, endsAt: now.value + 4000 - (now.value % 4000), startedAt: now.value - 1000, skill: null, by: 0, mine: false, debuff: true, passive: false }
  const at = now.value
  return [
    { member: { name: t('You'), slot: 1, level: 45, combatPower: 0, server: 0, className: 'Cleric', entity: -1 }, vitals: { hp: 26_672, maxHp: 26_672, flight: 0, maxFlight: 0, at }, you: true, debuffs: [], shielded: true, bossOn: false },
    { member: { name: t('A tank'), slot: 2, level: 45, combatPower: 0, server: 0, className: 'Templar', entity: -2 }, vitals: { hp: 24_100, maxHp: 31_400, flight: 0, maxFlight: 0, at }, you: false, debuffs: [], shielded: false, bossOn: true },
    { member: { name: t('A healer'), slot: 3, level: 45, combatPower: 0, server: 0, className: 'Chanter', entity: -3 }, vitals: { hp: 11_240, maxHp: 19_235, flight: 0, maxFlight: 0, at }, you: false, debuffs: [stun], shielded: false, bossOn: false },
    { member: { name: t('A ranger'), slot: 4, level: 45, combatPower: 0, server: 0, className: 'Ranger', entity: -4 }, vitals: { hp: 0, maxHp: 22_000, flight: 0, maxFlight: 0, at }, you: false, debuffs: [], shielded: false, bossOn: false },
  ]
})
const rows = computed<Row[]>(() =>
  store.party.members.map((m) => ({
    member: m,
    vitals: m.entity !== null ? (store.party.vitals[m.entity] ?? null) : null,
    you: m.name === store.status?.character,
    debuffs: m.entity !== null ? shownDebuffs(store.party.debuffs[m.entity] ?? []) : [],
    shielded: m.entity !== null && (store.party.debuffs[m.entity] ?? []).some((d) => d.debuff === false && isShield(d.id) && live(d)),
    bossOn: m.entity !== null && store.party.bossTarget?.entity === m.entity && now.value - store.party.bossTarget.at < BOSS_ON_MS,
  })),
)
/** Out of a party while the dashboard is up: a sample to place it by. */
const preview = computed(() => store.party.members.length < 2 && store.panelVisible)
/** Closed by its X: back with the next party. */
const closed = ref(false)
watch(
  () => store.party.members.length,
  (n, before) => {
    if (n > 1 && before < 2) closed.value = false
  },
)
const list = computed<Row[]>(() =>
  (closed.value ? [] : store.party.members.length > 1 ? rows.value : preview.value ? SAMPLE.value : []).filter((r) => cfg.value.self || !r.you),
)

const pct = (v: Vitals | null): number => (v && v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 1)
const down = (v: Vitals | null): boolean => !!v && v.hp === 0
const stale = (v: Vitals | null): boolean => !v || now.value - v.at > STALE_MS
const hpText = (v: Vitals | null): string => {
  if (!v || down(v)) return ''
  if (cfg.value.hpText === 'percent') return `${Math.round(pct(v) * 100)}%`
  if (cfg.value.hpText === 'value') return compact(v.hp)
  return ''
}
const fill = (r: Row): string => (down(r.vitals) ? 'transparent' : afflicted(r) ? cfg.value.afflictedColor : cfg.value.hpColor)

const set = (patch: Partial<typeof cfg.value>): void => void store.set('party', { ...cfg.value, ...patch })
const drag = windowDrag({ overlay: 'party' })

watch([() => list.value.length, () => cfg.value.collapsed, () => cfg.value.header], () => void nextTick(report))

onMounted(() => {
  report()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <section
        v-if="list.length && !idle"
        :class="['m-1 cursor-move', cfg.header && 'overflow-hidden rounded-xl border']"
        :style="[{ width: `${cfg.width}px`, opacity: cfg.header ? undefined : cfg.opacity }, cfg.header ? panelStyle(cfg.opacity, '63 185 80') : {}]"
        :title="!cfg.header && preview ? t('drag to move') : undefined"
        @pointerdown="drag.onPointerDown($event)"
      >
        <header v-if="cfg.header" class="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-[12px]">
          <span class="shrink-0 font-semibold text-default">{{ t('Party') }}</span>
          <span v-if="preview" class="min-w-0 truncate text-[11px] text-darker">{{ t('drag to move') }}</span>
          <span class="flex-1" />
          <CollapseButton :collapsed="cfg.collapsed" class="-my-1" @toggle="set({ collapsed: !cfg.collapsed })" />
          <CloseButton v-if="!preview" class="-my-1 -mr-1" :title="t('Hide until the next party')" @close="closed = true" />
        </header>
        <ul v-if="!cfg.header || !cfg.collapsed" :class="['flex flex-col', cfg.header && 'px-1.5 pb-1.5']" :style="{ gap: `${cfg.gap}px` }">
          <li v-for="r in list" :key="r.member.name" :class="[stale(r.vitals) && !down(r.vitals) && 'opacity-45']">
            <div class="relative overflow-hidden rounded-[3px] bg-black/70 ring-1 ring-black/80" :style="{ height: `${cfg.barHeight}px` }">
              <div class="absolute inset-y-0 left-0 transition-[width,background-color] duration-300" :style="{ width: `${pct(r.vitals) * 100}%`, background: fill(r) }" />
              <div class="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/25" />
              <div class="relative flex h-full items-center gap-1 px-1" :style="{ fontSize: `${cfg.fontSize}px` }">
                <img
                  v-if="cfg.icon && icon(r.member.className)"
                  :src="icon(r.member.className)!"
                  alt=""
                  draggable="false"
                  :class="['shrink-0 object-contain drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]', down(r.vitals) && 'grayscale']"
                  :style="{ width: `${cfg.barHeight - 4}px`, height: `${cfg.barHeight - 4}px` }"
                />
                <span :class="['min-w-0 flex-1 truncate font-semibold leading-none [text-shadow:0_1px_2px_#000,0_0_2px_#000]', down(r.vitals) ? 'text-white/50 line-through' : 'text-white']">{{ r.member.name }}</span>
                <!-- The boss is on them: a red target. -->
                <svg v-if="cfg.bossTarget && r.bossOn && !down(r.vitals)" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-[#ff5b5b] drop-shadow-[0_0_2px_#000]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><title>{{ t('The boss is on them') }}</title><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" /></svg>
                <!-- A shield on them. -->
                <svg v-if="cfg.shields && r.shielded && !down(r.vitals)" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-[#9ecbff] drop-shadow-[0_0_2px_#000]" fill="currentColor"><title>{{ t('Shielded') }}</title><path d="M8 1.5l5.5 2v4c0 3.5-2.4 6-5.5 7-3.1-1-5.5-3.5-5.5-7v-4z" /></svg>
                <svg v-if="down(r.vitals)" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-white/70" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5" /></svg>
                <span v-else-if="hpText(r.vitals)" class="shrink-0 font-semibold tabular-nums leading-none text-white [text-shadow:0_1px_2px_#000,0_0_2px_#000]">{{ hpText(r.vitals) }}</span>
              </div>
            </div>
            <div v-if="cfg.debuffIcons && r.debuffs.length && !down(r.vitals)" class="mt-0.5 flex flex-wrap gap-0.5">
              <span v-for="d in r.debuffs.slice(0, 8)" :key="d.id" class="relative size-[18px]" :title="buffName(d.id)">
                <BuffIcon :id="d.id" :skill="d.skill" :size="18" :class="ccKind(d.id) ? 'ring-1 ring-red' : 'ring-1 ring-black/60'" />
                <span v-if="d.endsAt !== null" class="absolute -bottom-0.5 right-0 text-[8px] font-bold tabular-nums leading-none text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">{{ remaining(d.endsAt - now) }}</span>
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
