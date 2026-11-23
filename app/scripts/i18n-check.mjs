// Lists the text wrapped in t(), plural() or tr(), or given to the components that translate their
// own (SettingRow, Section, PageHeader, option lists), that has no French in src/shared/i18n.fr.ts;
// and the French lines whose English is nowhere in the code any more (short ones may be the game's
// words looked up as they come, a stat's name: only listed). `npm run i18n:check`
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const fr = readFileSync(join(root, 'shared/i18n.fr.ts'), 'utf8')
const keys = new Set()
for (const m of fr.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"):/gm)) keys.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(vue|ts)$/.test(name) && !name.startsWith('i18n')) files.push(p)
  }
}
walk(root)

const missing = new Map()
const sources = []
const plurals = /\bplural\([^,]+,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  sources.push(src)
  const found = []
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) found.push(m[1] ?? m[2])
  for (const m of src.matchAll(plurals)) found.push(m[1] ?? m[2], m[3] ?? m[4])
  // What's new: each changelog line is shown translated.
  if (f.endsWith('changelog.ts')) for (const m of src.matchAll(/^\s+'((?:[^'\\]|\\.)*)',$/gm)) found.push(m[1])
  // Text the shared components translate themselves: SettingRow's label, hint and warning,
  // Section's and PageHeader's title and about, and option lists' labels.
  if (f.endsWith('.vue')) {
    for (const m of src.matchAll(/\s(?:label|hint|warning|about)="([^"]+)"/g)) found.push(m[1])
    for (const m of src.matchAll(/<(?:Section|PageHeader)\b[^>]*?\stitle="([^"]+)"/g)) found.push(m[1])
    for (const m of src.matchAll(/\b(?:label|hint|about|name|where|title):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) found.push(m[1] ?? m[2])
  }
  for (const raw of found) {
    const text = raw.replace(/\\(.)/g, '$1')
    if (!keys.has(text)) missing.set(text, f.replace(root, ''))
  }
}
const all = sources.join('\n')
const unused = [...keys].filter((k) => ![k, k.replace(/'/g, "\\'"), k.replace(/"/g, '\\"')].some((form) => all.includes(form)) && k.split(' ').length > 4)
for (const [text, file] of missing) console.log(`${file}: ${text}`)
for (const text of unused) console.log(`unused: ${text}`)
console.log(missing.size ? `${missing.size} without French` : 'All text has French.')
if (unused.length) console.log(`${unused.length} French lines no longer used`)
process.exit(missing.size || unused.length ? 1 : 0)
