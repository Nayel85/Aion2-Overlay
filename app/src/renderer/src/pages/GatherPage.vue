<script setup lang="ts">
// A gathering's outcome, as it starts (main/gather.ts): the game decides it then, about 7 s before
// the result. A pill with what it will give (its icon, once its spot's kind is known) saying it will
// fail, rank up (Fine Odyle) or give twice as much; a plain one only if wanted. Gone when the result
// comes. Or (the default) a ring as the flight timer's: the item inside, its outcome's colour around,
// running down to the result (how long it takes, from the game's steps). Size, colours, which to show and a sound are settings
// (dashboard/GatherView). Clicks go through to the game; while the dashboard is up it shows a sample,
// and can be dragged into place. Nothing to show measures 0, and main keeps the window hidden.
import { useNow } from '@/lib/now.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { playSound } from '@/lib/sound.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { GatherForecast } from '@shared/gather.ts'
import { itemIcon } from '@shared/itemRef.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.gather)

/** While the dashboard is up and nothing is being gathered: a sample to place it by. */
const preview = computed(() => store.panelVisible && !store.gather)
const SAMPLE: GatherForecast = {
  kind: 'gather',
  outcome: 'rankUp',
  doubled: true,
  times: 1,
  item: { id: 610_610_014, count: 1, name: t('Fine Odyle'), grade: 21, icon: 'Icon_Item_Gather_Od_L_lv4_02a' },
  at: 0,
  durationMs: 6800,
  rolls: [
    { ms: 1557, success: 160, failure: 0, luck: false, doubled: false },
    { ms: 1102, success: 0, failure: 104, luck: false, doubled: false },
    { ms: 1557, success: 160, failure: 0, luck: false, doubled: false },
    { ms: 1557, success: 40, failure: 0, luck: false, doubled: true },
  ],
}

type Kind = 'fail' | 'rare' | 'proc' | 'plain'
const kindOf = (g: GatherForecast): Kind => (g.outcome === 'fail' ? 'fail' : g.outcome === 'proc' ? 'proc' : g.outcome === 'rankUp' || g.doubled || g.times > 1 ? 'rare' : 'plain')
/** How many times the item comes: a plant's grade (x3) and the doubling (x2) multiply. */
const timesOf = (g: GatherForecast): number => g.times * (g.doubled ? 2 : 1)
const textOf = (g: GatherForecast): string => {
  if (g.kind === 'craft') return g.outcome === 'fail' ? t('Craft will fail') : g.outcome === 'proc' ? (g.doubled ? t('Craft procs, x2') : t('Craft procs')) : t('Plain craft')
  if (g.outcome === 'fail') return t('Gathering will fail')
  if (g.outcome === 'rankUp') return g.doubled ? t('Rank up, x2') : t('Rank up')
  return timesOf(g) > 1 ? t('Gathering x{n}', { n: timesOf(g) }) : t('Gathering succeeds')
}
const wanted = (g: GatherForecast): boolean => {
  if (g.kind === 'craft' && !cfg.value.crafts) return false
  const k = kindOf(g)
  return k === 'fail' ? cfg.value.fail : k === 'rare' || k === 'proc' ? cfg.value.rare : cfg.value.plain
}

const shownGather = computed<GatherForecast | null>(() => (preview.value ? SAMPLE : store.gather && wanted(store.gather) ? store.gather : null))
const kind = computed(() => (shownGather.value ? kindOf(shownGather.value) : null))
/** A failure red, a craft's proc green, a gathering's x2 or x3 gold. */
const FAIL = '#d73a3a'
const PROC = '#3fb950'
const GOLD = '#f5d77a'
/** The grades' colours, as the game's: green Fine, blue Pure, gold Radiant, orange above. */
const gradeColour = (grade: number): string | null => (grade >= 51 ? '#f0883e' : grade >= 41 ? '#f5d77a' : grade >= 31 ? '#58a6ff' : grade >= 21 ? '#3fb950' : null)
const colour = computed(() => {
  const g = shownGather.value
  if (kind.value === 'fail') return FAIL
  if (kind.value === 'proc') return PROC
  // A rank up in its item's grade colour, or, the item not known, the grade rolled's (2 Fine...);
  // a gathering's x2 or x3 in gold.
  const grade = g?.item ? g.item.grade : g?.grade ? g.grade * 10 + 1 : 0
  if (kind.value === 'rare') return (g?.outcome === 'rankUp' && gradeColour(grade)) || GOLD
  return '#9aa0ac'
})
const shown = computed(() => cfg.value.enabled && !!shownGather.value)
/** What it will give, as an icon and a name (none for a spot whose kind is not learnt yet). */
const item = computed(() => {
  const it = cfg.value.icon ? shownGather.value?.item : null
  return it ? { name: it.count > 1 ? `${it.name} x${it.count}` : it.name, icon: itemIcon(it.icon) } : null
})

