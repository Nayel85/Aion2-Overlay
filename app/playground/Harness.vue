<script setup lang="ts">
// The playground's page: a game screenshot as the stage, the real Unified HUD on it, and the same
// "simulate the game" buttons as the Claude Design prototype (keep the two in step).
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import UnifiedPage from '@/pages/UnifiedPage.vue'
import { useApp } from '@/stores/app.ts'
import { getSettings, patchUnified, sim } from './stub.ts'

const store = useApp()
const cfg = computed(() => store.settings.unified)

// ---- backgrounds: the folder's screenshots, plus any you drop, paste or pick ------------------
const found = import.meta.glob('./backgrounds/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const backgrounds = reactive<{ name: string; url: string }[]>(Object.entries(found).map(([path, url]) => ({ name: path.split('/').pop()!, url })))
const KEY = 'playground.background'
const stored = ((): string | null => { try { return localStorage.getItem(KEY) } catch { return null } })()
const current = ref(backgrounds.find((b) => b.name === stored)?.name ?? backgrounds[0]?.name ?? '')
const background = computed(() => backgrounds.find((b) => b.name === current.value) ?? null)
watch(current, (n) => { try { localStorage.setItem(KEY, n) } catch { /* private window */ } })

function addImage(file: File): void {
  if (!file.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  const name = file.name || `pasted-${backgrounds.length + 1}.png`
  backgrounds.push({ name, url })
  current.value = name
}
const onPick = (e: Event): void => { for (const f of (e.target as HTMLInputElement).files ?? []) addImage(f) }
const onDrop = (e: DragEvent): void => { for (const f of e.dataTransfer?.files ?? []) addImage(f) }
const onPaste = (e: ClipboardEvent): void => { for (const f of e.clipboardData?.files ?? []) addImage(f) }
onMounted(() => { void store.init(); window.addEventListener('paste', onPaste) })
onUnmounted(() => window.removeEventListener('paste', onPaste))

// ---- the stage: the screenshot at its own pixels, shown scaled to fit or at 100% ----------------
const natural = reactive({ w: 1920, h: 1080 })
watch(background, (b) => {
  if (!b) return
  const img = new Image()
  img.onload = () => { natural.w = img.naturalWidth; natural.h = img.naturalHeight }
  img.src = b.url
}, { immediate: true })
const fit = ref(true)
const holder = ref<HTMLElement | null>(null)
const holderW = ref(1200)
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(() => (holderW.value = holder.value?.clientWidth ?? 1200)); if (holder.value) ro.observe(holder.value) })
onUnmounted(() => ro?.disconnect())
const zoom = computed(() => (fit.value ? Math.min(1, holderW.value / natural.w) : 1))

// ---- where the HUD sits (a prototype of the placement options; not an app setting yet) -------
type Place = 'centre' | 'left' | 'right'
const PLACES: { id: Place; label: string }[] = [
  { id: 'centre', label: 'Top centre' },
  { id: 'left', label: 'Left of the target frame' },
  { id: 'right', label: 'Right of the target frame' },
]
const place = ref<Place>('centre')
const flush = ref(true)
/** Half the width of the game's own target frame, in screenshot pixels. */
const frameHalf = ref(300)
const hostStyle = computed(() => {
  const top = flush.value ? '0px' : '14px'
  if (place.value === 'left') return { top, right: `calc(50% + ${frameHalf.value}px)` }
  if (place.value === 'right') return { top, left: `calc(50% + ${frameHalf.value}px)` }
  return { top, left: '50%', transform: 'translateX(-50%)' }
})

// ---- the simulated game --------------------------------------------------------------------------
const sims: { label: string; run: () => void }[] = [
  { label: 'Hit a monster', run: sim.hitMonster },
  { label: 'Hit a player', run: sim.hitPlayer },
  { label: 'Select a player', run: sim.selectPlayer },
  { label: 'Select (nothing known)', run: sim.selectUnknownPlayer },
  { label: 'Let go of the target', run: sim.clearTarget },
  { label: 'Enemies nearby', run: sim.enemies },
  { label: 'Enemies leave', run: sim.noEnemies },
  { label: 'Field boss spawns', run: sim.fieldBoss },
  { label: 'Cube nearby', run: sim.cube },
  { label: 'You died', run: sim.died },
  { label: 'Kina coming in', run: sim.kina },
  { label: 'Corridor kill (+300 AP)', run: () => sim.abyssKill(300) },
  { label: 'Guild event starting', run: sim.guildEvent },
  { label: 'Reset', run: sim.reset },
]
const TARGET_STYLES = [{ id: 'inline', label: 'In the bar' }, { id: 'strip', label: 'Two lines under' }] as const
const pct = (v: number): string => `${Math.round(v * 100)}%`
</script>

