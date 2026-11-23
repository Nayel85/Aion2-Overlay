<script setup lang="ts">
// Join requests to your party (shared/applicants.ts): everyone who applies, with their class,
// combat power and gear score, though the game shows only the first one until it is answered.
// It comes up when someone applies and goes away a set time after the last application; its X
// hides it until the next one. Moved by its header; minimized it is the header with the count.
// While the dashboard is up with nobody applying, it shows a sample to place it by. Nothing to
// show measures 0, and main keeps the window hidden.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CloseButton from '@/components/CloseButton.vue'
import CollapseButton from '@/components/CollapseButton.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { Applicant } from '@shared/applicants.ts'
import { CLASS_COLORS } from '@shared/meter.ts'
import { serverTag } from '@shared/servers.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.applicants)

const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 1000)

const icons = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
/** The engine's names for one class, the files' for it. */
const ALIAS: Record<string, string> = { elementalist: 'spiritmaster', summoner: 'spiritmaster' }
const icon = (className: string | null): string | null => {
  const name = className?.toLowerCase()
  return name ? (Object.entries(icons).find(([k]) => k.endsWith(`/classes/${ALIAS[name] ?? name}.png`))?.[1] ?? null) : null
}
/** A class's bar: its colour, fading out to the right (the DPS meter's rows). */
const bar = (className: string | null): string => {
  const c = CLASS_COLORS[className ?? ''] ?? '#787b8a'
  return `linear-gradient(90deg, ${c}b0 0%, ${c}50 55%, ${c}18 100%)`
}

/** Closed by its X: the next application brings it back. */
const closed = ref(false)
watch(
  () => store.applicants.lastAt,
  (at, before) => {
    if (at > before) closed.value = false
  },
)

const SAMPLE = computed<Applicant[]>(() => [
  { character: -1, name: t('Applicant'), server: 2401, className: 'Cleric', level: 45, gearScore: 2222, combatPower: 102_709, at: now.value - 12_000 },
  { character: -2, name: t('Another one'), server: 2401, className: 'Ranger', level: 45, gearScore: 1840, combatPower: 87_320, at: now.value - 4_000 },
])
/** Nobody applying while the dashboard is up: a sample to place it by. */
const preview = computed(() => !store.applicants.list.length && store.panelVisible)
const list = computed<Applicant[]>(() => (closed.value ? [] : store.applicants.list.length ? store.applicants.list : preview.value ? SAMPLE.value : []))
/** The newest, for the minimized header. */
const latest = computed(() => list.value.at(-1) ?? null)

/** Time left before it goes away, 0..1: it starts over with each application. */
const left = computed(() => {
  if (preview.value || !store.applicants.lastAt) return 1
  return Math.max(0, Math.min(1, (store.applicants.lastAt + cfg.value.hideAfter * 1000 - now.value) / (cfg.value.hideAfter * 1000)))
})

