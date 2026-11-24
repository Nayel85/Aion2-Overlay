<script setup lang="ts">
// The DPS meter, in a window of its own: open while the game is (and the meter is on), moved by its
// header, sized to its rows. questlog.gg's layout: the fight's time and total, the target's HP with
// how long until it dies, then a row per player in their class colour (DPS, share, damage, crit).
// Hovering shows the switches: which targets, which players, and damage, healing or damage taken.
// The minimize button shrinks it to its title line, with the total per second. Its bottom-right
// corner resizes it (a double-click there goes back to the default size); with "hide while idle" on
// it hides after that long with nothing new on it, and comes back with the next hit.
// The numbers are the engine's (A2Tools DPS Meter's parser); the class icons and colours are its too.
import { useOverlay } from '@/lib/overlay.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CloseButton from '@/components/CloseButton.vue'
import CollapseButton from '@/components/CollapseButton.vue'
import ResizeGrip from '@/components/ResizeGrip.vue'
import { bridge } from '@/lib/bridge.ts'
import { clampTo, cornerResize } from '@/lib/cornerResize.ts'
import { t } from '@/lib/i18n.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import {
  CLASS_COLORS,
  MAIN_TARGET_MODES,
  METER_PLAYERS,
  METER_STATS,
  meterRows,
  NO_METER,
  TARGET_MODE_LABELS,
  timeToKill,
  type MeterData,
  type MeterPlayers,
  type MeterStat,
  type TargetMode,
  type NewBest,
} from '@shared/meter.ts'
import { METER_HEIGHT, METER_WIDTH } from '@shared/settings.ts'
import type { TrackerState } from '@shared/tracker.ts'

const store = useApp()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { root, report } = useOverlay('meter')
const cfg = computed(() => store.settings.meter)
const api = bridge()

const meter = ref<MeterData>(NO_METER)
/** The engine's state: the meter and the tracker are the same process. */
const status = computed(() => store.status ?? { state: 'starting' as TrackerState, detail: null })

const icons = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
const icon = (className: string | null): string | null =>
  className ? (Object.entries(icons).find(([k]) => k.endsWith(`/classes/${className.toLowerCase()}.png`))?.[1] ?? null) : null

const all = computed(() => meterRows(meter.value, cfg.value.players, cfg.value.stat))
/** A height of its own shows every row it fits (scrolling past them); otherwise as many as set. */
const rows = computed(() => all.value.slice(0, height.value === null ? cfg.value.rows : 24))
const top = computed(() => Math.max(1, ...all.value.map((r) => r.value)))
const total = computed(() => all.value.reduce((n, r) => n + r.value, 0))
const totalPerSecond = computed(() => all.value.reduce((n, r) => n + r.perSecond, 0))
const ttk = computed(() => timeToKill(meter.value))
const STAT_TITLE: Record<MeterStat, [string, string, string]> = {
  damage: ['Damage Meter', 'Total damage', 'DPS'],
  healing: ['Healing', 'Total healing', 'HPS'],
  taken: ['Damage Taken', 'Total taken', 'per s'],
}

/** 1234 → 1.2K, 1234567 → 1.23M */
/** A row's bar: the class colour, fading out to the right. */
function barGradient(className: string | null, solid = false): string {
  const c = CLASS_COLORS[className ?? ''] ?? '#787b8a'
  return solid ? `linear-gradient(90deg, ${c}f0 0%, ${c}b0 45%, ${c}50 100%), linear-gradient(rgba(9, 9, 11, 0.75), rgba(9, 9, 11, 0.75))` : `linear-gradient(90deg, ${c}a0 0%, ${c}38 100%)`
}

function short(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return Math.round(n).toLocaleString('en-US')
}
const clock = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const hpShare = computed(() => {
  const t = meter.value.target
  return t && t.maxHp > 0 && t.hp !== null ? Math.min(1, Math.max(0, t.hp / t.maxHp)) : null
})

