import assert from 'node:assert/strict'
import test from 'node:test'
import { BOSS_RUNS, bossOfNpc } from '../src/shared/bossRuns.ts'

test("the field bosses' monster codes, one table (fieldBossNpcs.json) both ways", () => {
  assert.equal(BOSS_RUNS.length, 24)
  assert.ok(BOSS_RUNS.every((r) => r.npc > 0))
  assert.equal(BOSS_RUNS.find((r) => r.short === 'Neikel')!.npc, 2100003)
  // Verteron's, Altgard's (111001 on), the Abyss's.
  assert.equal(bossOfNpc(2100003), 101001)
  assert.equal(bossOfNpc(2400017), 111001)
  assert.equal(bossOfNpc(2400855), 111024)
  assert.equal(bossOfNpc(2600068), 2001)
  assert.equal(bossOfNpc(1), null)
})
