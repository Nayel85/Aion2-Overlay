import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PvpHistory } from '../src/main/pvpHistory.ts'
import { detailGroupAt, detailTiles } from '../src/shared/gameMap.ts'
import { pvpSummary, type PvpKill } from '../src/shared/tracker.ts'

const seen: PvpKill = { at: 1, mine: false, died: false, legion: false, killer: { name: 'A', server: 1, guild: null }, victim: null }

test('the PvP journal migrates existing kills and retains the newest in order across compaction', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pvp-history-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'pvp.jsonl')
  const legacy = join(dir, 'pvp.json')
  const errors: unknown[] = []
  const open = () => new PvpHistory(path, legacy, (err) => errors.push(err), 4)
  const initial = [{ ...seen, died: true, place: { world: 1, position: [10, 20] } }, ...[2, 3, 4].map((at) => ({ ...seen, at }))]
  await writeFile(legacy, JSON.stringify(initial.map(({ legion: _legion, ...kill }) => kill)))
  const history = open()
  assert.deepEqual(history.all(), initial)
  await history.flush()
  let records = 4
  for (const kill of [{ ...seen, at: 5, mine: true }, { ...seen, at: 6, fight: 'assist' }, { ...seen, at: 7, died: true }, { ...seen, at: 8 }, { ...seen, at: 9 }]) {
    history.add(kill)
    assert.deepEqual(history.summary(), pvpSummary(history.all()))
    await history.flush()
    records = records === 8 ? 4 : records + 1
    assert.equal((await readFile(path, 'utf8')).trimEnd().split('\n').length, records)
    assert.deepEqual(open().all(), history.all())
  }
  assert.deepEqual(history.all().map((k) => k.at), [6, 7, 8, 9])
  assert.deepEqual(errors, [])
})

test('the PvP journal orders Clear and new kills behind an in-flight save', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pvp-clear-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'pvp.jsonl')
  const legacy = join(dir, 'pvp.json')
  const errors: unknown[] = []
  const open = () => new PvpHistory(path, legacy, (err) => errors.push(err), 4)
  await writeFile(legacy, JSON.stringify([seen]))
  const history = open()
  const writing = history.flush()
  history.clear()
  history.add({ ...seen, at: 2 })
  assert.equal(history.flush(), writing)
  await writing
  assert.deepEqual(open().all().map((k) => k.at), [2])
  history.clear()
  await history.flush()
  assert.deepEqual(open().all(), [])
  assert.deepEqual(errors, [])
})

test('the PvP journal recovers completed records after an interrupted append', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pvp-recovery-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'pvp.jsonl')
  const legacy = join(dir, 'pvp.json')
  const errors: unknown[] = []
  const open = () => new PvpHistory(path, legacy, (err) => errors.push(err), 4)
  await writeFile(path, JSON.stringify(seen) + '\n{"at":')
  const history = open()
  assert.deepEqual(history.all(), [seen])
  history.add({ ...seen, at: 2 })
  await history.flush()
  assert.deepEqual(open().all().map((k) => k.at), [1, 2])
  assert.deepEqual(errors, [])
})

test('the PvP journal retries a failed save from the current history', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pvp-retry-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const storage = join(dir, 'storage')
  const path = join(storage, 'pvp.jsonl')
  const legacy = join(storage, 'pvp.json')
  const errors: unknown[] = []
  const open = () => new PvpHistory(path, legacy, (err) => errors.push(err), 4)
  const history = open()
  history.add(seen)
  await history.flush()
  assert.equal(errors.length, 1)
  await mkdir(storage)
  history.add({ ...seen, at: 2 })
  await history.flush()
  assert.deepEqual(open().all().map((k) => k.at), [1, 2])
  assert.equal(errors.length, 1)
})

test('detail requests follow the viewport across seams and clip to rectangular maps', () => {
  assert.equal(detailGroupAt(0.2499, 8), 0)
  assert.equal(detailGroupAt(0.25, 8), 2)
  assert.equal(detailGroupAt(0.251, 8, 0), 0)
  assert.equal(detailGroupAt(0.30, 8, 0), 2)
  assert.equal(detailGroupAt(-0.2, 8), 0)
  assert.equal(detailGroupAt(1.1, 5), 4)
  assert.equal(detailTiles(8, 8, 2, 4).length, 16)
  assert.deepEqual(detailTiles(5, 3, 4, 2), [[3, 1], [4, 1], [3, 2], [4, 2]])
})
