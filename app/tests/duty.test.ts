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

test('a reward left out counts for nothing, whatever its price; a kind at 0 too, even on the market', () => {
  const seen = [board([1]), board([1]), board([1])]
  const s = state(board([50_000, 40_000]), seen)
  const prices = { [KINA]: { minPrice: 9, median7d: 9, listings: 1, at: 0 } }
  // Kina at its market price (9 a Kina), and as your worth (1) when the market is not asked.
  assert.equal(dutyAdvice(s, values, { prices })!.takeAll, 90_000 * 9)
  assert.equal(dutyAdvice(s, values)!.takeAll, 90_000)
  assert.equal(dutyAdvice(s, values, { prices, excluded: [KINA] })!.takeAll, 0)
  assert.equal(dutyAdvice(s, { ...values, kina: 0 }, { prices })!.takeAll, 0)
})
