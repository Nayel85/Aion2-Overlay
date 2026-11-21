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
const set = (power: 'off' | 'beside' | 'below'): void => setSetting('meter', { ...getSettings().meter, enabled: true, opacity: 0.95, width: 440, rows: 8, power })
const q = new URLSearchParams(location.search).get('power')
set(q === 'beside' || q === 'below' ? q : 'beside')
sim.party()
const pinia = createPinia()
createApp(MeterPage).use(pinia).mount('#playground')
void useApp(pinia).init()

const box = document.getElementById('controls')!
for (const [label, v] of [['Off', 'off'], ['Beside the name', 'beside'], ['Under the name', 'below']] as const) {
  const b = document.createElement('button')
  b.textContent = label
  b.style.cssText = 'padding: 6px 10px; background: #2a3336; color: #ddd; border: 1px solid #455; border-radius: 6px; cursor: pointer'
  b.onclick = () => set(v)
  box.append(b)
}
