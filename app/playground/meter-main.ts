import './slowmo.ts'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import MeterPage from '@/pages/MeterPage.vue'
import { useApp } from '@/stores/app.ts'
import { installStub, setSetting, getSettings, sim } from './stub.ts'

// The DPS meter on the party from the screenshot, to compare how combat power reads:
// http://localhost:5199/meter.html  (?power=off|beside|below, or the buttons)
installStub()
const set = (patch: Record<string, unknown>): void => setSetting('meter', { ...getSettings().meter, enabled: true, opacity: 0.95, width: 440, rows: 8, ...patch })
const q = new URLSearchParams(location.search).get('power')
const st = new URLSearchParams(location.search).get('style')
set({ power: q === 'off' || q === 'below' ? q : 'beside', style: st === 'flat' || st === 'bold' ? st : 'compact', barsOnly: new URLSearchParams(location.search).has('bars'), barsBackground: 0.4 })
sim.party()
const pinia = createPinia()
createApp(MeterPage).use(pinia).mount('#playground')
void useApp(pinia).init()

const box = document.getElementById('controls')!
for (const [label, patch] of [['Style: flat', { style: 'flat' }], ['Style: compact', { style: 'compact' }], ['Style: bold', { style: 'bold' }], ['Bars only: on', { barsOnly: true }], ['Bars only: off', { barsOnly: false }], ['Bars bg: 0%', { barsBackground: 0 }], ['Bars bg: 40%', { barsBackground: 0.4 }], ['Bars bg: 70%', { barsBackground: 0.7 }], ['Power: off', { power: 'off' }], ['Power: beside', { power: 'beside' }], ['Power: under', { power: 'below' }]] as const) {
  const b = document.createElement('button')
  b.textContent = label
  b.style.cssText = 'padding: 6px 10px; background: #2a3336; color: #ddd; border: 1px solid #455; border-radius: 6px; cursor: pointer'
  b.onclick = () => set(patch)
  box.append(b)
}
