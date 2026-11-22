import './slowmo.ts'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import GuildView from '@/components/dashboard/GuildView.vue'
import { useApp } from '@/stores/app.ts'
import { installStub } from './stub.ts'

// The Guild page on a sample roster: http://localhost:5199/guild.html  (?view=characters)
installStub()
const pinia = createPinia()
createApp(GuildView).use(pinia).mount('#playground')
void useApp(pinia).init()
