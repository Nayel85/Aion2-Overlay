// Your party (shared/party.ts): the engine's `party` events say who is in it, its `partyVitals` each
// member's HP about once a second, its `partyDebuffs` what monsters put on them. Sent to the party frames as they change (the vitals at most
// twice a second, all members together).
import { broadcast } from './broadcast.ts'
import { settings } from './settings.ts'
import { tracker } from './tracker.ts'
import { createParty } from './windows.ts'
import { NO_PARTY, type Party } from '../shared/party.ts'

const SEND_EVERY_MS = 500
let state: Party = NO_PARTY
let timer: NodeJS.Timeout | null = null

function changed(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    broadcast('party:changed', state)
  }, SEND_EVERY_MS)
}

export const partyStore = {
  all: (): Party => state,
}

export function startParty(): void {
  tracker.onEvent('party', (ev) => {
    const members = ev.members ?? []
    // The vitals of those still in it.
    const keep = new Set(members.map((m) => m.entity).filter((e): e is number => e !== null))
    state = { ...state, members, vitals: Object.fromEntries(Object.entries(state.vitals).filter(([e]) => keep.has(Number(e)))) }
    // Its frames' window should be there; if it was never opened (or was lost), this opens it.
    if (members.length && settings.get('party').enabled) createParty()
    changed()
  })
  tracker.onEvent('partyDebuffs', (ev) => {
    state = { ...state, debuffs: ev.debuffs ?? {} }
    changed()
  })
  tracker.onEvent('bossTarget', (ev) => {
    // null: the boss let go of everyone (or died).
    state = { ...state, bossTarget: ev.target === null ? null : { entity: ev.target, at: Date.now() } }
    changed()
  })
  tracker.onEvent('partyVitals', (ev) => {
    const entity = ev.entity
    state = {
      ...state,
      vitals: { ...state.vitals, [entity]: { hp: ev.hp, maxHp: ev.maxHp, flight: ev.flight, maxFlight: ev.maxFlight, at: Date.now() } },
    }
    changed()
  })
}
