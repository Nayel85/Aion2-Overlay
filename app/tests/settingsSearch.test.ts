import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('the settings search reads pages that exist, and finds settings in them', () => {
  const src = readFileSync(new URL('../src/renderer/src/lib/settingsSearch.ts', import.meta.url), 'utf8')
  const files = [...src.slice(src.indexOf('const WHERE'), src.indexOf('}', src.indexOf('const WHERE'))).matchAll(/'([\w/]+\.vue)'/g)].map((m) => m[1]!)
  assert.ok(files.length > 20)
  for (const f of files) {
    const path = new URL(`../src/renderer/src/components/${f}`, import.meta.url)
    assert.ok(existsSync(path), `${f}: gone (the search would miss its settings)`)
  }
  // The Settings page's rows are found as the search reads them.
  const settings = readFileSync(new URL('../src/renderer/src/components/dashboard/SettingsView.vue', import.meta.url), 'utf8')
  assert.ok([...settings.matchAll(/<SettingRow\b[^>]*\slabel="[^"]+"/g)].length > 5)
})
