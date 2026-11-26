import assert from 'node:assert/strict'
import test from 'node:test'
import { lastRefill, WEEKLY_RESET } from '../src/shared/characters.ts'
import { runsSince, type DungeonRun, type PlaySession } from '../src/shared/sessions.ts'

const run = (kind: string, start: number, end = start + 120_000): DungeonRun => ({ world: 500_043, name: 'Shugo', kind, start, end, ap: 0, kina: 1000, currencies: {} })
const session = (name: string, runs: DungeonRun[]): PlaySession => ({ name, server: 1305, start: runs[0]!.start, last: runs.at(-1)!.end!, runs } as PlaySession)

test("each character's Shugo Festival games since the weekly reset (Wednesday 07:00 UTC)", () => {
  const now = Date.UTC(2026, 10, 26, 12) // a Thursday
  const reset = lastRefill(WEEKLY_RESET, now)
  assert.equal(new Date(reset).toISOString(), '2026-11-25T07:00:00.000Z')
  const counts = runsSince(
    [session('Nayel', [run('shugo', reset - 3_600_000), run('shugo', reset + 60_000), run('daily', reset + 600_000), run('shugo', reset + 900_000)]), session('Nayoul', [run('shugo', reset + 30_000)])],
    'shugo',
    reset,
  )
  assert.deepEqual([...counts.values()].sort(), [1, 2])
})
