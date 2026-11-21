import assert from 'node:assert/strict'
import test from 'node:test'
import { attributeGains, riftFarms } from '../src/shared/abyss.ts'

test('each Abyss Points gain goes to the kill it follows; the rest is other', () => {
  const kills = [{ at: 1_000 }, { at: 20_000 }]
  const { byEvent, other } = attributeGains([[1_800, 300], [20_500, 250], [60_000, 100]], kills)
  assert.equal(byEvent.get(kills[0]!), 300)
  assert.equal(byEvent.get(kills[1]!), 250)
  assert.equal(other, 100)
})

test('a gain between two kills goes to the nearest one it follows', () => {
  const kills = [{ at: 0 }, { at: 4_000 }]
  const { byEvent } = attributeGains([[4_500, 300]], kills)
  assert.equal(byEvent.get(kills[1]!), 300)
  assert.equal(byEvent.get(kills[0]!), undefined)
})

test('a rift farm keeps its gains', () => {
  const farms = riftFarms([[Date.UTC(2026, 10, 14, 20, 5), 700, 'Ksix'], [Date.UTC(2026, 10, 14, 20, 10), 500, 'Ksix']])
  for (const f of farms) assert.equal(f.gains.reduce((n, g) => n + g[1], 0), f.points)
})