// ---- the ring: running down over how long it takes (the game's steps say it, main/gather.ts) ----

// Ticking while a gathering or a craft is going on (or with the sample shown).
const now = useNow(50, () => store.settings.gather.enabled && (store.panelVisible || !!store.gather))
/** When not told: about 5 s a gathering, 7 s a craft. */
const lastsMs = (g: GatherForecast): number => g.durationMs ?? (g.kind === 'craft' ? 7000 : 5000)
/** The ring's share left, 1 at the start to 0 at the result as it should come; the sample loops. */
const left = computed(() => {
  const g = shownGather.value
  if (!g) return 0
  const span = lastsMs(g)
  const elapsed = preview.value ? now.value % span : now.value - g.at
  return Math.max(0, 1 - elapsed / span)
})
// ---- the gauges: the game's success and failure gauges, filling roll by roll -----------------

/** The time spent so far (the sample loops). */
const elapsed = computed(() => {
  const g = shownGather.value
  if (!g) return 0
  return preview.value ? now.value % lastsMs(g) : now.value - g.at
})
/** Where the gauges stand now (0..1 each), and the roll playing: a roll fills its share over its time. */
const gauges = computed(() => {
  const g = shownGather.value
  if (!g || !g.rolls.length) return null
  const fullOk = g.rolls.reduce((n, r) => n + r.success, 0)
  const fullFail = g.rolls.reduce((n, r) => n + r.failure, 0)
  // The gauge's top: what a success fills (360 for an Odyle node), else what a failure does.
  const top = Math.max(g.outcome === 'fail' ? fullFail : fullOk, fullOk, fullFail, 1)
  let t = elapsed.value - 110
  let ok = 0
  let bad = 0
  let playing: (typeof g.rolls)[number] | null = null
  for (const r of g.rolls) {
    if (t <= 0) break
    const part = Math.min(1, t / r.ms)
    ok += r.success * part
    bad += r.failure * part
    if (part < 1) playing = r
    t -= r.ms
  }
  // Past its rolls (a rank up playing, or a roll not read): the outcome's gauge at its top.
  if (t > 0) {
    if (g.outcome === 'fail') bad = top
    else ok = top
  }
  return { ok: Math.min(1, ok / top), bad: Math.min(1, bad / top), luck: !!playing?.luck, doubled: !!playing?.doubled }
})

/** The ring's length (2πr, r 21). */
const RING = 2 * Math.PI * 21

// A sound as one starts, for those wanted.
watch(
  () => store.gather?.at,
  (at) => {
    const g = store.gather
    if (!at || !g || !cfg.value.enabled || !wanted(g)) return
    const k = kindOf(g)
    if ((k === 'fail' && cfg.value.soundFail) || ((k === 'rare' || k === 'proc') && cfg.value.soundRare)) void playSound('cube', cfg.value.soundId, cfg.value.volume)
  },
)

