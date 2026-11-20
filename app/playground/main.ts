import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/main.css'
import { installStub } from './stub.ts'
import Harness from './Harness.vue'

// The stub goes in before anything asks for the bridge (window.a2t), as the preload does in the app.
installStub()
createApp(Harness).use(createPinia()).mount('#playground')
