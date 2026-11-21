<script setup lang="ts">
// A fight's rotation as a timeline you can move through, like a video editor's: one lane per skill,
// each cast an icon at its time. Zoom with − / + (or Ctrl + wheel), drag to pan (or Shift + wheel),
// hover for the time and click to pin it. Zoomed out, where icons would pile up, a cast is a tick.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SkillIcon from '@/components/SkillIcon.vue'
import { t } from '@/lib/i18n.ts'
import type { DetailsSkill } from '@shared/meter.ts'

const props = defineProps<{ skills: DetailsSkill[]; durationMs: number; damage: number }>()

const LABEL_W = 148
const LANE_H = 30
const RULER_H = 24
/** Casts closer than this are one (a multi-hit skill lands several hits in an instant). */
const MERGE_MS = 300
const MAX_LANES = 18
const PALETTE = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']

const duration = computed(() => Math.max(1, props.durationMs))
const lanes = computed(() =>
  props.skills
    .filter((s) => s.at.length && !s.dot)
    .sort((a, b) => b.damage - a.damage)
    .slice(0, MAX_LANES)
    .map((s, i) => {
      const casts: number[] = []
      for (const at of [...(s.opening ?? s.at)].sort((a, b) => a - b)) {
        if (!casts.length || at - casts[casts.length - 1]! > MERGE_MS) casts.push(at)
      }
      return { s, casts, color: PALETTE[i % PALETTE.length]! }
    }),
)
const castCount = computed(() => lanes.value.reduce((n, l) => n + l.casts.length, 0))

// ---- zoom and scroll ----------------------------------------------------------------------------
const scroller = ref<HTMLElement | null>(null)
const areaW = ref(600)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!scroller.value) return
  areaW.value = scroller.value.clientWidth
  // Open close enough to read the icons (a short fight fits whole; a long one scrolls: Fit shows it all).
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, ICON_PPS / fitPps.value))
  ro = new ResizeObserver(() => (areaW.value = scroller.value?.clientWidth ?? areaW.value))
  ro.observe(scroller.value)
})
onBeforeUnmount(() => ro?.disconnect())

const PAD = 14
const fitPps = computed(() => Math.max(1, (areaW.value - PAD * 2) / (duration.value / 1000)))
/** 1 = the whole fight fits; 8 = eight times closer. */
const zoom = ref(1)
const MAX_ZOOM = 24
const pps = computed(() => fitPps.value * zoom.value)
const width = computed(() => Math.max(areaW.value, (duration.value / 1000) * pps.value + PAD * 2))
const x = (ms: number): number => PAD + (ms / 1000) * pps.value
/** From this many pixels a second, a cast is its skill's icon; closer in than that they would pile up. */
const ICON_PPS = 34
const icons = computed(() => pps.value >= ICON_PPS - 1)

function setZoom(next: number, anchorPx?: number): void {
  const el = scroller.value
  const clamped = Math.min(MAX_ZOOM, Math.max(1, next))
  if (!el || clamped === zoom.value) return void (zoom.value = clamped)
  // Keep the time under the anchor (the pointer, or the middle) where it is while zooming.
  const at = anchorPx ?? el.clientWidth / 2
  const seconds = (el.scrollLeft + at - PAD) / pps.value
  zoom.value = clamped
  void nextTick(() => {
    el.scrollLeft = Math.max(0, seconds * pps.value + PAD - at)
  })
}
const zoomIn = (): void => setZoom(zoom.value * 1.5)
const zoomOut = (): void => setZoom(zoom.value / 1.5)
const fit = (): void => {
  zoom.value = 1
  if (scroller.value) scroller.value.scrollLeft = 0
}

function onWheel(e: WheelEvent): void {
  const el = scroller.value
  if (!el) return
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    setZoom(zoom.value * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - el.getBoundingClientRect().left)
  } else if (e.shiftKey) {
    e.preventDefault()
    el.scrollLeft += e.deltaY || e.deltaX
  }
}

// Drag to pan: the pointer is captured, so it keeps panning outside the lanes.
let drag: { x: number; left: number; moved: boolean } | null = null
const dragging = ref(false)
function down(e: PointerEvent): void {
  if (e.button !== 0 || !scroller.value) return
  drag = { x: e.clientX, left: scroller.value.scrollLeft, moved: false }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent): void {
  const el = scroller.value
  if (!el) return
  if (drag) {
    if (Math.abs(e.clientX - drag.x) > 3) {
      drag.moved = true
      dragging.value = true
    }
    if (drag.moved) el.scrollLeft = drag.left - (e.clientX - drag.x)
  }
  hover.value = timeAt(e.clientX)
}
function up(e: PointerEvent): void {
  if (drag && !drag.moved) pinned.value = pinned.value === null ? timeAt(e.clientX) : null
  drag = null
  dragging.value = false
}
function timeAt(clientX: number): number {
  const el = scroller.value!
  const ms = ((el.scrollLeft + clientX - el.getBoundingClientRect().left - PAD) / pps.value) * 1000
  return Math.min(duration.value, Math.max(0, ms))
}

