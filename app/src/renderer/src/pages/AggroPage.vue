<script setup lang="ts">
// Aggro: the monsters on you (the engine's aggro.rs), the bosses first, each with how long it has been on
// you and how long since its last hit. Clicks go through to the game; while the dashboard is up it shows
// a sample, and can be dragged into place. None on you measures 0, and main keeps the window hidden.
import { useOverlay } from '@/lib/overlay.ts'
import { computed, nextTick, onMounted, watch } from 'vue'
import CollapseButton from '@/components/CollapseButton.vue'
import { t } from '@/lib/i18n.ts'
import { useNow } from '@/lib/now.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { duration } from '@shared/format.ts'
import type { AggroMob } from '@shared/tracker.ts'

const store = useApp()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { report } = useOverlay('aggro', () => list.value.length > 0)
const cfg = computed(() => store.settings.aggro)
const now = useNow(1000)

const ROWS = 10
const SAMPLE = computed<AggroMob[]>(() => [
  { entity: -1, code: null, name: t('A boss'), boss: true, since: now.value - 42_000, lastHit: now.value - 1_000 },
  { entity: -2, code: null, name: t('A monster'), boss: false, since: now.value - 8_000, lastHit: now.value - 3_000 },
])
/** None on you while the dashboard is up: a sample to place it by. */
const preview = computed(() => !store.aggro.length && store.panelVisible)
const list = computed(() => (store.aggro.length ? store.aggro : preview.value ? SAMPLE.value : []))

const drag = windowDrag({ overlay: 'aggro' })
/** Minimized: the header only (how many). Clickable while the dashboard is up, as dragging is. */
const toggleCollapsed = (): void => void store.set('aggro', { ...cfg.value, collapsed: !cfg.value.collapsed })

watch([() => list.value.length, () => cfg.value.collapsed], () => void nextTick(report))
onMounted(() => report())
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <section
        v-if="list.length"
        :class="['text-glow m-1.5 w-[240px] rounded-lg border px-2.5 py-2', store.panelVisible && 'cursor-move']"
        :style="panelStyle(cfg.opacity, '249 115 22')"
        @pointerdown="store.panelVisible && drag.onPointerDown($event)"
      >
        <div :class="['flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange', !cfg.collapsed && 'mb-1']">
          <span class="size-1.5 animate-pulse rounded-full bg-orange" />
          {{ t('On you · {n}', { n: list.length }) }}
          <span v-if="preview" class="ml-auto font-normal normal-case tracking-normal text-darker">{{ t('drag to move') }}</span>
          <CollapseButton v-if="store.panelVisible" :class="!preview && 'ml-auto'" :collapsed="cfg.collapsed" @toggle="toggleCollapsed" />
        </div>
        <div v-if="!cfg.collapsed" class="space-y-0.5">
          <div v-for="m in list.slice(0, ROWS)" :key="m.entity" class="flex items-baseline gap-1.5 text-[13px]">
            <span v-if="m.boss" class="shrink-0 self-center rounded bg-red/20 px-1 text-[10px] font-semibold leading-4 text-red">{{ t('Boss') }}</span>
            <span :class="['min-w-0 flex-1 truncate font-medium', m.boss ? 'text-red' : 'text-default']">{{ m.name }}</span>
            <span class="shrink-0 text-[11px] tabular-nums text-darker" :title="t('On you for')">{{ duration(Math.max(0, now - m.since)) }}</span>
          </div>
        </div>
        <div v-if="!cfg.collapsed && list.length > ROWS" class="mt-0.5 text-[11px] text-darker">… {{ t('{n} more', { n: list.length - ROWS }) }}</div>
      </section>
    </div>
  </div>
</template>
