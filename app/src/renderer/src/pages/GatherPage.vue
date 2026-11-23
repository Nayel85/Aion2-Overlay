<script setup lang="ts">
// A gathering's outcome, as it starts (main/gather.ts): the game decides it then, about 7 s before
// the result. A pill with what it will give (its icon, once its spot's kind is known) saying it will
// fail, rank up (Fine Odyle) or give twice as much; a plain one only if wanted. Gone when the result comes. Size, colours, which to show and a sound are settings
// (dashboard/GatherView). Clicks go through to the game; while the dashboard is up it shows a sample,
// and can be dragged into place. Nothing to show measures 0, and main keeps the window hidden.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { playSound } from '@/lib/sound.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { GatherForecast } from '@shared/gather.ts'
import { itemIcon, itemInfo } from '@shared/sessions.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.gather)

/** While the dashboard is up and nothing is being gathered: a sample to place it by. */
const preview = computed(() => store.panelVisible && !store.gather)
const SAMPLE: GatherForecast = { outcome: 'rankUp', doubled: true, item: 610_610_014, at: 0 }

type Kind = 'fail' | 'rare' | 'plain'
const kindOf = (g: GatherForecast): Kind => (g.outcome === 'fail' ? 'fail' : g.outcome === 'rankUp' || g.doubled ? 'rare' : 'plain')
const textOf = (g: GatherForecast): string => {
  if (g.outcome === 'fail') return t('Gathering will fail')
  if (g.outcome === 'rankUp') return g.doubled ? t('Rank up, x2') : t('Rank up')
  return g.doubled ? t('Gathering x2') : t('Gathering succeeds')
}
const wanted = (k: Kind): boolean => (k === 'fail' ? cfg.value.fail : k === 'rare' ? cfg.value.rare : cfg.value.plain)

const shownGather = computed<GatherForecast | null>(() => (preview.value ? SAMPLE : store.gather && wanted(kindOf(store.gather)) ? store.gather : null))
const kind = computed(() => (shownGather.value ? kindOf(shownGather.value) : null))
const colour = computed(() => (kind.value === 'fail' ? cfg.value.failColor : kind.value === 'rare' ? cfg.value.rareColor : '#9aa0ac'))
const shown = computed(() => cfg.value.enabled && !!shownGather.value)
/** What it will give, as an icon and a name (none for a spot whose kind is not known yet). */
const item = computed(() => {
  const id = cfg.value.icon ? shownGather.value?.item : null
  const info = id ? itemInfo(id) : undefined
  return info ? { name: info.name, icon: itemIcon(info.icon) } : null
})

// A sound as one starts, for those wanted.
watch(
  () => store.gather?.at,
  (at) => {
    const g = store.gather
    if (!at || !g || !cfg.value.enabled) return
    const k = kindOf(g)
    if ((k === 'fail' && cfg.value.soundFail) || (k === 'rare' && cfg.value.soundRare)) void playSound('cube', cfg.value.soundId, cfg.value.volume)
  },
)

const drag = windowDrag({ move: 'gather:moveTo', end: 'gather:dragEnd' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && shown.value ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('gather:resize', { width: r.width, height: r.height })
}
watch([shown, () => cfg.value.scale, () => shownGather.value && textOf(shownGather.value)], () => void nextTick(report))

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => observer?.disconnect())
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
        <span
          class="flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
          :style="{
            fontSize: `${15 * cfg.scale}px`,
            padding: `${4 * cfg.scale}px ${14 * cfg.scale}px`,
            background: colour,
            color: kind === 'plain' ? '#111' : kind === 'fail' ? '#fff' : '#1a1206',
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
