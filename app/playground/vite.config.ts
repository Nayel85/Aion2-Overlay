import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The playground: the real overlay pages in a browser, over game screenshots (playground/README.md).
const here = fileURLToPath(new URL('.', import.meta.url))
const app = resolve(here, '..')

export default defineConfig({
  root: here,
  publicDir: resolve(app, 'src/renderer/public'),
  resolve: { alias: { '@': resolve(app, 'src/renderer/src'), '@shared': resolve(app, 'src/shared') } },
  plugins: [vue()],
  css: { postcss: app },
  server: { port: 5199, fs: { allow: [app] } },
})