const STATUS_TEXT: Record<TrackerState, string> = {
  starting: 'Starting…',
  listening: 'Looking for the game connection…',
  locked: 'Waiting for a fight',
  idle: 'Asleep until Aion 2 starts',
  stopped: 'Replay finished',
  error: 'Error',
  exited: 'Restarting…',
}
const statusDot = computed(
  () =>
    ({ locked: 'bg-green', listening: 'bg-yellow', starting: 'bg-yellow', exited: 'bg-yellow', error: 'bg-danger', idle: 'bg-darkest', stopped: 'bg-darkest' })[
      status.value.state
    ],
)
const empty = computed(() => {
  if (status.value.state === 'error' || status.value.state === 'exited') return status.value.detail ?? t(STATUS_TEXT[status.value.state])
  if (status.value.state === 'locked' && !meter.value.meKnown) return t('Detecting character… change zone or log in so the meter knows who you are.')
  if (meter.value.rows.length) return cfg.value.players === 'me' ? t('None of your damage on this target.') : t('Nothing of this on the target yet.')
  return t(STATUS_TEXT[status.value.state])
})

/** The pointer is over the meter: in bars-only mode that is when all of it shows. */
const over = ref(false)
const lean = computed(() => cfg.value.barsOnly && !store.panelVisible && !over.value && !cfg.value.collapsed && rows.value.length > 0)
/** The bars' own background while it is lean: none unless the setting gives it one. */
const leanBg = computed(() => `rgba(9, 9, 11, ${cfg.value.barsBackground})`)

const drag = windowDrag({ overlay: 'meter' })
const reset = (): void => void api.invoke('meter:reset')
/** A row's skills, in the Details window: the live target's, following the fight. */
function showDetails(actor: number): void {
  const target = meter.value.target?.id
  if (target) void api.invoke('details:open', { kind: 'live', target, actor })
}
/** Your ping, coloured by how it plays: under 80 ms good, under 150 ms fair. */
const pingClass = computed(() => {
  const ms = meter.value.ping
  return ms === null ? '' : ms < 80 ? 'text-green' : ms < 150 ? 'text-yellow' : 'text-danger'
})
const set = (patch: Partial<typeof cfg.value>): void => void store.set('meter', { ...cfg.value, ...patch })
/** The My skills overlay (your skills on the meter's target), on or off from here too. */
const skillsOn = computed(() => store.settings.skills.enabled)
const toggleSkills = (): void => void store.set('skills', { ...store.settings.skills, enabled: !skillsOn.value })

/** The size while its corner is being dragged; the saved one otherwise. */
const live = ref<{ width: number; height: number | null } | null>(null)
const width = computed(() => live.value?.width ?? cfg.value.width)
const height = computed(() => (cfg.value.collapsed ? null : live.value ? live.value.height : cfg.value.height))
const card = ref<HTMLElement | null>(null)
/** Drag the corner: the width, and the height once it moves up or down (not while minimized). */
const onGrip = cornerResize({
  start: () => {
    const box = card.value?.getBoundingClientRect()
    return { width: box?.width ?? cfg.value.width, height: box?.height ?? 0 }
  },
  move: (size, vertical) => {
    const sized = !cfg.value.collapsed && (vertical || cfg.value.height !== null)
    live.value = { width: clampTo(size.width, METER_WIDTH), height: sized ? clampTo(size.height, METER_HEIGHT) : null }
  },
  end: () => {
    if (live.value) set(cfg.value.collapsed ? { width: live.value.width } : live.value)
    live.value = null
  },
})
const resetSize = (): void => set({ width: 340, height: null })

// Hide while idle: the time the numbers last moved (a hit, a heal, a reset).
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 1000)
const lastActive = ref(0)
watch([total, () => meter.value.target?.id], () => (lastActive.value = Date.now()))
// Never while the overlays are being placed: shown whole to place it, as every overlay.
const idle = computed(() => cfg.value.hideIdle && !store.panelVisible && !live.value && now.value - lastActive.value >= cfg.value.idleSeconds * 1000)
const moreModes = computed(() => !MAIN_TARGET_MODES.some((m) => m.id === cfg.value.targetMode))

