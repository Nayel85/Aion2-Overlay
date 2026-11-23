<script setup lang="ts">
// Party frames (shared/party.ts): each member of your party with their class, name and HP, as the
// game sends it about once a second; one at 0 is down (dimmed, a skull), one not heard of for a
// while is out of range (faded). You among them unless turned off. Up while you are in a party;
// moved by its header, minimized it is the header with how many. While the dashboard is up out of a
// party, it shows a sample to place it by. Nothing to show measures 0, and main keeps it hidden.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CloseButton from '@/components/CloseButton.vue'
import CollapseButton from '@/components/CollapseButton.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { CLASS_COLORS } from '@shared/meter.ts'
import type { PartyMember, Vitals } from '@shared/party.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.party)

/** Not heard of for this long: out of range (the game sends nothing of them). */
const STALE_MS = 10_000
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 1000)

const icons = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
/** The engine's names for one class, the files' for it. */
const ALIAS: Record<string, string> = { elementalist: 'spiritmaster', summoner: 'spiritmaster' }
const icon = (className: string | null): string | null => {
  const name = className?.toLowerCase()
  return name ? (Object.entries(icons).find(([k]) => k.endsWith(`/classes/${ALIAS[name] ?? name}.png`))?.[1] ?? null) : null
}

interface Row {
  member: PartyMember
  vitals: Vitals | null
  you: boolean
}
const SAMPLE = computed<Row[]>(() => [
  { member: { name: t('You'), slot: 1, level: 45, combatPower: 0, server: 0, className: 'Ranger', entity: -1 }, vitals: { hp: 26_672, maxHp: 26_672, flight: 0, maxFlight: 0, at: now.value }, you: true },
  { member: { name: t('A healer'), slot: 2, level: 45, combatPower: 0, server: 0, className: 'Cleric', entity: -2 }, vitals: { hp: 11_240, maxHp: 19_235, flight: 0, maxFlight: 0, at: now.value }, you: false },
  { member: { name: t('A tank'), slot: 3, level: 45, combatPower: 0, server: 0, className: 'Templar', entity: -3 }, vitals: { hp: 0, maxHp: 31_400, flight: 0, maxFlight: 0, at: now.value }, you: false },
])
const rows = computed<Row[]>(() =>
  store.party.members
    .map((m) => ({ member: m, vitals: m.entity !== null ? (store.party.vitals[m.entity] ?? null) : null, you: m.name === store.status?.character }))
    .filter((r) => cfg.value.self || !r.you),
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
const list = computed<Row[]>(() => (closed.value ? [] : store.party.members.length > 1 ? rows.value : preview.value ? SAMPLE.value : []))

const pct = (v: Vitals | null): number => (v && v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 1)
const down = (v: Vitals | null): boolean => !!v && v.hp === 0
const stale = (v: Vitals | null): boolean => !v || now.value - v.at > STALE_MS
/** Green when well, then yellow, then red as it falls. */
const hpColour = (p: number): string => (p > 0.6 ? '#3fb950' : p > 0.3 ? '#d29922' : '#f85149')
const short = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-US'))

const set = (patch: Partial<typeof cfg.value>): void => void store.set('party', { ...cfg.value, ...patch })
const drag = windowDrag({ move: 'party:moveTo', end: 'party:dragEnd' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && list.value.length ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('party:resize', { width: r.width, height: r.height })
}
watch([() => list.value.length, () => cfg.value.collapsed], () => void nextTick(report))

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  observer?.disconnect()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <section
        v-if="list.length"
        class="text-glow relative m-1.5 w-[240px] cursor-move overflow-hidden rounded-xl border"
        :style="panelStyle(cfg.opacity, '63 185 80')"
        @pointerdown="drag.onPointerDown($event)"
      >
        <header class="flex items-center gap-2 px-3 pb-1 pt-2 text-[12px]">
          <span class="shrink-0 font-semibold text-default">{{ t('Party') }}</span>
          <span class="shrink-0 rounded-full bg-green/20 px-1.5 text-[11px] font-semibold tabular-nums leading-4 text-green">{{ list.length }}</span>
          <span v-if="preview" class="min-w-0 truncate text-[11px] text-darker">{{ t('drag to move') }}</span>
          <span class="flex-1" />
          <CollapseButton :collapsed="cfg.collapsed" class="-my-1" @toggle="set({ collapsed: !cfg.collapsed })" />
          <CloseButton v-if="!preview" class="-my-1 -mr-1" :title="t('Hide until the next party')" @close="closed = true" />
          <CloseButton v-else class="-my-1 -mr-1" @close="set({ enabled: false })" />
        </header>
        <ul v-if="!cfg.collapsed" class="space-y-1 px-1.5 pb-2">
          <li v-for="r in list" :key="r.member.name" :class="['relative overflow-hidden rounded-lg bg-black/40', stale(r.vitals) && !down(r.vitals) && 'opacity-50']">
            <!-- The HP bar behind the name. -->
            <div class="absolute inset-y-0 left-0 transition-[width] duration-500" :style="{ width: `${pct(r.vitals) * 100}%`, background: `${hpColour(pct(r.vitals))}55` }" />
            <div class="absolute inset-y-0 left-0 w-1" :style="{ background: CLASS_COLORS[r.member.className ?? ''] ?? '#787b8a' }" />
            <div class="relative flex items-center gap-1.5 py-1 pl-2.5 pr-2">
              <img v-if="icon(r.member.className)" :src="icon(r.member.className)!" alt="" draggable="false" :class="['size-5 shrink-0 object-contain', down(r.vitals) && 'grayscale']" />
              <span v-else class="size-5 shrink-0" />
              <span :class="['min-w-0 flex-1 truncate text-[12px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]', r.you ? 'text-accent' : 'text-default', down(r.vitals) && 'text-darker line-through']">{{ r.member.name }}</span>
              <svg v-if="down(r.vitals)" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-red" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5" /></svg>
              <span v-else-if="r.vitals" class="shrink-0 text-[11px] tabular-nums text-default [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{{ Math.round(pct(r.vitals) * 100) }}%</span>
              <span v-else class="shrink-0 text-[11px] text-darker">—</span>
            </div>
            <div v-if="r.vitals && !down(r.vitals)" class="relative -mt-1 pb-0.5 pl-9 text-[10px] tabular-nums text-dark">{{ short(r.vitals.hp) }} / {{ short(r.vitals.maxHp) }}</div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
