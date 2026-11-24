<script setup lang="ts">
// Your own damage on the meter's target, skill by skill: your DPS large, then each skill's icon,
// DPS, share and damage, a bar behind each as long as its share. Redrawn every second; moved by its
// header, sized to its rows (hidden while none of your damage is on the target).
import { useOverlay } from '@/lib/overlay.ts'
import { useIdle } from '@/lib/now.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SkillIcon from '@/components/SkillIcon.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { NO_PERSONAL, type PersonalView } from '@shared/meter.ts'

const EVERY_MS = 1000

const store = useApp()
const api = bridge()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { root, report } = useOverlay('skills')
const cfg = computed(() => store.settings.skills)
// Hidden while idle, if set.
const idle = useIdle(() => store.settings.skills)
const view = ref<PersonalView>(NO_PERSONAL)

/**
 * No fight while the dashboard is up: a sample to place it by, as every overlay has (an Assassin's
 * fight of the owner's: its skills and their damage).
 */
const SAMPLE: PersonalView = (() => {
  const list: [number, string, number][] = [
    [13130000, 'Insignia Explosion', 320657], [13350000, 'Heart Gore', 309294], [13040000, 'Swift Slice', 142221],
    [13030000, 'Breaking Slice', 112747], [13100000, 'Savage Roar', 110178], [13120000, 'Savage Smash', 104406],
  ]
  const damage = list.reduce((n, [, , d]) => n + d, 0)
  const secs = 42
  return { target: 'Training Scarecrow', battleTime: secs * 1000, dps: damage / secs, damage, skills: list.map(([code, name, d]) => ({ code, name, damage: d, dps: d / secs, share: (d / damage) * 100, dot: false })) }
})()
const shownView = computed(() => (!view.value.skills.length && store.panelVisible ? SAMPLE : view.value))
const rows = computed(() => shownView.value.skills.slice(0, cfg.value.rows))
const top = computed(() => Math.max(1, ...shownView.value.skills.map((s) => s.damage)))

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

async function load(): Promise<void> {
  view.value = await api.invoke('skills:get')
}

const drag = windowDrag({ overlay: 'skills' })
/** Its X: off, like the toggle on the DPS meter. */
const close = (): void => void store.set('skills', { ...store.settings.skills, enabled: false })

/** Tell main how big the window is; nothing of yours measures 0, and main keeps it hidden. */
watch([() => rows.value.length, () => store.panelVisible, idle], () => void nextTick(report))

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), EVERY_MS)
  report()
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div v-if="rows.length && !idle" class="m-1.5 w-[300px] rounded-lg border border-card bg-darker shadow-card" :style="{ opacity: cfg.opacity }">
        <header class="cursor-move px-2.5 pb-1.5 pt-2" :title="t('Drag to move')" @pointerdown="drag.onPointerDown">
          <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-darker">
            <span>{{ t('My skills') }}</span>
            <span class="tabular-nums text-default">{{ clock(shownView.battleTime) }}</span>
            <span class="ml-auto truncate normal-case tracking-normal text-darkest">{{ shownView.target }}</span>
            <button
              type="button"
              class="-my-1 -mr-1 flex size-5 shrink-0 items-center justify-center rounded text-darker hover:bg-dark hover:text-default"
              :title="t('Hide My skills (the DPS meter\'s Skills button brings it back)')"
              @pointerdown.stop
              @dblclick.stop
              @click="close"
            >
              <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
            </button>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-semibold tabular-nums text-accent-text">{{ short(shownView.dps) }}</span>
            <span class="text-xs text-darker">DPS</span>
            <span class="ml-auto text-xs tabular-nums text-darker">{{ t('{n} damage', { n: short(shownView.damage) }) }}</span>
          </div>
        </header>
        <ul class="space-y-0.5 px-1.5 pb-1.5">
          <li v-for="s in rows" :key="`${s.code}-${s.dot}`" class="relative overflow-hidden rounded bg-dark">
            <div class="absolute inset-y-0 left-0 bg-accent/35" :style="{ width: `${(s.damage / top) * 100}%` }" />
            <div class="relative flex items-center gap-2 px-1 py-0.5 text-xs">
              <SkillIcon :code="s.code" :size="20" />
              <span class="min-w-0 flex-1 truncate font-medium text-default" :title="s.name">
                {{ s.name }}<span v-if="s.dot" class="ml-1 text-[10px] text-darker">DoT</span>
              </span>
              <span class="w-12 shrink-0 text-right font-semibold tabular-nums text-default">{{ short(s.dps) }}</span>
              <span class="w-11 shrink-0 text-right tabular-nums text-darker">{{ s.share.toFixed(1) }}%</span>
              <span class="w-12 shrink-0 text-right tabular-nums text-darker">{{ short(s.damage) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