/** Tell main how big the window is. */
watch([rows, () => meter.value.target, status, () => store.ready, () => cfg.value.collapsed, idle, width, height], () => void nextTick(report), { deep: true })

const offs: (() => void)[] = []
/** A personal best just beaten, shown a while over the meter. */
const BEST_SHOWN_MS = 12_000
const newBest = ref<NewBest | null>(null)
let bestTimer: ReturnType<typeof setTimeout> | null = null
const bestGain = computed(() => (newBest.value && newBest.value.before > 0 ? Math.round(((newBest.value.dps - newBest.value.before) / newBest.value.before) * 100) : null))
const shortDps = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

onMounted(async () => {
  offs.push(api.on('meter:dps', (m) => (meter.value = m)))
  offs.push(
    api.on('meter:personalBest', (b) => {
      newBest.value = b
      if (bestTimer) clearTimeout(bestTimer)
      bestTimer = setTimeout(() => (newBest.value = null), BEST_SHOWN_MS)
    }),
  )
  meter.value = await api.invoke('meter:get')
  report()
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  for (const off of offs) off()
})
</script>

<template>
  <div class="inline-block">
    <!-- Idle, nothing is drawn: main hides a window that measures 0 × 0. -->
    <div ref="root" class="inline-block">
      <div
        v-if="!idle"
        ref="card"
        @pointerenter="over = true"
        @pointerleave="over = false"
        :class="['group relative m-1.5 flex flex-col rounded-xl border', lean ? 'border-transparent' : 'border-card bg-darker/95 shadow-card']"
        :style="{ opacity: cfg.opacity, width: `${width}px`, height: height === null ? undefined : `${height}px` }"
      >
        <!-- A personal best just beaten. -->
        <div v-if="newBest" class="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-yellow/15 px-2.5 py-1.5 text-xs">
          <svg viewBox="0 0 16 16" class="size-4 shrink-0 text-yellow" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h6v3a3 3 0 0 1-6 0zM5 3.5H3v1a2 2 0 0 0 2 2M11 3.5h2v1a2 2 0 0 1-2 2M8 8.5v3M5.5 13.5h5" /></svg>
          <span class="min-w-0 flex-1 truncate">
            <span class="font-semibold text-yellow">{{ t('New personal best') }}</span> · {{ newBest.boss }}
          </span>
          <span class="font-semibold tabular-nums">{{ shortDps(newBest.dps) }} DPS<span v-if="bestGain !== null" class="ml-1 text-green">+{{ bestGain }}%</span></span>
        </div>
        <header v-if="!lean" :class="['cursor-move px-3', cfg.collapsed ? 'py-1.5' : 'pb-1.5 pt-2.5']" :title="t('Drag to move')" @pointerdown="drag.onPointerDown">
          <div class="flex items-center gap-2">
            <span :class="['size-1.5 shrink-0 rounded-full', statusDot]" :title="status.detail ?? t(STATUS_TEXT[status.state])" />
            <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-default">
              {{ t(STAT_TITLE[cfg.stat][0]) }}<span v-if="meter.battleTime" class="font-normal text-darker"> ({{ clock(meter.battleTime) }})</span>
            </span>
            <span v-if="cfg.collapsed && all.length" class="shrink-0 text-[13px] font-bold tabular-nums text-accent">
              {{ short(totalPerSecond) }}<span class="ml-0.5 text-[10px] font-medium text-darker">{{ STAT_TITLE[cfg.stat][2] }}</span>
            </span>
            <span v-else-if="!cfg.collapsed" class="max-w-[45%] truncate text-[11px] text-darker" :title="meter.target?.name">{{ meter.target?.name }}</span>
            <button
              type="button"
              :class="['flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium hover:bg-dark', skillsOn ? 'bg-accent/15 text-accent' : 'text-darker hover:text-default']"
              :title="skillsOn ? t('My skills overlay on: click to hide it') : t('My skills overlay off: click to show it')"
              @pointerdown.stop
              @click="toggleSkills"
            >
              {{ t('Skills') }}
            </button>
            <button
              type="button"
              class="flex size-5 shrink-0 items-center justify-center rounded text-darker hover:bg-dark hover:text-default"
              :title="t('Reset the meter')"
              @pointerdown.stop
              @click="reset"
            >
              <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M13 8a5 5 0 1 1-1.6-3.7M13 3v3h-3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <CollapseButton :collapsed="cfg.collapsed" @toggle="set({ collapsed: !cfg.collapsed })" />
            <CloseButton @close="set({ enabled: false })" />
          </div>
          <div v-if="all.length && !cfg.collapsed" class="mt-0.5 flex items-baseline justify-between">
            <span class="text-[12px] text-darker">{{ t(STAT_TITLE[cfg.stat][1]) }} <span class="font-medium text-dark">{{ short(total) }}</span></span>
            <span class="text-xl font-bold tabular-nums text-accent">{{ short(totalPerSecond) }}<span class="ml-0.5 text-[11px] font-medium text-darker">{{ STAT_TITLE[cfg.stat][2] }}</span></span>
          </div>
        </header>

        <div v-if="!cfg.collapsed" class="flex min-h-0 flex-1 flex-col">
        <!-- The switches, while the pointer is over the meter. -->
        <div v-if="!lean" class="hidden flex-wrap gap-1 px-3 pb-1.5 text-[10px] group-hover:flex" @pointerdown.stop>
          <div class="flex rounded-md bg-dark p-0.5">
            <button
              v-for="m in MAIN_TARGET_MODES"
              :key="m.id"
              type="button"
              :class="['rounded px-1.5 py-0.5', cfg.targetMode === m.id ? 'bg-light text-default' : 'text-darker hover:text-default']"
              @click="set({ targetMode: m.id })"
            >{{ t(m.label) }}</button>
            <select
              :class="['rounded bg-transparent px-1 py-0.5', moreModes ? 'bg-light text-default' : 'text-darker']"
              :title="t('More ways to pick the target')"
              :value="moreModes ? cfg.targetMode : ''"
              @change="set({ targetMode: ($event.target as HTMLSelectElement).value as TargetMode })"
            >
              <option value="" disabled>{{ t('More') }}</option>
              <option v-for="m in ['mostDamage', 'mostRecent', 'trainTargets'] as const" :key="m" :value="m">{{ t(TARGET_MODE_LABELS[m]) }}</option>
            </select>
          </div>
          <div class="flex rounded-md bg-dark p-0.5">
            <button
              v-for="p in METER_PLAYERS"
              :key="p.id"
              type="button"
              :class="['rounded px-1.5 py-0.5', cfg.players === p.id ? 'bg-light text-default' : 'text-darker hover:text-default']"
              @click="set({ players: p.id as MeterPlayers })"
            >{{ t(p.label) }}</button>
          </div>
          <div class="flex rounded-md bg-dark p-0.5">
            <button
              v-for="s in METER_STATS"
              :key="s.id"
              type="button"
              :class="['rounded px-1.5 py-0.5', cfg.stat === s.id ? 'bg-light text-default' : 'text-darker hover:text-default']"
              @click="set({ stat: s.id as MeterStat })"
            >{{ t(s.label) }}</button>
          </div>
        </div>

        <div v-if="hpShare !== null && !lean" class="px-3 pb-1.5">
          <div class="relative h-3.5 overflow-hidden rounded bg-dark">
            <div class="h-full bg-danger/70" :style="{ width: `${hpShare * 100}%` }" />
            <span class="absolute inset-0 flex items-center justify-center gap-1.5 text-[9px] font-semibold tabular-nums text-default">
              {{ (hpShare * 100).toFixed(1) }}% · {{ short(meter.target!.hp!) }}<template v-if="ttk !== null"> · {{ t('dies in {time}', { time: clock(ttk) }) }}</template>
            </span>
          </div>
          <!-- The stagger gauge, worn down as it is hit: broken at 100%. -->
          <div v-if="meter.target?.stagger != null" class="relative mt-0.5 h-2 overflow-hidden rounded bg-dark" :title="t('Stagger')">
            <div class="h-full bg-yellow/80 transition-[width] duration-300" :style="{ width: `${meter.target.stagger}%` }" />
            <span class="absolute inset-0 flex items-center justify-center text-[8px] font-semibold tabular-nums leading-none text-default">{{ t('Stagger') }} {{ Math.round(meter.target.stagger) }}%</span>
          </div>
        </div>

        <template v-if="rows.length">
          <!-- Inset on the right as the rows are (the list's 6 px, and the row's own), so each title is over its column. -->
          <div v-if="!lean" :class="['flex items-center gap-1.5 pb-1 pl-3 text-[10px] text-darkest', cfg.style === 'flat' ? 'pr-3' : 'pr-[22px]']">
            <span :class="['min-w-0 flex-1', cfg.style === 'bold' ? 'pl-9' : cfg.style === 'compact' ? 'pl-6' : 'pl-6']">{{ t('Player') }}</span>
            <span v-if="cfg.gear === 'beside'" class="w-9 shrink-0 text-center" :title="t('Item level')">iLvl</span>
            <span v-if="cfg.power === 'beside'" class="w-11 shrink-0 text-center" :title="t('Combat power')">CP</span>
            <span v-if="cfg.deaths" class="flex w-5 shrink-0 justify-center" :title="t('Deaths')"><svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5" /></svg></span>
            <span class="w-12 shrink-0 text-center">{{ STAT_TITLE[cfg.stat][2] }}</span>
            <span class="w-12 shrink-0 text-center">{{ t('Share') }}</span>
            <span class="w-12 shrink-0 text-center">{{ cfg.stat === 'taken' ? t('Taken') : cfg.stat === 'healing' ? t('Healed') : t('Damage') }}</span>
            <span v-if="cfg.style === 'flat' && cfg.stat === 'damage'" class="w-8 shrink-0 text-center">Crit</span>
          </div>
          <ul :class="['space-y-0.5 px-1.5 pb-1.5', lean ? 'pt-1.5' : 'pt-1', height !== null && 'min-h-0 flex-1 overflow-y-auto']">
            <li
              v-for="r in rows"
              :key="r.id"
              :class="['relative cursor-pointer overflow-hidden', !lean && 'bg-dark', cfg.style === 'flat' ? 'rounded-md' : 'rounded-full', r.you ? 'ring-1 ring-accent' : 'hover:ring-1 hover:ring-light']"
              :style="lean ? { background: leanBg, textShadow: '0 1px 2px rgba(0, 0, 0, 0.95), 0 0 3px rgba(0, 0, 0, 0.8)' } : undefined"
              :title="t('{class} · click for the details', { class: r.className ?? t('Unknown class') })"
              @click="showDetails(r.id)"
            >
              <div v-if="cfg.style === 'flat'" class="absolute inset-y-0 left-0 opacity-50" :style="{ width: `${(r.value / top) * 100}%`, background: CLASS_COLORS[r.className ?? ''] ?? '#787b8a' }" />
              <template v-else>
                <div class="absolute inset-y-0 left-0" :style="{ width: `${(r.value / top) * 100}%`, background: barGradient(r.className, lean) }" />
                <div :class="['absolute inset-y-0 left-0', cfg.style === 'bold' ? 'w-14' : 'w-9']" style="background: linear-gradient(90deg, rgba(9, 9, 11, 0.8), rgba(9, 9, 11, 0))" />
              </template>
              <div :class="['relative flex items-center gap-1.5 text-[12px]', cfg.style === 'bold' ? 'py-1 pl-1.5 pr-4' : cfg.style === 'compact' ? 'py-0.5 pl-1 pr-4' : 'px-1.5 py-1']">
                <img v-if="icon(r.className)" :src="icon(r.className)!" :class="['shrink-0', cfg.style === 'bold' ? 'size-6' : 'size-4', cfg.style !== 'flat' && 'drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]']" alt="" />
                <span v-else :class="['shrink-0', cfg.style === 'bold' ? 'size-6' : 'size-4']" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span :class="['truncate', lean ? 'font-semibold' : 'font-medium', r.you ? 'text-[#ffc53d] [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_4px_rgba(0,0,0,0.85)]' : 'text-default']">{{ r.name }}</span>
                  <span v-if="(cfg.gear === 'below' && r.gearScore > 0) || (cfg.power === 'below' && r.combatPower > 0)" class="-mt-0.5 flex gap-1.5 text-[9px] leading-tight tabular-nums">
                    <span v-if="cfg.gear === 'below' && r.gearScore > 0" class="text-yellow/80" :title="t('Item level')">{{ r.gearScore }}</span>
                    <span v-if="cfg.power === 'below' && r.combatPower > 0" class="text-default/75" :title="t('Combat power')">{{ r.combatPower.toLocaleString() }}</span>
                  </span>
                </span>
                <!-- Item level and combat power as columns of their own ("In a column"); a dash while unknown. Every column centred under its title. -->
                <span v-if="cfg.gear === 'beside'" class="w-9 shrink-0 text-center text-[11px] tabular-nums text-yellow/80">{{ r.gearScore > 0 ? r.gearScore : '–' }}</span>
                <span v-if="cfg.power === 'beside'" class="w-11 shrink-0 text-center text-[11px] tabular-nums text-dark">{{ r.combatPower > 0 ? short(r.combatPower) : '–' }}</span>
                <!-- Deaths: red once they died, a dash before; centred under the skull. -->
                <span v-if="cfg.deaths" :class="['w-5 shrink-0 text-center text-[11px] tabular-nums', r.deaths > 0 ? 'font-semibold text-red' : 'text-darker']">{{ r.deaths > 0 ? r.deaths : '–' }}</span>
                <span class="w-12 shrink-0 text-center font-semibold tabular-nums text-default">{{ short(r.perSecond) }}</span>
                <span class="w-12 shrink-0 text-center tabular-nums text-dark">{{ r.part.toFixed(1) }}%</span>
                <span class="w-12 shrink-0 text-center tabular-nums text-dark">{{ short(r.value) }}</span>
                <span v-if="!lean && cfg.style === 'flat' && cfg.stat === 'damage'" :class="['w-8 shrink-0 text-center tabular-nums', r.you ? 'text-green' : 'text-dark']">{{ Math.round(r.critRate * 100) }}%</span>
              </div>
            </li>
          </ul>
        </template>
        <p v-else class="px-3 pb-2.5 text-[11px] text-darker">{{ empty }}</p>

        <div v-if="height !== null && !rows.length" class="flex-1" />
        <footer v-if="!lean && (meter.ping !== null || all.length > rows.length)" class="mt-auto flex gap-2 border-t border-card px-3 py-1 text-[10px] tabular-nums text-darkest">
          <span>{{ t(TARGET_MODE_LABELS[meter.mode]) }}</span>
          <span v-if="all.length > rows.length">{{ t('+{n} more', { n: all.length - rows.length }) }}</span>
          <span v-if="meter.ping !== null" class="ml-auto" :title="t('Your ping to the game server')">
            <span :class="pingClass">{{ meter.ping }}</span> ms
          </span>
        </footer>
        </div>
        <!-- The corner: drag to resize, double-click for the default size. -->
        <ResizeGrip :active="!!live" @grab="onGrip" @reset="resetSize" />
      </div>
    </div>
  </div>
</template>