// ---- the playhead ---------------------------------------------------------------------------------
const hover = ref<number | null>(null)
const pinned = ref<number | null>(null)
const head = computed(() => pinned.value ?? hover.value)
function clock(ms: number): string {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${(pps.value >= 40 ? rest.toFixed(1) : String(Math.floor(rest))).padStart(pps.value >= 40 ? 4 : 2, '0')}`
}
/** The casts of every lane at the playhead's second, to read what was used then. */
const near = computed(() => {
  const at = head.value
  if (at === null) return []
  const span = Math.max(250, 12_000 / pps.value)
  return lanes.value.flatMap((l) => l.casts.filter((c) => Math.abs(c - at) <= span).map((c) => ({ name: l.s.name, code: l.s.code, at: c })))
    .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))
    .slice(0, 4)
})

// ---- the ruler --------------------------------------------------------------------------------------
const STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
const ticks = computed(() => {
  const step = STEPS.find((s) => s * pps.value >= 64) ?? 300
  const out: { at: number; label: string }[] = []
  for (let s = 0; s * 1000 <= duration.value + 1; s += step) out.push({ at: s * 1000, label: clock(s * 1000) })
  return out
})
</script>

<template>
  <div class="select-none">
    <!-- The summary and the zoom. -->
    <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1.5 text-[11px]">
      <span class="tabular-nums"><b class="text-sm font-semibold text-default">{{ castCount }}</b> <span class="text-darker">{{ t('casts') }}</span></span>
      <span class="tabular-nums"><b class="text-sm font-semibold text-default">{{ clock(duration) }}</b> <span class="text-darker">{{ t('duration') }}</span></span>
      <span class="tabular-nums"><b class="text-sm font-semibold text-red">{{ Math.round(damage).toLocaleString('en-US') }}</b> <span class="text-darker">{{ t('damage') }}</span></span>
      <div class="ml-auto flex items-center gap-1">
        <button type="button" class="size-6 rounded bg-dark text-sm hover:bg-light" :title="t('Zoom out')" @click="zoomOut">−</button>
        <span class="w-10 text-center tabular-nums text-darker">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="size-6 rounded bg-dark text-sm hover:bg-light" :title="t('Zoom in')" @click="zoomIn">+</button>
        <button type="button" class="h-6 rounded bg-dark px-2 hover:bg-light" :title="t('The whole fight')" @click="fit">{{ t('Fit') }}</button>
      </div>
    </div>

    <div class="flex overflow-hidden rounded-lg border border-card bg-dark/60">
      <!-- The lanes' names stay while the timeline moves. -->
      <div class="shrink-0 border-r border-card" :style="{ width: `${LABEL_W}px` }">
        <div :style="{ height: `${RULER_H}px` }" class="border-b border-card" />
        <div v-for="l in lanes" :key="l.s.code" class="flex items-center gap-1.5 border-b border-card/50 px-2" :style="{ height: `${LANE_H}px` }" :title="`${l.s.name}: ${l.casts.length} casts, ${l.s.hits} hits`">
          <SkillIcon :code="l.s.code" :size="18" />
          <span class="min-w-0 flex-1 truncate text-[11px] text-dark">{{ l.s.name }}</span>
          <span class="shrink-0 text-[10px] tabular-nums text-darkest">×{{ l.casts.length }}</span>
        </div>
      </div>

      <div
        ref="scroller"
        :class="['relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden', dragging ? 'cursor-grabbing' : 'cursor-grab']"
        @wheel="onWheel"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @pointerleave="hover = null"
      >
        <div class="relative" :style="{ width: `${width}px`, height: `${RULER_H + lanes.length * LANE_H}px` }">
          <!-- Ruler. -->
          <div class="absolute inset-x-0 top-0 border-b border-card" :style="{ height: `${RULER_H}px` }">
            <span v-for="tk in ticks" :key="tk.at" class="absolute top-0 h-full border-l border-card pl-1 pt-1 text-[10px] tabular-nums text-darker" :style="{ left: `${x(tk.at)}px` }">{{ tk.label }}</span>
          </div>
          <!-- Gridlines under the lanes. -->
          <span v-for="tk in ticks" :key="`g${tk.at}`" class="pointer-events-none absolute border-l border-card/50" :style="{ left: `${x(tk.at)}px`, top: `${RULER_H}px`, bottom: '0' }" />
          <!-- Lanes. -->
          <div v-for="(l, i) in lanes" :key="l.s.code" class="absolute inset-x-0 border-b border-card/50" :style="{ top: `${RULER_H + i * LANE_H}px`, height: `${LANE_H}px` }">
            <template v-for="(c, n) in l.casts" :key="n">
              <span
                v-if="icons"
                class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[5px] border-[1.5px] bg-black/40"
                :style="{ left: `${x(c)}px`, borderColor: l.color }"
                :title="`${l.s.name} · ${clock(c)}`"
              ><SkillIcon :code="l.s.code" :size="20" /></span>
              <span v-else class="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm" :style="{ left: `${x(c)}px`, background: l.color }" :title="`${l.s.name} · ${clock(c)}`" />
            </template>
          </div>
          <!-- The playhead: the pointer's time, or the one you pinned. -->
          <div v-if="head !== null" class="pointer-events-none absolute inset-y-0 z-10 w-px" :class="pinned !== null ? 'bg-yellow' : 'bg-accent/70'" :style="{ left: `${x(head)}px` }">
            <span :class="['absolute left-0 top-0 -translate-x-1/2 rounded px-1 text-[10px] font-semibold tabular-nums text-black', pinned !== null ? 'bg-yellow' : 'bg-accent']">{{ clock(head) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-1.5 flex min-h-5 flex-wrap items-center gap-2 px-1.5 text-[11px] text-darker">
      <template v-if="head !== null && near.length">
        <span class="tabular-nums text-dark">{{ clock(head) }}</span>
        <span v-for="n in near" :key="`${n.code}-${n.at}`" class="flex items-center gap-1"><SkillIcon :code="n.code" :size="14" />{{ n.name }} <span class="tabular-nums text-darkest">{{ clock(n.at) }}</span></span>
      </template>
      <span v-else>{{ t('Hover the timeline for the time; click to pin it. Drag to move, + and − (or Ctrl + wheel) to zoom.') }}</span>
    </div>
  </div>
</template>
