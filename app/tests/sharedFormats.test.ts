// Dates, times, clocks and counts are written by the shared formats alone (renderer/src/lib/format.ts for
// the language's: timeOfDay, shortDate, weekdayTime, countdown, amount...; shared/format.ts: compact,
// duration), never a local copy in a page: the same thing reads the same everywhere, and changes in one place.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const SRC = join(import.meta.dirname, '..', 'src')
const FORMATS = [join(SRC, 'renderer', 'src', 'lib', 'format.ts'), join(SRC, 'shared', 'format.ts')]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|vue)$/.test(f) ? [p] : []
  })
}

/** A date or time written by the language (Date's), a count grouped by it, a m:ss clock by hand. */
const LOCAL = [/toLocale(Date|Time)?String\(loc\(\)/, /new Date\([^)]*\)\.toLocale(Date|Time)?String\(/, /String\([^)]*% 60\)\.padStart\(2, '0'\)/]

test('dates, times, clocks and counts come from the shared formats', () => {
  const bad: string[] = []
  for (const f of files(join(SRC, 'renderer'))) {
    if (FORMATS.includes(f)) continue
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (LOCAL.some((re) => re.test(line))) bad.push(`${relative(SRC, f)}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
  }
  assert.deepEqual(bad, [], 'use renderer/src/lib/format.ts (or shared/format.ts), adding a format there if none fits')
})
