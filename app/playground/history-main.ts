import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import HistoryView from '@/components/dashboard/HistoryView.vue'
import { installStub } from './stub.ts'

// The dashboard's History page on made-up fights: http://localhost:5199/history.html
installStub()
createApp(HistoryView).use(createPinia()).mount('#playground')
