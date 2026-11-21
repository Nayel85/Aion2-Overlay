import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import StorageView from '@/components/dashboard/StorageView.vue'
import { installStub } from './stub.ts'

// The dashboard's Cache page on made-up sizes: http://localhost:5199/storage.html
installStub()
createApp(StorageView).use(createPinia()).mount('#playground')
