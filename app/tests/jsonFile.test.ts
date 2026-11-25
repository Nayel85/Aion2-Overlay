import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { flushJsonFiles, jsonFile } from '../src/main/jsonFile.ts'

const dir = (): string => mkdtempSync(join(tmpdir(), 'nayel-json-'))

test('a data file reads what it holds, or null when none or unreadable', () => {
  const d = dir()
  assert.equal(jsonFile(join(d, 'none.json')).read(), null)
  writeFileSync(join(d, 'bad.json'), '{"cut sh')
  assert.equal(jsonFile(join(d, 'bad.json')).read(), null)
  writeFileSync(join(d, 'ok.json'), '{"a":1}')
  assert.deepEqual(jsonFile(join(d, 'ok.json')).read(), { a: 1 })
})

test('a save writes the value as it is then, safely (no file left beside it)', () => {
  const d = dir()
  const f = jsonFile(join(d, 'now.json'))
  let value = { n: 1 }
  f.save(() => value)
  assert.deepEqual(JSON.parse(readFileSync(f.path, 'utf8')), { n: 1 })
  value = { n: 2 }
  f.save(() => value)
  assert.deepEqual(f.read(), { n: 2 })
  assert.equal(existsSync(`${f.path}.tmp`), false)
})

test('a delayed save writes once after a burst, and the quitting app writes what is pending', () => {
  const d = dir()
  const f = jsonFile(join(d, 'later.json'), 60_000)
  let n = 0
  for (let i = 0; i < 5; i++) {
    n = i
    f.save(() => ({ n }))
  }
  assert.equal(f.read(), null, 'not written yet')
  flushJsonFiles()
  assert.deepEqual(f.read(), { n: 4 })
  // Nothing pending: a second flush writes nothing new.
  writeFileSync(f.path, '{"n":"by hand"}')
  flushJsonFiles()
  assert.deepEqual(f.read(), { n: 'by hand' })
})

test('a write that fails leaves the last good file and says so', () => {
  const d = dir()
  const errors: unknown[] = []
  const f = jsonFile(join(d, 'keep.json'), 0, (e) => errors.push(e))
  f.save(() => ({ good: true }))
  const cyclic: Record<string, unknown> = {}
  cyclic['self'] = cyclic
  f.save(() => cyclic)
  assert.equal(errors.length, 1)
  assert.deepEqual(f.read(), { good: true })
})
