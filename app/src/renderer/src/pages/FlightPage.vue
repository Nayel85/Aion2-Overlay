<script setup lang="ts">
// The flight timer (shared/flight.ts): how many seconds of flight you have left at the way you fly
// now, with a gauge of your flight power; on the ground, how long until it is full again. Up while
// flying or refilling, gone at full. Clicks go through to the game; while the dashboard is up it
// shows a preview, and can be dragged into place.
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

const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 50)

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
const colour = computed(() => (left.value === null ? '#58a6ff' : left.value < 5 ? '#f85149' : left.value < 15 ? '#d29922' : '#3fb950'))

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
  clearInterval(ticker)
  observer?.disconnect()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div
        v-if="shown"
        :class="['m-1.5 w-[190px] rounded-lg bg-black/60 px-2.5 py-1.5', preview && 'cursor-move']"
        :style="{ opacity: cfg.opacity }"
        @pointerdown="preview && drag.onPointerDown($event)"
      >
        <div class="flex items-baseline gap-1.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
          <!-- A pair of wings. -->
          <svg viewBox="0 0 24 16" class="h-3.5 w-5 shrink-0 self-center" :style="{ color: colour }" fill="currentColor"><path d="M11 13C8 13 3 11 1 3c2 1.5 4 2 6 2-1.5-.8-2.5-2-3-3.5C7 3 9 5 11 9Zm2 0c3 0 8-2 10-10-2 1.5-4 2-6 2 1.5-.8 2.5-2 3-3.5C17 3 15 5 13 9Z" /></svg>
          <span v-if="left !== null" class="text-[18px] font-bold tabular-nums leading-none" :style="{ color: colour }">{{ left.toFixed(1) }}s</span>
          <span v-else-if="refill !== null" class="whitespace-nowrap text-[13px] font-semibold tabular-nums leading-none text-dark">{{ t('Full in {n}s', { n: Math.ceil(refill) }) }}</span>
          <span class="flex-1" />
          <span class="whitespace-nowrap text-[10px] tabular-nums text-dark">{{ Math.round(value / 100) }}<template v-if="fp?.max"> / {{ Math.round(fp.max / 100) }}</template></span>
        </div>
        <div v-if="share !== null" class="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
          <div class="h-full" :style="{ width: `${share * 100}%`, background: colour }" />
        </div>
        <div v-if="preview && !store.flight" class="mt-1 text-center text-[10px] text-darker">{{ t('drag to move') }}</div>
      </div>
    </div>
  </div>
</template>
