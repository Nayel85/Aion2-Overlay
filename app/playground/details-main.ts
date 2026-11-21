import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import DetailsPage from '@/pages/DetailsPage.vue'
import { installStub } from './stub.ts'

// The Details window on a made-up PvP fight (stub.ts `pvpFightView`): http://localhost:5199/details.html
installStub()
createApp(DetailsPage).use(createPinia()).mount('#playground')

// ?tab=3 opens that tab (0 Skills … 3 Rotation), ?who=Ksix picks that player: for a screenshot.
const q = new URLSearchParams(location.search)
setTimeout(() => {
  const who = q.get('who')
  if (who) [...document.querySelectorAll('li')].find((li) => li.textContent?.includes(who))?.click()
  const tab = q.get('tab')
  if (tab) (document.querySelectorAll('nav button')[Number(tab)] as HTMLElement | undefined)?.click()
}, 500)
