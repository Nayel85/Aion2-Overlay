<script setup lang="ts">
// Your buffs and debuffs over the game: each one's icon with its stacks, and the time left under
// it (a ring runs down around timed ones). Buffs on one row, debuffs (cast by monsters) on another,
// red-edged. Moved by dragging; sized to what it shows, hidden while nothing is on you.
import { useOverlay } from '@/lib/overlay.ts'
import { useNow, useIdle } from '@/lib/now.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BuffIcon from '@/components/BuffIcon.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { buffName, consumable, hiddenBuff, remaining } from '@/lib/buffs.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { Buff } from '@shared/buffs.ts'

const store = useApp()
const api = bridge()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { root, report } = useOverlay('buffs')
const cfg = computed(() => store.settings.buffs)
// Hidden while idle, if set.
const idle = useIdle(() => store.settings.buffs)
// Ticking while there are effects to count down (or the sample to place).
const now = useNow(100, () => store.buffs.length > 0 || store.panelVisible)

/** Timed ones first, the soonest to run out first; then the ones without a timer. */
const order = (a: Buff, b: Buff): number => (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity) || a.id - b.id
// The ones the game does not show either (no icon, no name, system regen) stay hidden.
const live = computed(() =>
  store.buffs.filter(
    (b) =>
      (cfg.value.passives || !b.passive) &&
      (cfg.value.consumables || !consumable(b.id)) &&
      (b.endsAt === null || b.endsAt > now.value - 500) &&
      !hiddenBuff(b.id, b.skill, b.endsAt !== null, (b.endsAt ?? 0) - b.startedAt),
  ),
)
/**
 * Nothing on you while the dashboard is up: a sample to place it by, as every overlay has. Common
 * buffs of the owner's fights (A2Tools' ids, their icons bundled), each running down over and over.
 */
const preview = computed(() => !live.value.length && store.panelVisible)
const SAMPLE: [id: number, secs: number, debuff: boolean][] = [
  [181900411, 30, false], [181600211, 12, false], [181200101, 20, false], [170902301, 8, false], [22101051, 60, false], [12000161, 6, true],
]
const sample = computed<Buff[]>(() =>
  SAMPLE.map(([id, secs, debuff]) => {
    const span = secs * 1000
    const startedAt = now.value - (now.value % span)
    return { id, stacks: 1, endsAt: startedAt + span, startedAt, by: 0, skill: null, mine: !debuff, debuff, passive: false }
  }),
)
const shown = computed(() => (preview.value ? sample.value : live.value))
const buffs = computed(() => shown.value.filter((b) => !b.debuff || !cfg.value.debuffs).sort(order))
const debuffs = computed(() => (cfg.value.debuffs ? shown.value.filter((b) => b.debuff).sort(order) : []))
const rows = computed(() => [debuffs.value, buffs.value].filter((r) => r.length))

const left = (b: Buff): number | null => (b.endsAt === null ? null : b.endsAt - now.value)
/** How much of its time is left, 0..1, for the ring. */
const share = (b: Buff): number => (b.endsAt === null ? 1 : Math.max(0, Math.min(1, (b.endsAt - now.value) / Math.max(1, b.endsAt - b.startedAt))))
const tip = (b: Buff): string => [buffName(b.id), b.stacks > 1 ? t('{n} stacks', { n: b.stacks }) : '', b.debuff ? 'debuff' : b.mine ? t('yours') : ''].filter(Boolean).join(' · ')

const drag = windowDrag({ overlay: 'buffs' })

/** Tell main how big the window is; nothing on you measures 0, and main keeps it hidden. */
watch([() => rows.value.map((r) => r.length).join(), () => store.panelVisible, idle], () => void nextTick(report))

onMounted(() => {
  report()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div
        v-if="rows.length && !idle"
        class="m-1.5 cursor-move space-y-1 rounded-lg border border-card bg-darker/80 p-1.5 shadow-card"
        :style="{ opacity: cfg.opacity }"
        :title="t('Drag to move')"
        @pointerdown="drag.onPointerDown"
      >
        <div
          v-for="(row, n) in rows"
          :key="n"
          class="grid gap-1"
          :style="{ gridTemplateColumns: `repeat(${Math.min(cfg.perRow, row.length)}, ${cfg.size}px)` }"
        >
          <div v-for="b in row.slice(0, cfg.perRow * 2)" :key="`${b.id}-${b.by}`" class="flex flex-col items-center" :title="tip(b)">
            <div class="relative" :style="{ width: `${cfg.size}px`, height: `${cfg.size}px` }">
              <BuffIcon :id="b.id" :skill="b.skill" :size="cfg.size" :class="['rounded', b.debuff ? 'ring-1 ring-danger' : '']" />
              <!-- Time left: a dark wedge grows as it runs out. -->
              <div
                v-if="b.endsAt !== null"
                class="absolute inset-0 rounded"
                :style="{ background: `conic-gradient(transparent ${share(b) * 360}deg, rgba(0,0,0,0.55) 0)` }"
              />
              <span
                v-if="b.stacks > 1"
                class="absolute -bottom-0.5 -right-0.5 rounded bg-black/80 px-0.5 text-[10px] font-bold leading-tight tabular-nums text-white"
              >{{ b.stacks }}</span>
            </div>
            <span :class="['h-3.5 text-[10px] font-semibold leading-tight tabular-nums', (left(b) ?? Infinity) < 5000 ? 'text-danger' : 'text-default']">{{ remaining(left(b)) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
