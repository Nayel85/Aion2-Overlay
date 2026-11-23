<script setup lang="ts">
// The flight timer (shared/flight.ts): how many seconds of flight you have left at the way you fly
// now, with a gauge of your flight power; on the ground, how long until it is full again. Up while
// flying or refilling, gone at full. Clicks go through to the game; while the dashboard is up it
// shows a preview, and can be dragged into place.
import { useNow } from '@/lib/now.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { flightLeft, flightNow, flightRefill, type FlightPower } from '@shared/flight.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.flight)

// Ticking while flying or refilling (or with the sample shown): still at full on the ground.
const now = useNow(33, () => {
  const fp = store.flight
  return store.settings.flight.enabled && (store.panelVisible || (fp !== null && (fp.flying || fp.max === null || fp.current < fp.max)))
})

/** While the dashboard is up: a flight to place it by. */
const preview = computed(() => store.panelVisible)
/** A 15 s flight from full, over and over. */
const SAMPLE = computed<FlightPower>(() => ({ current: 150_000 - 10 * (now.value % 15_000), max: 150_000, ratePerS: 4000, flying: true, drainPerS: 10_000, atMs: now.value }))
const fp = computed<FlightPower | null>(() => (preview.value && !store.flight ? SAMPLE.value : store.flight))

const value = computed(() => (fp.value ? flightNow(fp.value, now.value) : 0))
const left = computed(() => (fp.value ? flightLeft(fp.value, now.value) : null))
const refill = computed(() => (fp.value ? flightRefill(fp.value, now.value) : null))
const share = computed(() => (fp.value?.max ? Math.min(1, value.value / fp.value.max) : null))
/** Flying, or refilling: hidden at full on the ground. */
const shown = computed(() => cfg.value.enabled && !!fp.value && (preview.value || left.value !== null || refill.value !== null))
/** Red under 5 s of flight, yellow under 15. */
const colour = computed(() => (left.value === null ? '#6e8fb8' : left.value < 5 ? '#f85149' : left.value < 15 ? '#d29922' : '#3fb950'))

/** The ring's length (2πr, r 21). */
const RING = 2 * Math.PI * 21
const drag = windowDrag({ move: 'flight:moveTo', end: 'flight:dragEnd' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && shown.value ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('flight:resize', { width: r.width, height: r.height })
}
watch(shown, () => void nextTick(report))

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <!-- A ring, as a skill's cooldown: the flight power left around, the seconds inside (of flight
           left, bright; until full, dim), the wings under them. -->
      <div
        v-if="shown"
        :class="['relative m-1 size-[52px]', preview && 'cursor-move']"
        :style="{ opacity: cfg.opacity }"
        :title="preview && !store.flight ? t('drag to move') : refill !== null ? t('Full in {n}s', { n: Math.ceil(refill) }) : undefined"
        @pointerdown="preview && drag.onPointerDown($event)"
      >
        <svg viewBox="0 0 52 52" class="absolute inset-0 -rotate-90 drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]">
          <circle cx="26" cy="26" r="23" fill="rgba(9,9,11,0.72)" />
          <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3.5" />
          <circle
            v-if="share !== null"
            cx="26" cy="26" r="21" fill="none" :stroke="colour" stroke-width="3.5" stroke-linecap="round"
            :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - share)"
            :style="{ filter: left !== null ? `drop-shadow(0 0 3px ${colour})` : undefined }"
          />
        </svg>
        <div class="relative flex size-full flex-col items-center justify-center [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
          <span v-if="left !== null" class="text-[15px] font-bold tabular-nums leading-none" :style="{ color: colour }">{{ left < 10 ? left.toFixed(1) : Math.floor(left) }}</span>
          <span v-else-if="refill !== null" class="text-[13px] font-semibold tabular-nums leading-none text-dark">{{ Math.ceil(refill) }}</span>
          <svg viewBox="0 0 24 16" class="mt-0.5 h-2 w-3" :style="{ color: left !== null ? colour : '#8b8f9c' }" fill="currentColor"><path d="M11 13C8 13 3 11 1 3c2 1.5 4 2 6 2-1.5-.8-2.5-2-3-3.5C7 3 9 5 11 9Zm2 0c3 0 8-2 10-10-2 1.5-4 2-6 2 1.5-.8 2.5-2 3-3.5C17 3 15 5 13 9Z" /></svg>
        </div>
      </div>
    </div>
  </div>
</template>
