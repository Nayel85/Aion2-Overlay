import assert from 'node:assert/strict'
import test from 'node:test'
import { expeditionRows } from '../src/shared/expeditions.ts'

test("an expedition's cubes of its guaranteed chest, by dungeon and mode, as the game shows them", () => {
  // Nayel's login on 2026-11-24 (12 57): Fire Temple Conquest 4 of 28 in game; Draupnir Conquest 3 of 14 on another.
  const rows = expeditionRows({ 600021: 0, 600022: 4, 600032: 3, 600072: 21 })
  const fire = rows.find((r) => r.name === 'Fire Temple')!
  assert.deepEqual(fire.modes.conquest, { world: 600022, cubes: 4, ceiling: 28, left: 24 })
  assert.deepEqual(fire.modes.exploration, { world: 600021, cubes: 0, ceiling: 1, left: 1 })
  assert.equal(rows.find((r) => r.name === 'Draupnir')!.modes.conquest!.left, 11)
  assert.equal(rows.find((r) => r.name === 'Vakron Sky Island')!.modes.conquest!.left, 0)
})
