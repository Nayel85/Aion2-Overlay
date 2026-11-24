import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { settingsSnapshot } from './settingsSnapshot.ts'
import { normalise, SETTINGS_DEFAULTS } from '../src/shared/settings.ts'

test('every setting reads as the reference says (npm run settings:snapshot after a change meant to be)', () => {
  const want = JSON.parse(readFileSync(new URL('./settings.snapshot.json', import.meta.url), 'utf8')) as Record<string, unknown[]>
  const got = JSON.parse(JSON.stringify(settingsSnapshot())) as Record<string, unknown[]>
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort())
  for (const key of Object.keys(want)) assert.deepEqual(got[key], want[key], key)
})

test('the defaults read as themselves', () => {
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) assert.deepEqual(normalise(key as keyof typeof SETTINGS_DEFAULTS, value), value, key)
})

test('the Unified HUD: its buttons from the list only, its icons from theirs', () => {
  const u = normalise('unified', { widgets: ['party', 'nope', 'cc', 'party'], kinaIcon: 'nope', apIcon: 'word' })
  assert.deepEqual(u.widgets, ['party', 'cc'])
  assert.equal(u.kinaIcon, SETTINGS_DEFAULTS.unified.kinaIcon)
  assert.equal(u.apIcon, 'word')
})

test('Spanish, gone, reads as English', () => {
  assert.equal(normalise('language', 'es'), 'en')
  assert.equal(normalise('language', 'fr'), 'fr')
})
