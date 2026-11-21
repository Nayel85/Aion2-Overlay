<script setup lang="ts">
// The promo's stage: a game screenshot, the real Unified HUD on it, the dedicated overlays it toggles
// (the real meter and kill feed pages, in frames), a caption and a cursor. `window.promo` is how the
// recorder drives it.
import { computed, onMounted, reactive, ref } from 'vue'
import UnifiedPage from '@/pages/UnifiedPage.vue'
import { useApp } from '@/stores/app.ts'
import { patchUnified, sim } from './stub.ts'

const store = useApp()
const slow = new URLSearchParams(location.search).get('slow') ?? '1'
const background = ref(new URLSearchParams(location.search).get('bg') ?? './backgrounds/ludra-fortress.png')
const caption = reactive({ text: '', sub: '', on: false })
const query = new URLSearchParams(location.search)
/** The stage's size: 1920×1080, or ?w=2048&h=858 for a widescreen screenshot (the HUD stays centred). */
const stageW = Number(query.get('w')) || 1920
const stageH = Number(query.get('h')) || 1080
/** ?bare=1: no captions and no cards, just the stage (the HUD-only video). */
const bare = query.has('bare')
const card = ref<'title' | 'outro' | null>(bare ? null : 'title')
const zoom = ref(Number(query.get('zoom')) || 1)
const cursor = reactive({ x: 960, y: 600, on: false, down: false })
const meterOn = computed(() => store.settings.meter.enabled)
const feedOn = computed(() => store.settings.killFeed.open)

onMounted(() => {
  void store.init()
  window.addEventListener('pointermove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY })
  window.addEventListener('pointerdown', () => (cursor.down = true))
  window.addEventListener('pointerup', () => (cursor.down = false))
  ;(window as unknown as { promo: unknown }).promo = {
    sim, patchUnified,
    caption: (text: string, sub = '') => Object.assign(caption, { text, sub, on: !!text }),
    card: (c: 'title' | 'outro' | null) => (card.value = c),
    zoom: (z: number) => (zoom.value = z),
    cursor: (on: boolean) => (cursor.on = on),
  }
})
</script>

<template>
  <div :style="{ position: 'relative', width: `${stageW}px`, height: `${stageH}px`, overflow: 'hidden', backgroundColor: '#1b2224', fontFamily: 'Inter, Segoe UI, system-ui, sans-serif' }">
   <!-- The stage: the game and what sits on it. The "camera" pushes in on it from the top centre. -->
   <div :style="{ position: 'absolute', inset: '0', backgroundImage: `url(${background})`, backgroundSize: '100% 100%', transformOrigin: '50% 0', transform: `scale(${zoom})`, transition: 'transform 0.9s ease-in-out' }">
    <!-- The dedicated overlays the HUD's buttons switch on and off. -->
    <iframe class="ghost" :class="{ on: meterOn }" :src="`./embed.html?page=meter&slow=${slow}`" style="left: 36px; top: 150px; width: 380px; height: 330px" />
    <iframe class="ghost" :class="{ on: feedOn }" :src="`./embed.html?page=killfeed&slow=${slow}`" style="right: 40px; top: 410px; width: 360px; height: 220px" />

    <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%)"><UnifiedPage /></div>
   </div>

    <!-- The recorder flips this pixel each frame, so the browser always has a new frame to capture. -->
    <div id="tick" style="position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; background: #1b2224" />

    <!-- Caption. -->
    <div v-if="!bare" class="caption" :class="{ on: caption.on }">
      <div class="line">{{ caption.text }}</div>
      <div v-if="caption.sub" class="sub">{{ caption.sub }}</div>
    </div>

    <!-- Title and closing cards. -->
    <div v-if="!bare" class="card" :class="{ on: card === 'title' }">
      <img src="/icon.png" alt="" style="width: 92px; height: 92px" />
      <h1>The Lokthar <span>dynamic island</span></h1>
      <p>One small bar for your whole Aion 2 overlay</p>
    </div>
    <div v-if="!bare" class="card" :class="{ on: card === 'outro' }">
      <img src="/icon.png" alt="" style="width: 92px; height: 92px" />
      <h1>Compact. Smart. <span>Yours.</span></h1>
      <p>Lokthar Unified HUD &nbsp;·&nbsp; free, open source &nbsp;·&nbsp; github.com/erylopez/aion-overlay</p>
    </div>

    <!-- The mouse: the recorder's own, drawn, since a headless browser shows none. -->
    <svg v-if="cursor.on" :style="{ position: 'absolute', left: `${cursor.x}px`, top: `${cursor.y}px`, width: '28px', height: '28px', pointerEvents: 'none', zIndex: 50, transform: cursor.down ? 'scale(0.85)' : 'none' }" viewBox="0 0 24 24">
      <path d="M4 2.5v17l4.6-4.1 3 6.4 3.1-1.4-3-6.3 6.3-.5z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.ghost { position: absolute; border: 0; background: transparent; opacity: 0; transform: translateY(8px) scale(0.98); transition: opacity 0.25s ease, transform 0.25s ease; pointer-events: none; }
.ghost.on { opacity: 1; transform: none; }
.caption { position: absolute; left: 0; right: 0; bottom: 70px; display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0; transform: translateY(10px); transition: opacity 0.3s ease, transform 0.3s ease; pointer-events: none; }
.caption.on { opacity: 1; transform: none; }
.line { padding: 14px 30px; border-radius: 16px; background: rgb(9 9 11 / 0.82); border: 1px solid rgb(255 255 255 / 0.12); color: #fafafa; font-size: 34px; font-weight: 600; letter-spacing: -0.01em; }
.sub { padding: 7px 18px; border-radius: 12px; background: rgb(9 9 11 / 0.72); color: #e4e4e7; font-size: 22px; }
.card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: rgb(9 9 11 / 0.9); backdrop-filter: blur(10px); opacity: 0; transition: opacity 0.5s ease; pointer-events: none; z-index: 40; }
.card.on { opacity: 1; }
.card h1 { margin: 0; font-size: 76px; font-weight: 700; letter-spacing: -0.03em; color: #fafafa; }
.card h1 span { color: #3b82f6; }
.card p { margin: 0; font-size: 28px; color: #a1a1aa; }
</style>