const drag = windowDrag({ overlay: 'gather' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && shown.value ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('overlay:resize', 'gather', { width: r.width, height: r.height })
}
watch([shown, () => cfg.value.scale, () => cfg.value.style, () => shownGather.value && textOf(shownGather.value)], () => void nextTick(report))

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
      <div
        v-if="shown && shownGather"
        :class="['m-1.5 flex flex-col items-center', preview && 'cursor-move']"
        :style="{ opacity: cfg.opacity }"
        :title="preview ? t('drag to move') : undefined"
        @pointerdown="preview && drag.onPointerDown($event)"
      >
        <!-- The gauges: the item and what it will be, then the success gauge and the failure one filling roll by roll. -->
        <div
          v-if="cfg.style === 'gauges' && gauges"
          class="rounded-lg bg-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
          :style="{ width: `${190 * cfg.scale}px`, padding: `${6 * cfg.scale}px ${8 * cfg.scale}px` }"
        >
          <div class="flex items-center font-bold" :style="{ gap: `${6 * cfg.scale}px`, fontSize: `${12 * cfg.scale}px`, color: colour }">
            <img v-if="item?.icon" :src="item.icon" :alt="item.name" draggable="false" :class="['rounded', kind === 'fail' && 'opacity-60 grayscale']" :style="{ width: `${22 * cfg.scale}px`, height: `${22 * cfg.scale}px` }" />
            <span class="min-w-0 flex-1 truncate">{{ textOf(shownGather) }}</span>
            <span v-if="gauges.luck" class="shrink-0 text-[#f5d77a]" :style="{ fontSize: `${10 * cfg.scale}px` }">{{ t('Lady Luck') }}</span>
            <span v-else-if="gauges.doubled" class="shrink-0 text-[#f5d77a]" :style="{ fontSize: `${10 * cfg.scale}px` }">x2</span>
          </div>
          <div class="overflow-hidden rounded-full bg-white/10" :style="{ marginTop: `${5 * cfg.scale}px`, height: `${7 * cfg.scale}px` }">
            <div class="h-full rounded-full bg-[#3fb950]" :style="{ width: `${gauges.ok * 100}%` }" />
          </div>
          <div class="overflow-hidden rounded-full bg-white/10" :style="{ marginTop: `${3 * cfg.scale}px`, height: `${5 * cfg.scale}px` }">
            <div class="h-full rounded-full" :style="{ width: `${gauges.bad * 100}%`, background: FAIL }" />
          </div>
        </div>

        <!-- The ring: its outcome's colour around, running down; the item inside (greyed on a failure). -->
        <div
          v-else-if="cfg.style !== 'pill'"
          class="relative"
          :style="{ width: `${52 * cfg.scale}px`, height: `${52 * cfg.scale}px` }"
          :title="textOf(shownGather)"
        >
          <svg viewBox="0 0 52 52" class="absolute inset-0 size-full -rotate-90 drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]">
            <circle cx="26" cy="26" r="23" fill="rgba(9,9,11,0.72)" />
            <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3.5" />
            <circle
              cx="26" cy="26" r="21" fill="none" :stroke="colour" stroke-width="3.5" stroke-linecap="round"
              :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - left)"
              :style="{ filter: kind !== 'plain' ? `drop-shadow(0 0 3px ${colour})` : undefined }"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <img
              v-if="item?.icon"
              :src="item.icon"
              :alt="item.name"
              draggable="false"
              :class="['rounded-full', kind === 'fail' && 'opacity-60 grayscale']"
              :style="{ width: `${30 * cfg.scale}px`, height: `${30 * cfg.scale}px` }"
            />
            <svg v-else viewBox="0 0 16 16" fill="none" :stroke="colour" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" :style="{ width: `${20 * cfg.scale}px`, height: `${20 * cfg.scale}px` }"><path d="M3 13c0-6 4-10 10-10 0 6-4 10-10 10ZM3 13l5-5" /></svg>
          </div>
          <!-- Twice as much: x2, in a corner (the colour alone does not say it). -->
          <span
            v-if="timesOf(shownGather) > 1"
            class="absolute -bottom-0.5 -right-1 rounded-full px-1 font-bold leading-tight text-black shadow ring-1 ring-black/50"
            :style="{ background: colour, fontSize: `${11 * cfg.scale}px` }"
          >x{{ timesOf(shownGather) }}</span>
        </div>

        <span
          v-else
          class="flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
          :style="{
            fontSize: `${15 * cfg.scale}px`,
            padding: `${4 * cfg.scale}px ${14 * cfg.scale}px`,
            background: colour,
            color: kind === 'plain' ? '#111' : kind === 'fail' || kind === 'proc' ? '#fff' : '#1a1206',
          }"
        >
          <img
            v-if="item?.icon"
            :src="item.icon"
            :alt="item.name"
            draggable="false"
            class="rounded-full bg-black/40 ring-1 ring-black/40"
            :style="{ width: `${24 * cfg.scale}px`, height: `${24 * cfg.scale}px`, margin: `${-2 * cfg.scale}px 0 ${-2 * cfg.scale}px ${-8 * cfg.scale}px` }"
          />
          <!-- A leaf: gathering, what it gives not known yet. -->
          <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" :style="{ width: `${14 * cfg.scale}px`, height: `${14 * cfg.scale}px` }"><path d="M3 13c0-6 4-10 10-10 0 6-4 10-10 10ZM3 13l5-5" /></svg>
          {{ textOf(shownGather) }}
        </span>
      </div>
    </div>
  </div>
</template>
