import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_DUTY_VALUES, dutyAdvice, type DutyBoard, type DutyState } from '../src/shared/duty.ts'

const KINA = 930100031
/** A board of 15 missions, offered, each worth its Kina (at a sure chance); `taken` more already taken. */
function board(worths: number[], rerolls = 0, taken = 0): DutyBoard {
  const offered = Array.from({ length: 15 }, (_, i) => ({ quest: 1000 + i, place: 0, rewards: worths[i] ? [{ item: KINA, amount: worths[i]!, chance: 1 }] : [] }))
  const took = Array.from({ length: taken }, (_, i) => ({ quest: 2000 + i, place: i + 1, rewards: [] }))
  return { at: 0, rerolls, expires: null, missions: [...took, ...offered] }
}
const state = (now: DutyBoard, seen: DutyBoard[]): DutyState => ({ board: now, history: seen, rerollCosts: { 1: 1000, 2: 2500, 3: 6000 } })
const values = DEFAULT_DUTY_VALUES

test('two great missions and nothing else: take them, then reroll for the three slots left', () => {
  const seen = [board([20_000, 20_000, 20_000, 20_000, 20_000]), board([20_000, 20_000, 20_000, 20_000, 20_000]), board([20_000, 20_000, 20_000, 20_000, 20_000])]
  const a = dutyAdvice(state(board([50_000, 40_000]), seen), values)!
  assert.deepEqual(a.picks, [1000, 1001])
  assert.equal(a.reroll, true)
  assert.equal(a.takeAll, 90_000)
  // 90,000 now, a reroll (1,000) for three at 20,000 each.
  assert.equal(a.expected, 90_000 - 1_000 + 60_000)
})

test('a board as good as any: take all five, no reroll', () => {
  const seen = [board([10_000, 10_000, 10_000, 10_000, 10_000]), board([12_000, 9_000, 9_000, 9_000, 9_000]), board([10_000, 10_000, 10_000, 10_000, 10_000])]
  const a = dutyAdvice(state(board([30_000, 30_000, 30_000, 30_000, 30_000]), seen), values)!
  assert.equal(a.picks.length, 5)
  assert.equal(a.reroll, false)
})

test('a poor board: reroll it all', () => {
  const seen = [board([30_000, 30_000, 30_000, 30_000, 30_000]), board([30_000, 30_000, 30_000, 30_000, 30_000]), board([30_000, 30_000, 30_000, 30_000, 30_000])]
  const a = dutyAdvice(state(board([100, 100, 100, 100, 100]), seen), values)!
  assert.deepEqual(a.picks, [])
  assert.equal(a.reroll, true)
})

test('the slots already taken left out, and no reroll whose cost is not known', () => {
  const seen = [board([30_000, 30_000, 30_000, 30_000, 30_000]), board([30_000, 30_000, 30_000, 30_000, 30_000]), board([30_000, 30_000, 30_000, 30_000, 30_000])]
  const a = dutyAdvice({ ...state(board([100, 100, 100, 100, 100], 3, 2), seen), rerollCosts: { 1: 1000, 2: 2500, 3: 6000 } }, values)!
  assert.equal(a.free, 3)
  // A fourth reroll's cost is not known: none advised, the three best taken.
  assert.equal(a.reroll, null)
  assert.equal(a.picks.length, 3)
})