<template>
  <div style="position: fixed; inset: 0; display: flex; flex-direction: column; font-family: Inter, 'Segoe UI', system-ui, sans-serif; color: #fafafa; background: #09090b" @dragover.prevent @drop.prevent="onDrop">
    <!-- The stage. -->
    <div ref="holder" style="flex: 1; min-height: 0; overflow: auto; background: #111113">
      <div :style="{ width: `${natural.w * zoom}px`, height: `${natural.h * zoom}px`, margin: '0 auto' }">
        <div :style="{ position: 'relative', width: `${natural.w}px`, height: `${natural.h}px`, zoom, backgroundColor: '#1b2224', backgroundImage: background ? `url(${background.url})` : 'none', backgroundSize: '100% 100%', overflow: 'hidden' }">
          <div v-if="!background" style="position: absolute; inset: 0; display: grid; place-items: center; color: #9fb0b4; font-size: 14px">Drop, paste or pick a game screenshot below.</div>
          <!-- Marks the middle of the screen, where the game puts its own target frame. -->
          <div v-if="place !== 'centre'" :style="{ position: 'absolute', top: '0', bottom: '0', left: `calc(50% - ${frameHalf}px)`, width: `${frameHalf * 2}px`, borderLeft: '1px dashed rgb(255 255 255 / 0.25)', borderRight: '1px dashed rgb(255 255 255 / 0.25)', pointerEvents: 'none' }" />
          <div :style="{ position: 'absolute', ...hostStyle }"><UnifiedPage /></div>
        </div>
      </div>
    </div>

    <!-- The controls: not part of the HUD. -->
    <div style="max-height: 46vh; overflow: auto; box-sizing: border-box; padding: 12px 16px; background: #111113; border-top: 1px solid #27272a; display: flex; flex-direction: column; gap: 10px">
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
        <span style="font-size: 13px; font-weight: 600">Simulate the game</span>
        <button v-for="s in sims" :key="s.label" type="button" class="pg-btn" @click="s.run()">{{ s.label }}</button>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 12px; color: #d4d4d8">
        <label class="pg-field">Place
          <select class="pg-btn" :value="place" @change="place = ($event.target as HTMLSelectElement).value as Place"><option v-for="p in PLACES" :key="p.id" :value="p.id">{{ p.label }}</option></select>
        </label>
        <label class="pg-field"><input v-model="flush" type="checkbox" /> Flush to the top edge</label>
        <label class="pg-field">Target frame half-width
          <input v-model.number="frameHalf" type="range" min="100" max="500" step="10" /> {{ frameHalf }} px
        </label>
        <label class="pg-field">Target
          <select class="pg-btn" :value="cfg.targetStyle" @change="patchUnified({ targetStyle: ($event.target as HTMLSelectElement).value as 'inline' | 'strip' })"><option v-for="o in TARGET_STYLES" :key="o.id" :value="o.id">{{ o.label }}</option></select>
        </label>
        <label class="pg-field">Opacity
          <input type="range" min="0" max="1" step="0.02" :value="cfg.opacity" @input="patchUnified({ opacity: Number(($event.target as HTMLInputElement).value) })" /> {{ pct(cfg.opacity) }}
        </label>
        <label class="pg-field">Size
          <input type="range" min="0.75" max="1.75" step="0.05" :value="cfg.scale" @input="patchUnified({ scale: Number(($event.target as HTMLInputElement).value) })" /> {{ pct(cfg.scale) }}
        </label>
        <label class="pg-field"><input type="checkbox" :checked="cfg.kina" @change="patchUnified({ kina: ($event.target as HTMLInputElement).checked })" /> Kina/h</label>
        <label class="pg-field"><input type="checkbox" :checked="cfg.abyssRate" @change="patchUnified({ abyssRate: ($event.target as HTMLInputElement).checked })" /> AP/h</label>
        <label class="pg-field"><input type="checkbox" :checked="cfg.season" @change="patchUnified({ season: ($event.target as HTMLInputElement).checked })" /> AP this season</label>
        <label class="pg-field"><input type="checkbox" :checked="cfg.buttons === 'always'" @change="patchUnified({ buttons: ($event.target as HTMLInputElement).checked ? 'always' : 'hover' })" /> Buttons always</label>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: #d4d4d8">
        <span style="font-weight: 600">Background</span>
        <button v-for="b in backgrounds" :key="b.name" type="button" :class="['pg-btn', b.name === current && 'pg-on']" @click="current = b.name">{{ b.name }}</button>
        <label class="pg-btn" style="cursor: pointer">Add…<input type="file" accept="image/*" multiple style="display: none" @change="onPick" /></label>
        <label class="pg-field"><input v-model="fit" type="checkbox" /> Fit to the window ({{ Math.round(zoom * 100) }}%)</label>
        <span style="color: #a1a1aa">Or drop / paste a screenshot anywhere. Settings: {{ getSettings().unified.enabled ? 'Unified HUD on' : 'off' }}.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg-btn { height: 30px; padding: 0 10px; border: 1px solid #3f3f46; border-radius: 8px; background: #18181b; color: #fafafa; font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; font-family: inherit; }
.pg-btn:hover { background: #27272a; }
.pg-on { border-color: #3b82f6; }
.pg-field { display: inline-flex; align-items: center; gap: 6px; }
</style>
