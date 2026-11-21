import './slowmo.ts'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import Promo from './Promo.vue'
import { installStub, getSettings, setSetting, sim } from './stub.ts'

// The recording page for the promo video (playground/record-promo.mjs drives it): 1920×1080.
installStub()
const s = getSettings()
setSetting('unified', { ...s.unified, enabled: true, buttons: 'hover', opacity: 0.94, season: true, kina: false, abyssRate: false, targetStyle: 'inline' })
setSetting('meter', { ...s.meter, enabled: false })
setSetting('minimap', { ...s.minimap, enabled: false })
setSetting('hud', { ...s.hud, enabled: false })
// ?mini=1 (the HUD-only video): the events with their alerts on, and the Odyle energy next to them.
if (new URLSearchParams(location.search).has('mini')) {
  const on = { shugo: true, invasion: true, rift: true }
  setSetting('timers', { ...s.timers, enabled: { ...s.timers.enabled, ...on }, shown: { ...s.timers.shown, ...on } })
  setSetting('unified', { ...getSettings().unified, odyle: true, targetSeconds: 3 })
}
sim.staticMeter()
sim.kills()
createApp(Promo).use(createPinia()).mount('#playground')
