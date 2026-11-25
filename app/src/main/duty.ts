/**
 * The duty board (shared/duty.ts): today's, as the engine reads it as you open it, reroll it or take
 * a mission (`dutyBoard`); every board seen, for what a new one is worth; what each reroll cost, from
 * your Kina as you reroll. Kept in `<userData>/duty.json`, sent to the windows as it changes.
 *
 * The board sent as you log in is the day before's until you open it: one past its time is left out.
 */
import { dataFile } from './dataFile.ts'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { NO_DUTY, sameBoard, type DutyBoard, type DutyMission, type DutyState } from '../shared/duty.ts'

const SAVE_AFTER_MS = 2000
/** Boards kept to average over. */
const HISTORY_MAX = 500
/** A board with fewer offered missions is one being taken from: not a new offer. */
const FULL_OFFER = 10
/** A Kina spend this close to a reroll's board is its cost. */
const COST_WITHIN_MS = 5000
/** The balances read a moment after the board: they may come after it. */
const COST_AFTER_MS = 3000

let state: DutyState = NO_DUTY
const file = dataFile('duty.json', SAVE_AFTER_MS)
/** Kina and bound Kina as last seen, and what was spent lately (a reroll's cost). */
const balance: { kina: number | null; boundKina: number | null } = { kina: null, boundKina: null }
let spent: { at: number; amount: number }[] = []

function load(): void {
  const saved = file.read() as Partial<DutyState> | null
  state = saved ? { board: saved.board ?? null, history: saved.history ?? [], rerollCosts: saved.rerollCosts ?? {} } : NO_DUTY // none yet
}

function changed(): void {
  broadcast('duty:changed', state)
  file.save(() => state)
}

export const dutyStore = {
  get: (): DutyState => state,
}

/** A reroll's board: what was spent about then is its cost. */
function learnCost(board: DutyBoard): void {
  setTimeout(() => {
    const cost = spent.filter((s) => Math.abs(s.at - board.at) <= COST_WITHIN_MS).reduce((n, s) => n + s.amount, 0)
    if (cost <= 0) return log(`duty: reroll ${board.rerolls}'s cost not seen`)
    state = { ...state, rerollCosts: { ...state.rerollCosts, [board.rerolls]: cost } }
    log(`duty: reroll ${board.rerolls} cost ${cost} Kina`)
    changed()
  }, COST_AFTER_MS)
}

export function startDuty(): void {
  load()
  const onBalance = (which: 'kina' | 'boundKina') => (ev: Record<string, unknown>): void => {
    const now = ev['balance'] as number
    const before = balance[which]
    if (before !== null && now < before) spent = [...spent.filter((s) => Date.now() - s.at < COST_WITHIN_MS * 2), { at: Date.now(), amount: before - now }]
    balance[which] = now
  }
  tracker.onEvent('kina', onBalance('kina'))
  tracker.onEvent('boundKina', onBalance('boundKina'))
  // A mission taken: off the offer, into a slot, before the board comes again (if it does).
  tracker.onEvent('dutyTaken', (ev) => {
    const board = state.board
    const quest = ev['quest'] as number
    if (!board || !board.missions.some((m) => m.quest === quest && m.place === 0)) return
    state = { ...state, board: { ...board, missions: board.missions.map((m) => (m.quest === quest && m.place === 0 ? { ...m, place: ev['place'] as number } : m)) } }
    log(`duty: mission ${quest} taken`)
    changed()
  })
  tracker.onEvent('dutyBoard', (ev) => {
    const now = Date.now()
    const expires = (ev['expires'] as number | null) ?? null
    if (expires !== null && expires <= now) return log(`duty: a board past its time (${new Date(expires).toISOString()}) left out`)
    const missions = ((ev['missions'] as { quest: number; place: number; rewards: { item: number; amount: number; chance: number }[] }[] | undefined) ?? []).map(
      (m): DutyMission => ({ quest: m.quest, place: m.place, rewards: m.rewards.map((r) => ({ item: r.item, amount: r.amount, chance: r.chance / 100_000_000 })) }),
    )
    const board: DutyBoard = { at: now, rerolls: ev['rerolls'] as number, expires, missions }
    const before = state.board
    if (before && before.expires === expires && board.rerolls > before.rerolls) learnCost(board)
    const offered = missions.filter((m) => m.place === 0).length
    const known = state.history.slice(-50).some((b) => sameBoard(b, board))
    const history = offered >= FULL_OFFER && !known ? [...state.history, board].slice(-HISTORY_MAX) : state.history
    state = { ...state, board, history }
    log(`duty: board read, ${missions.length - offered} taken, ${offered} offered, ${board.rerolls} rerolls${known ? '' : ' (new)'}`)
    changed()
  })
}
