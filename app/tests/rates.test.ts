import assert from 'node:assert/strict'
import test from 'node:test'
import { kinaBalance, kinaRebase, NO_KINA } from '../src/shared/kina.ts'
import { CORRIDORS, corridorReset, corridorStates } from '../src/shared/characters.ts'
import { pveInstance } from '../src/shared/sessions.ts'
import { setPlayerRegion } from '../src/shared/timers.ts'
import { allCrafts, craftSummaries, recipeStats } from '../src/shared/craftStats.ts'
import { RECIPES } from '../src/shared/recipes.ts'
import type { PlaySession } from '../src/shared/sessions.ts'

test('Kina per hour: a balance rise is earned; one not counted (a dungeon) only moves the balance', () => {
  let k = kinaBalance(NO_KINA, 1_000, 0)
  assert.equal(k.earned, 0)
  k = kinaBalance(k, 1_500, 10_000)
  assert.equal(k.earned, 500)
  k = kinaBalance(k, 601_500, 20_000, false)
  assert.equal(k.earned, 500)
  assert.equal(k.balance, 601_500)
  // Spending is not earning back.
  k = kinaBalance(k, 1_500, 30_000)
  k = kinaBalance(k, 2_000, 40_000)
  assert.equal(k.earned, 1_000)
  // Another character: its first balance is a start.
  assert.equal(kinaBalance(kinaRebase(k), 9_999_999, 50_000).earned, 1_000)
})

test('a dungeon is a PvE instance: the per hour leaves it out; the continents and the Abyss are not', () => {
  assert.equal(pveInstance(600022), true)
  assert.equal(pveInstance(1010), false)
  assert.equal(pveInstance(null), false)
})

test("a character's corridors since the last return: open (time given), done (none, the Abyss seen), unknown", () => {
  setPlayerRegion('europe')
  // Saturday 2026-11-28 22:00 Berlin: back at 21:00.
  const now = Date.UTC(2026, 10, 28, 21, 0)
  const since = corridorReset(now)
  assert.equal(new Date(since).toISOString(), '2026-11-28T20:00:00.000Z')
  const [a, b, c] = CORRIDORS.map((x) => x.id)
  // Never seen: likely to do.
  assert.deepEqual(corridorStates(undefined, now), ['unknown', 'unknown', 'unknown'])
  // In the Abyss since: one with its time is open, the others done.
  const seen = { abyssAt: since + 60_000, left: { [a!]: { ms: 130_000, at: since + 60_000 }, [b!]: { ms: 0, at: since + 60_000 }, [c!]: { ms: 0, at: since + 60_000 } } }
  assert.deepEqual(corridorStates(seen, now), ['open', 'done', 'done'])
  // What was said before the return does not count.
  const old = { abyssAt: since - 60_000, left: { [a!]: { ms: 0, at: since - 60_000 } } }
  assert.deepEqual(corridorStates(old, now), ['unknown', 'unknown', 'unknown'])
  setPlayerRegion('na-east')
})

test("crafts' stats: by character then all; a recipe's procs, fails and the game's chance", () => {
  const recipe = 314016001
  const chance = RECIPES[String(recipe)]![2]
  const sessions = [
    { name: 'Nayel', crafts: [
      { at: 1, recipe, proc: false, item: 530116001, count: 1 },
      { at: 2, recipe, proc: true, item: 530116001, count: 2 },
      { at: 3, recipe, proc: false, failed: true, item: 0, count: 0 },
    ] },
    { name: 'Nayoul', crafts: [{ at: 4, recipe, proc: false, item: 530116001, count: 1 }] },
  ] as unknown as PlaySession[]
  const all = allCrafts(sessions)
  const [first, second, total] = craftSummaries(all)
  assert.deepEqual([first!.name, first!.crafts, first!.procs, first!.fails], ['Nayel', 3, 1, 1])
  assert.equal(second!.name, 'Nayoul')
  assert.deepEqual([total!.name, total!.crafts, total!.procs], ['', 4, 1])
  assert.ok(Math.abs(total!.expected - 4 * chance) < 1e-9)
  const [r] = recipeStats(all)
  assert.deepEqual([r!.recipe, r!.crafts, r!.procs, r!.fails, r!.chance], [recipe, 4, 1, 1, chance])
})
