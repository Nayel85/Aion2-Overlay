// What normalise() makes of many inputs for every setting: empty, the defaults, wrong types, out of
// range, flipped. Written as JSON with sorted keys, to compare the validator before and after a change.
// `node --experimental-strip-types scripts/settings-snapshot.mjs out.json`
import { writeFileSync } from 'node:fs'

const { normalise, SETTINGS_DEFAULTS } = await import('../src/shared/settings.ts')

const WORDS = ['pinned', 'list', 'always', 'strip', 'players', 'meter', 'ring', 'gauges', 'pill', 'compact', 'bold', 'flat', 'under', 'column', 'hidden', 'fr', 'en', 'es', 'europe', 'na-west', '#ff0000', '']
function variants(d) {
  const out = [undefined, null, {}, 'x', 3, d]
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const junk = {}, big = {}, small = {}, flip = {}
    for (const [k, v] of Object.entries(d)) {
      junk[k] = typeof v === 'string' ? 7 : 'x'
      big[k] = typeof v === 'number' ? 1e9 : v
      small[k] = typeof v === 'number' ? -1e9 : v
      flip[k] = typeof v === 'boolean' ? !v : typeof v === 'number' ? v + 0.4 : v
    }
    out.push(junk, big, small, flip)
    for (const w of WORDS) out.push(Object.fromEntries(Object.keys(d).map((k) => [k, w])))
    out.push(Object.fromEntries(Object.keys(d).map((k) => [k, { x: 10.6, y: -3.2, width: 100, height: 90 }])))
    out.push(Object.fromEntries(Object.keys(d).map((k) => [k, [1, 2, 2, 'a', 'b-c']])))
  } else {
    out.push(true, false, 1e9, ...WORDS)
  }
  return out
}
const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v)
const all = {}
for (const key of Object.keys(SETTINGS_DEFAULTS)) all[key] = variants(SETTINGS_DEFAULTS[key]).map((v) => sort(normalise(key, v)))
writeFileSync(process.argv[2], JSON.stringify(all, null, 1))
console.log(Object.keys(all).length, 'settings')
