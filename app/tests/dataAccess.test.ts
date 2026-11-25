// The game's data (the generated tables: zones.ts, items.ts, recipes.ts... marked "do not edit", and the
// JSON tables in src/shared) is read through its shared modules alone: instances.ts for the instances,
// worlds.ts for the zones, gather.ts for the recipes and gatherables, sessions.ts, equipment.ts... (and
// renderer/src/lib's for the UI's own tables). The pages, components and main process call those, never
// the tables, so updating a table updates every place that shows it.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import test from 'node:test'

const SRC = join(import.meta.dirname, '..', 'src')
const SHARED = join(SRC, 'shared')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : files(p)) : /\.(ts|vue)$/.test(f) ? [p] : []
  })
}

/** The data tables: the generated modules (their header says "do not edit") and the JSON ones. */
const TABLES = readdirSync(SHARED).filter((f) => f.endsWith('.json') || (f.endsWith('.ts') && /do not edit/i.test(readFileSync(join(SHARED, f), 'utf8').slice(0, 600))))

/** Where the tables may be read: the shared modules, and the renderer's lib (its UI tables). */
const READERS = [SHARED + sep, join(SRC, 'renderer', 'src', 'lib') + sep]

test('the data tables are read through their shared modules alone', () => {
  assert.ok(TABLES.includes('zones.ts') && TABLES.includes('recipes.ts'), `tables found: ${TABLES.join(', ')}`)
  const bad: string[] = []
  for (const f of files(SRC)) {
    if (READERS.some((r) => f.startsWith(r))) continue
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const name = basename(m[1]!)
      if (!/^@shared\/|\/shared\//.test(m[1]!)) continue
      if (TABLES.some((t) => name === t || name === t.replace(/\.ts$/, ''))) bad.push(`${relative(SRC, f)} reads ${m[1]}`)
    }
  }
  assert.deepEqual(bad, [], 'read them through a shared module (instances.ts, worlds.ts, gather.ts...) instead')
})
