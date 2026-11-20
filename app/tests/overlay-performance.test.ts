import assert from 'node:assert/strict'
import test from 'node:test'
import { detailGroupAt, detailTiles } from '../src/shared/gameMap.ts'
import { appendPvpKill, PVP_LIMIT, pvpSummary, type PvpKill } from '../src/shared/tracker.ts'

test('the compact overlay state agrees with retained history across the kill limit', () => {
  const seen: PvpKill = { at: 1, mine: false, died: false, legion: false, killer: { name: 'A', server: 1, guild: null }, victim: null }
  const history = Array<PvpKill>(PVP_LIMIT).fill(seen)
  history[0] = { ...seen, died: true, place: { world: 1, position: [10, 20] } }
  const summary = pvpSummary(history)
  for (const kill of [{ ...seen, mine: true }, { ...seen, fight: 'assist' }, { ...seen, died: true }]) {
    appendPvpKill(history, summary, kill)
    assert.equal(history.length, PVP_LIMIT)
    assert.deepEqual(summary, pvpSummary(history))
  }
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
