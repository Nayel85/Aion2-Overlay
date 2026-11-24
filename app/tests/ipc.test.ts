import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../src/shared/ipc.ts'

/** The channels an interface of shared/ipc.ts declares: its `'name:thing':` keys. */
function declared(name: string): string[] {
  const src = readFileSync(new URL('../src/shared/ipc.ts', import.meta.url), 'utf8')
  const start = src.indexOf(`export interface ${name} {`)
  const body = src.slice(start, src.indexOf('\n}', start))
  return [...body.matchAll(/^\s+'([\w:]+)':/gm)].map((m) => m[1]!)
}

test('every channel declared is allowed by the bridge (one missing throws in the window that uses it)', () => {
  const invoke = declared('InvokeChannels')
  const events = declared('EventChannels')
  assert.ok(invoke.length > 50 && events.length > 20)
  assert.deepEqual(invoke.filter((c) => !INVOKE_CHANNELS.includes(c as never)), [], 'invoke channels not allowed')
  assert.deepEqual(events.filter((c) => !EVENT_CHANNELS.includes(c as never)), [], 'event channels not allowed')
})

test('the bridge allows no channel the contract does not declare', () => {
  const invoke = new Set(declared('InvokeChannels'))
  const events = new Set(declared('EventChannels'))
  assert.deepEqual(INVOKE_CHANNELS.filter((c) => !invoke.has(c)), [])
  assert.deepEqual(EVENT_CHANNELS.filter((c) => !events.has(c)), [])
})
