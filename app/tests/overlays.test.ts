import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { OVERLAY_IDS } from '../src/shared/ipc.ts'

const read = (path: string): string => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

/** Each window's page, by its route, as App.vue loads it. */
function pages(): Map<string, string> {
  const app = read('renderer/src/App.vue')
  return new Map([...app.matchAll(/^\s+(\w+): \(\) => import\('\.\/pages\/(\w+)\.vue'\)/gm)].map((m) => [m[1]!, m[2]!]))
}

test('every overlay is declared once in main, opened, shown and placed alike (OVERLAYS)', () => {
  const windows = read('main/windows.ts')
  const registry = windows.slice(windows.indexOf('const OVERLAYS: Record<OverlayId'), windows.indexOf('const MEASURED ='))
  for (const id of OVERLAY_IDS) assert.match(registry, new RegExp(`\\b${id}: \\w+Overlay,`), id)
  // No window of its own besides them: only the bubble, the dashboard, the details and the map's.
  const own = [...windows.matchAll(/^let (\w+): BrowserWindow \| null = null/gm)].map((m) => m[1])
  assert.deepEqual(own.sort(), ['bubble', 'details', 'panel'])
})

test("every overlay's page measures itself with the common tool, and has its sample to be placed", () => {
  const byRoute = pages()
  for (const id of OVERLAY_IDS) {
    const page = byRoute.get(id)
    assert.ok(page, `${id}: no page`)
    const src = read(`renderer/src/pages/${page}.vue`)
    assert.match(src, new RegExp(`useOverlay\\('${id}'`), `${page}: not measured by lib/overlay.ts`)
    assert.doesNotMatch(src, /new ResizeObserver|'overlay:resize'/, `${page}: measures itself apart`)
    // The packet log's pill shows only while it records: never placed. The Unified HUD always has its
    // bar (the time, the ping, its buttons): it is its own sample.
    if (id !== 'packets' && id !== 'unified') assert.match(src, /placing|store\.panelVisible|store\.hudEditing/, `${page}: no sample while placed`)
  }
})

test("every overlay's settings page has the common window rows (opacity, size, idle, its place)", () => {
  const files = ['components/dashboard', 'components/panel', 'components'].flatMap((dir) => {
    const path = new URL(`../src/renderer/src/${dir}/`, import.meta.url)
    return readdirSync(path).filter((f) => f.endsWith('.vue')).map((f) => readFileSync(new URL(f, path), 'utf8'))
  })
  const all = files.join('\n')
  // The packet log's pill is the only overlay with no settings of its own.
  for (const id of OVERLAY_IDS.filter((i) => i !== 'packets')) assert.match(all, new RegExp(`<OverlayWindowSettings[^>]*overlay="${id}"`), `${id}: no window rows`)
})
