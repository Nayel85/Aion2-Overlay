import assert from 'node:assert/strict'
import test from 'node:test'
import { craftOutcome, gatherFlow, gatherOutcome, GIVEN_UP_MS, type CraftOver, type GatheringOver, type GatheringStart } from '../src/shared/gatherFlow.ts'

/** A flow on a test clock: `tick(ms)` runs the timers due. */
function harness() {
  let clock = 1_000
  const timers: { at: number; f: () => void }[] = []
  const gathered: GatheringOver[] = []
  const crafted: CraftOver[] = []
  const flow = gatherFlow({
    gathered: (g) => gathered.push(g),
    crafted: (c) => crafted.push(c),
    plainOf: (template) => (template === 1500000 ? 610610013 : null),
    now: () => clock,
    later: (f, ms) => void timers.push({ at: clock + ms, f }),
  })
  const tick = (ms: number): void => {
    clock += ms
    for (const t of timers.filter((t) => t.at <= clock)) {
      timers.splice(timers.indexOf(t), 1)
      t.f()
    }
  }
  return { flow, gathered, crafted, tick }
}
const start = (template: number | null, outcome = 1, grade = 1): GatheringStart => ({ outcome, grade, doubled: false, skills: [], template })
const result = { item: 610610013, amount: 1, bonus: 0, result: 1 }

test("a gathering's outcome: 0 failed, 1 made, 7 ranked up, 6 a rank up that failed; a grade above 1 ranks up", () => {
  assert.equal(gatherOutcome(0, 1), 'fail')
  assert.equal(gatherOutcome(6, 2), 'fail')
  assert.equal(gatherOutcome(1, 1), 'ok')
  assert.equal(gatherOutcome(7, 2), 'rankUp')
  assert.equal(gatherOutcome(1, 2), 'rankUp')
})

test("a craft's outcome: without 1 it failed; 13 procs", () => {
  assert.deepEqual(craftOutcome(0), { made: false, proc: false })
  assert.deepEqual(craftOutcome(1), { made: true, proc: false })
  assert.deepEqual(craftOutcome(13), { made: true, proc: true })
  assert.deepEqual(craftOutcome(12), { made: false, proc: false })
})

test('a gathering done: its start and its result, once', () => {
  const { flow, gathered, tick } = harness()
  flow.gatherStart(start(1500000))
  flow.gatherEnd()
  assert.equal(flow.gather(result, 610610013)?.template, 1500000)
  tick(GIVEN_UP_MS)
  assert.equal(gathered.length, 1)
  assert.deepEqual(gathered[0]!.result, result)
  assert.equal(gathered[0]!.start?.template, 1500000)
})

test('a gathering given up: over with no result for 1.5 s, the spot’s plain item', () => {
  const { flow, gathered, tick } = harness()
  flow.gatherStart(start(1500000, 0))
  flow.gatherEnd()
  tick(GIVEN_UP_MS - 1)
  assert.equal(gathered.length, 0)
  tick(1)
  assert.equal(gathered.length, 1)
  assert.equal(gathered[0]!.result, null)
  assert.equal(gathered[0]!.plain, 610610013)
})

test('the next gathering starting within the 1.5 s leaves the one before alone, and is counted itself', () => {
  const { flow, gathered, tick } = harness()
  flow.gatherStart(start(1500000))
  flow.gatherEnd()
  tick(500)
  flow.gatherStart(start(1500012))
  tick(GIVEN_UP_MS)
  assert.equal(gathered.length, 0)
  flow.gather(result, 610610013)
  assert.equal(gathered.length, 1)
  assert.equal(gathered[0]!.start?.template, 1500012)
})

test('a result with no start seen (begun before the app) is told with no start', () => {
  const { flow, gathered } = harness()
  assert.equal(flow.gather(result, 610610013), null)
  assert.equal(gathered[0]!.start, null)
})

test('a failed craft is told as it ends; a made one with its item; a proc as such', () => {
  const { flow, crafted } = harness()
  flow.craftStart(314016001, 0)
  flow.craftDone(314016001)
  flow.craftStart(314016001, 1)
  flow.craftDone(314016001)
  flow.craftResult(314016001, 530116001)
  flow.craftStart(314016001, 13)
  flow.craftDone(314016001)
  flow.craftResult(314016001, 530116001)
  assert.deepEqual(crafted.map((c) => [c.failed, c.proc, c.item]), [[true, false, null], [false, false, 530116001], [false, true, 530116001]])
})

test("another recipe's result, or one with no start, is not this craft's", () => {
  const { flow, crafted } = harness()
  flow.craftResult(314016001, 530116001)
  flow.craftStart(314016001, 1)
  flow.craftResult(314016002, 510116005)
  assert.equal(crafted.length, 0)
})