/** 102709 → 102.7K, as the meter writes it. */
function short(n: number | null): string {
  if (n === null || n <= 0) return '–'
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return Math.round(n).toLocaleString('en-US')
}
const ago = (at: number): string => {
  const s = Math.max(0, Math.floor((now.value - at) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`
}

const set = (patch: Partial<typeof cfg.value>): void => void store.set('applicants', { ...cfg.value, ...patch })
const dismiss = (a: Applicant): void => void api.invoke('applicants:dismiss', a.character)
const drag = windowDrag({ move: 'applicants:moveTo', end: 'applicants:dragEnd' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && list.value.length ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('applicants:resize', { width: r.width, height: r.height })
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
        class="text-glow request-panel relative m-1.5 w-[300px] cursor-move overflow-hidden rounded-xl border"
        :style="panelStyle(cfg.opacity, '139 92 246')"
        @pointerdown="drag.onPointerDown($event)"
      >
        <header class="flex items-center gap-2 px-3 pb-1.5 pt-2 text-[12px]">
          <span class="relative flex size-2 shrink-0">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span class="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <span class="shrink-0 font-semibold text-default">{{ t('Join requests') }}</span>
          <Transition name="count" mode="out-in">
            <span :key="list.length" class="shrink-0 rounded-full bg-accent/20 px-1.5 text-[11px] font-semibold tabular-nums leading-4 text-accent">{{ list.length }}</span>
          </Transition>
          <span v-if="cfg.collapsed && latest" class="min-w-0 truncate text-[11px] text-dark">{{ latest.name }}</span>
          <span v-else-if="preview" class="min-w-0 truncate text-[11px] text-darker">{{ t('drag to move') }}</span>
          <span class="flex-1" />
          <CollapseButton :collapsed="cfg.collapsed" class="-my-1" @toggle="set({ collapsed: !cfg.collapsed })" />
          <CloseButton v-if="!preview" class="-my-1 -mr-1" :title="t('Hide until the next request')" @close="closed = true" />
          <CloseButton v-else class="-my-1 -mr-1" @close="set({ enabled: false })" />
        </header>
        <TransitionGroup v-if="!cfg.collapsed" tag="ul" name="req" class="relative space-y-1 px-1.5 pb-2.5">
          <li v-for="a in list" :key="a.character" class="req-row group relative overflow-hidden rounded-lg">
            <div class="absolute inset-0" :style="{ background: bar(a.className) }" />
            <div class="absolute inset-y-0 left-0 w-12" style="background: linear-gradient(90deg, rgba(9, 9, 11, 0.8), rgba(9, 9, 11, 0))" />
            <div class="req-flash pointer-events-none absolute inset-0" />
            <div class="relative flex items-center gap-2 py-1.5 pl-2 pr-2.5">
              <img v-if="icon(a.className)" :src="icon(a.className)!" alt="" draggable="false" class="size-7 shrink-0 object-contain drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
              <span v-else class="size-7 shrink-0" />
              <span class="flex min-w-0 flex-1 flex-col leading-tight">
                <span class="flex min-w-0 items-baseline gap-1.5">
                  <span class="truncate text-[13px] font-semibold text-default [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_3px_rgba(0,0,0,0.8)]">{{ a.name }}</span>
                  <span v-if="a.server" class="shrink-0 text-[9px] font-semibold text-default/70">{{ serverTag(a.server) }}</span>
                </span>
                <span class="truncate text-[10px] text-default/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                  {{ [a.className, a.level ? `Lv ${a.level}` : null].filter(Boolean).join(' · ') }}<span class="text-default/50"> · {{ ago(a.at) }}</span>
                </span>
              </span>
              <span class="flex shrink-0 flex-col items-end leading-tight">
                <span class="text-[14px] font-bold tabular-nums text-default [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_3px_rgba(0,0,0,0.8)]" :title="t('Combat power')">{{ short(a.combatPower) }}</span>
                <span class="text-[10px] tabular-nums text-default/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]" :title="t('Gear score')">GS {{ a.gearScore ?? '–' }}</span>
              </span>
              <button
                v-if="!preview"
                type="button"
                class="-mr-1 flex size-5 shrink-0 items-center justify-center rounded text-default/60 opacity-0 transition-opacity hover:bg-black/40 hover:text-default group-hover:opacity-100"
                :title="t('Remove from the list')"
                @pointerdown.stop
                @dblclick.stop
                @click="dismiss(a)"
              >
                <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
              </button>
            </div>
          </li>
        </TransitionGroup>
        <div class="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
          <div class="h-full bg-accent/70 transition-[width] duration-1000 ease-linear" :style="{ width: `${left * 100}%` }" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* A new request slides in from the right and flashes once; one that goes fades out and the rest move up. */
.req-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.req-leave-active {
  position: absolute;
  inset-inline: 6px;
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.req-move {
  transition: transform 0.35s ease;
}
.req-enter-from {
  opacity: 0;
  transform: translateX(28px) scale(0.96);
}
.req-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
.req-flash {
  background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.35) 50%, transparent 80%);
  transform: translateX(-120%);
  animation: req-sweep 0.9s ease-out 0.1s 1 both;
}
@keyframes req-sweep {
  from {
    transform: translateX(-120%);
    opacity: 1;
  }
  to {
    transform: translateX(120%);
    opacity: 0;
  }
}
.count-enter-active {
  transition:
    transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.6),
    opacity 0.2s;
}
.count-leave-active {
  transition: opacity 0.1s;
}
.count-enter-from {
  transform: scale(1.6);
  opacity: 0;
}
.count-leave-to {
  opacity: 0;
}
</style>
