import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// Three builds from one config: main and preload are Node targets, the renderer a Vite web build.
// `@shared` resolves from all three, so the IPC contract is one file rather than three copies.
const shared = resolve(__dirname, 'src/shared')
// The releases' repository is private: the updater reads it with a read-only token, built in from
// update-token.txt (git ignores it) or NAYEL_UPDATE_TOKEN; none, and the updater finds nothing.
const tokenFile = resolve(__dirname, 'update-token.txt')
const updateToken = process.env.NAYEL_UPDATE_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    define: { __UPDATE_TOKEN__: JSON.stringify(updateToken) },
    // Electron's own module (fs without its .asar reading), there at run time.
    build: { rollupOptions: { external: ['original-fs'] } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    // Minified output ships no comments: the built CSS is what an installed copy carries.
    build: { minify: 'esbuild', cssMinify: 'esbuild' },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared,
      },
    },
    plugins: [vue()],
  },
})
