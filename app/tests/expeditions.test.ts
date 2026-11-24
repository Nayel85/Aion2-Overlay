import assert from 'node:assert/strict'
import test from 'node:test'
import { expeditionCell, shownExpeditions } from '../src/shared/expeditions.ts'

test("an expedition's cubes of its guaranteed chest, by mode, as the game shows them", () => {
  // Nayel's login on 2026-11-24 (12 57): Fire Temple Conquest 4 of 28 in game; Draupnir Conquest 3 of 14 on another.
  const cubes = { 600021: 0, 600022: 4, 600032: 3, 600072: 21 }
  assert.deepEqual(expeditionCell(cubes, 'Fire Temple', 'conquest'), { cubes: 4, ceiling: 28, left: 24 })
  assert.deepEqual(expeditionCell(cubes, 'Fire Temple', 'exploration'), { cubes: 0, ceiling: 1, left: 1 })
  assert.deepEqual(expeditionCell(cubes, 'Fire Temple', 'advanced'), { cubes: null, ceiling: 28, left: null })
  assert.equal(expeditionCell(cubes, 'Draupnir', 'conquest')!.left, 11)
  assert.equal(expeditionCell(cubes, 'Vakron Sky Island', 'conquest')!.left, 0)
  // The six open ones, in the game's order, and one a later update brings once a character has it.
  assert.deepEqual(shownExpeditions({}), ['Krao Cave', 'Urugugu Canyon', 'Fire Temple', 'Draupnir', 'Vakron Sky Island', 'Ferocious Horn Den'])
  assert.equal(shownExpeditions({ a: { name: 'A', at: 0, cubes: { 600122: 2 } } }).at(-1), 'Cradle of Nihility')
})
