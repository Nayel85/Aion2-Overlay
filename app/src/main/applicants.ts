// Join requests to your party (shared/applicants.ts): the engine's `applicant` events add one, a
// join or a cancelled request (`applicantGone`) takes one out, and a while after the last
// application (the setting) the list is cleared and the widget goes away. Your answer to one comes
// with no name in it (`applicantAnswered`): an accept's join follows at once, so with none a moment
// later it was a reject, of the one the game showed, the oldest.
import { broadcast } from './broadcast.ts'
import { settings } from './settings.ts'
import { log, tracker } from './tracker.ts'
import { createApplicants } from './windows.ts'
import { NO_APPLICANTS, type Applicant, type Applicants } from '../shared/applicants.ts'

let state: Applicants = NO_APPLICANTS
let timer: NodeJS.Timeout | null = null
/** How long an accept's join may come after the answer (the same message in the 2026-11-27 log). */
const JOIN_AFTER_MS = 1500

function changed(): void {
  broadcast('applicants:changed', state)
}

function rearm(): void {
  if (timer) clearTimeout(timer)
  const seconds = settings.get('applicants').hideAfter
  timer = setTimeout(() => applicantStore.clear(), seconds * 1000)
}

export const applicantStore = {
  all: (): Applicants => state,
  clear(): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (!state.list.length) return
    state = { list: [], lastAt: state.lastAt }
    changed()
  },
  dismiss(character: number): void {
    if (!state.list.some((a) => a.character === character)) return
    state = { ...state, list: state.list.filter((a) => a.character !== character) }
    if (!state.list.length && timer) {
      clearTimeout(timer)
      timer = null
    }
    changed()
  },
}

export function startApplicants(): void {
  tracker.onEvent('applicant', (ev) => {
    if (!settings.get('applicants').enabled) return
    const at = Date.now()
    const a: Applicant = {
      character: ev.character,
      name: ev.name,
      server: ev.server ?? null,
      className: ev.className ?? null,
      level: ev.level ?? null,
      gearScore: ev.gearScore ?? null,
      combatPower: ev.combatPower ?? null,
      at,
    }
    // Applying again keeps their place and shows the numbers as they are now.
    const had = state.list.some((x) => x.character === a.character)
    const list = had ? state.list.map((x) => (x.character === a.character ? { ...a, at: x.at } : x)) : [...state.list, a]
    state = { list, lastAt: at }
    if (!had) log(`applicant: ${a.name} (${a.className ?? '?'}, CP ${a.combatPower ?? '?'}, GS ${a.gearScore ?? '?'})`)
    // The widget's window should be there already; if it was never opened (or was lost), this opens it.
    createApplicants()
    rearm()
    changed()
  })
  let answered: NodeJS.Timeout | null = null
  tracker.onEvent('applicantGone', (ev) => {
    // The answer was an accept: this one joined.
    if (answered) clearTimeout(answered)
    answered = null
    applicantStore.dismiss(ev.character)
  })
  tracker.onEvent('applicantAnswered', () => {
    if (answered) clearTimeout(answered)
    answered = setTimeout(() => {
      answered = null
      const first = state.list[0]
      if (!first) return
      log(`applicant: ${first.name} rejected`)
      applicantStore.dismiss(first.character)
    }, JOIN_AFTER_MS)
  })
}
