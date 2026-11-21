import './slowmo.ts'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import MeterPage from '@/pages/MeterPage.vue'
import KillFeedPage from '@/pages/KillFeedPage.vue'
import { installStub, setSetting, getSettings, sim } from './stub.ts'

// A dedicated overlay on its own, for the promo (and the playground's stage): ?page=meter | killfeed
installStub()
const page = new URLSearchParams(location.search).get('page')
const s = getSettings()
if (page === 'meter') {
  setSetting('meter', { ...s.meter, enabled: true, opacity: 0.9 })
  sim.longFight()
} else {
  setSetting('killFeed', { ...s.killFeed, open: true, opacity: 0.9, target: false })
  sim.kills()
}
createApp(page === 'meter' ? MeterPage : KillFeedPage).use(createPinia()).mount('#playground')
