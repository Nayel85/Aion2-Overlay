// What normalise() makes of many inputs for every setting: empty, the defaults, wrong types, out of
// range, flipped, a word of each list. Sorted keys, to compare with tests/settings.snapshot.json
// (settings.test.ts); `npm run settings:snapshot` writes it again after a change meant to be.
import { normalise, SETTINGS_DEFAULTS, type SettingKey } from '../src/shared/settings.ts'

const WORDS = ['pinned', 'list', 'always', 'strip', 'players', 'meter', 'ring', 'gauges', 'pill', 'compact', 'bold', 'flat', 'under', 'column', 'hidden', 'fr', 'en', 'es', 'europe', 'na-west', '#ff0000', '', 'game', 'word', 'icon', 'drawn']

function variants(d: unknown): unknown[] {
  const out: unknown[] = [undefined, null, {}, 'x', 3, d]
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const junk: Record<string, unknown> = {}
    const big: Record<string, unknown> = {}
    const small: Record<string, unknown> = {}
    const flip: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) {
      junk[k] = typeof v === 'string' ? 7 : 'x'
      big[k] = typeof v === 'number' ? 1e9 : v
      small[k] = typeof v === 'number' ? -1e9 : v
      flip[k] = typeof v === 'boolean' ? !v : typeof v === 'number' ? v + 0.4 : v
    }
    out.push(junk, big, small, flip)
    for (const w of WORDS) out.push(Object.fromEntries(Object.keys(d).map((k) => [k, w])))
    out.push(Object.fromEntries(Object.keys(d).map((k) => [k, { x: 10.6, y: -3.2, width: 100, height: 90 }])))
    out.push(Object.fromEntries(Object.keys(d).map((k) => [k, [1, 2, 2, 'a', 'b-c', 'party', 'cc']])))
  } else {
    out.push(true, false, 1e9, ...WORDS)
  }
  return out
}

const sort = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
      : v

export function settingsSnapshot(): Record<string, unknown[]> {
  const all: Record<string, unknown[]> = {}
  for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingKey[]) all[key] = variants(SETTINGS_DEFAULTS[key]).map((v) => sort(normalise(key, v)))
  return all
}
