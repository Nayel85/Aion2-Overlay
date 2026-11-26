/**
 * The duty board (the engine's `dutyBoard`, `1C 8D`), the account's (the same for all its characters,
 * 5 missions a day between them): the missions taken and the 15 offered, each
 * with its 5 rewards (each drawn on its own, at its chance), how many times it was rerolled today
 * and when it is replaced. What each reward is worth to you (settings.duty: Kina, gold crafting
 * materials, Theostones...) ranks the missions. The advice weighs every way to play the board: take
 * its best few now (none to all your free slots), then reroll for the rest or not, each reroll at its
 * cost, a new board worth what the boards seen were (each played the same way in turn, as far as the
 * rerolls' costs are known). The best way is the advice: these to take, then a reroll or not.
 */
import { goldKind, itemInfo } from './sessions.ts'
import { ITEMS } from './items.ts'
import type { DutyCategory, DutyValues } from './dutyValues.ts'

export { DEFAULT_DUTY_VALUES, DUTY_CATEGORIES, type DutyCategory, type DutyValues } from './dutyValues.ts'

export interface DutyReward {
  item: number
  amount: number
  /** 0 to 1. */
  chance: number
}
export interface DutyMission {
  quest: number
  /** Its place once taken; 0 while offered. */
  place: number
  rewards: DutyReward[]
}
export interface DutyBoard {
  /** When it was read. */
  at: number
  /** Rerolls bought today. */
  rerolls: number
  /** When the game replaces it (the daily reset), ms; null when not read. */
  expires: number | null
  missions: DutyMission[]
}
export interface DutyState {
  /** The board going on (today's, read as you opened it or rerolled it). */
  board: DutyBoard | null
  /** Every board seen, the oldest first: what a new one is worth, on average. */
  history: DutyBoard[]
  /** What the nth reroll of a day costs, in Kina: learned from the balance as you reroll. */
  rerollCosts: Record<number, number>
}
export const NO_DUTY: DutyState = { board: null, history: [], rerollCosts: {} }

/** Missions the account can take a day, all its characters together. */
export const DUTY_SLOTS = 5
/** The rerolls' costs as the owner paid them (2026-11-24), until learned. */
export const KNOWN_REROLL_COSTS: Record<number, number> = { 1: 1000, 2: 2500, 3: 6000 }
/** Boards seen before a new one's worth is told. */
const BOARDS_FOR_AVERAGE = 3

const KINA_NAME = /^Kina\b/
/** A reward's category, or null: not one of them (Enhance Stones, Soul Crystals, lesser gear...). */
export function dutyCategory(item: number): DutyCategory | null {
  const info = itemInfo(item)
  if (!info) return null
  // Its questlog sub-category: getgodstone, addcontentsticketcount, gatherresource...
  const sub = ITEMS[item]?.[3]
  if (KINA_NAME.test(info.name)) return 'kina'
  if (sub === 'getgodstone' || info.name.startsWith('Theostone')) return 'theostone'
  if (info.name.startsWith('Key: Hidden Cube')) return 'cubeKey'
  if (info.name.startsWith('Shugo Festival Reward Key')) return 'shugoKey'
  // The same sub-category, the tickets and Odyle Energy: told apart by name.
  if (sub === 'addcontentsticketcount') return /Odyle Energy/.test(info.name) ? 'odyle' : 'tickets'
  const gold = goldKind(item)
  if (gold === 'craft') return 'goldCraft'
  if (gold === 'equipment') return 'goldEquipment'
  if (sub === 'gatherresource' && info.grade === 31) return 'pureCraft'
  return null
}

/** A Small Odyle Energy is a quarter of an Odyle Energy. */
const SMALL_ODYLE = 0.25
/** How many of its category one of an item is: a Small Odyle Energy a quarter, any other one. */
const shareOf = (item: number): number => (/^Small Odyle Energy/.test(itemInfo(item)?.name ?? '') ? SMALL_ODYLE : 1)

/** A reward's worth on average: how many, at its chance, at what one is worth. */
export function rewardValue(r: DutyReward, values: DutyValues): number {
  const c = dutyCategory(r.item)
  return c ? r.amount * r.chance * values[c] * shareOf(r.item) : 0
}
export const missionValue = (m: DutyMission, values: DutyValues): number => m.rewards.reduce((n, r) => n + rewardValue(r, values), 0)

/** The offered missions, the best first: [quest, worth]. */
function ranked(board: DutyBoard, values: DutyValues): { quest: number; value: number }[] {
  return board.missions
    .filter((m) => m.place === 0)
    .map((m) => ({ quest: m.quest, value: missionValue(m, values) }))
    .sort((a, b) => b.value - a.value || a.quest - b.quest)
}
const best = (board: DutyBoard, values: DutyValues, n: number): number => ranked(board, values).slice(0, n).reduce((s, m) => s + m.value, 0)

export interface DutyAdvice {
  /** Slots still free (5 less those taken). */
  free: number
  /** The missions to take now, by quest: the best ones, as many as the best way takes. */
  picks: number[]
  /** What they are worth together. */
  value: number
  /** What a new board's best are worth, on average over those seen; null with too few seen. */
  newBoard: number | null
  /** The next reroll's cost, if known. */
  nextCost: number | null
  /** Reroll once these are taken (for the slots left); null when not told (too few boards seen, its cost unknown). */
  reroll: boolean | null
  /** The best way's worth in all, what comes after a reroll on average, the rerolls paid off; and taking all the free slots now instead. */
  expected: number
  takeAll: number
}

/**
 * What `slots` free slots are worth on a new board, `done` rerolls bought today, played the best way
 * (`play`), on average over the boards seen (each its missions' worths, the best first).
 */
function lookAhead(boards: number[][], cost: (n: number) => number | null): (slots: number, done: number) => number {
  const memo = new Map<string, number>()
  const ahead = (slots: number, done: number): number => {
    if (slots <= 0 || !boards.length) return 0
    const key = `${slots}:${done}`
    const known = memo.get(key)
    if (known !== undefined) return known
    const worth = boards.reduce((n, b) => n + play(b, slots, done, cost, ahead).worth, 0) / boards.length
    memo.set(key, worth)
    return worth
  }
  return ahead
}

/** A board's best way: how many of its best to take now, whether to reroll then, and what it is worth in all. */
function play(worths: number[], slots: number, done: number, cost: (n: number) => number | null, ahead: (slots: number, done: number) => number): { take: number; reroll: boolean; worth: number } {
  const next = cost(done + 1)
  let bestWay = { take: 0, reroll: false, worth: 0 }
  let took = 0
  // Only missions worth something are taken; none is worth taking to fill a slot.
  const takeable = Math.min(slots, worths.filter((v) => v > 0).length)
  for (let take = 0; take <= takeable; take++) {
    if (take > 0) took += worths[take - 1]!
    if (took > bestWay.worth || (take === 0 && bestWay.worth === 0)) bestWay = { take, reroll: false, worth: took }
    if (take < slots && next !== null) {
      const worth = took - next + ahead(slots - take, done + 1)
      if (worth > bestWay.worth) bestWay = { take, reroll: true, worth }
    }
  }
  return bestWay
}

/** The next reroll's cost: learned, else as the owner paid it, else unknown. */
export function nextRerollCost(board: DutyBoard, costs: Record<number, number>): number | null {
  const n = board.rerolls + 1
  return costs[n] ?? KNOWN_REROLL_COSTS[n] ?? null
}

export function dutyAdvice(state: DutyState, values: DutyValues): DutyAdvice | null {
  const board = state.board
  if (!board) return null
  const free = Math.max(0, DUTY_SLOTS - board.missions.filter((m) => m.place !== 0).length)
  const offered = ranked(board, values)
  const all = offered.slice(0, free).filter((m) => m.value > 0)
  const takeAll = all.reduce((n, m) => n + m.value, 0)
  // A new board: the other boards seen (not this one).
  const others = state.history.filter((b) => sameBoard(b, board) === false)
  const newBoard = free && others.length >= BOARDS_FOR_AVERAGE ? others.reduce((n, b) => n + best(b, values, free), 0) / others.length : null
  const nextCost = nextRerollCost(board, state.rerollCosts)
  if (!free || newBoard === null || nextCost === null) return { free, picks: all.map((m) => m.quest), value: takeAll, newBoard, nextCost, reroll: null, expected: takeAll, takeAll }
  const cost = (n: number): number | null => state.rerollCosts[n] ?? KNOWN_REROLL_COSTS[n] ?? null
  const boards = others.map((b) => ranked(b, values).map((m) => m.value))
  const way = play(
    offered.map((m) => m.value),
    free,
    board.rerolls,
    cost,
    lookAhead(boards, cost),
  )
  const picks = offered.slice(0, way.take)
  return { free, picks: picks.map((m) => m.quest), value: picks.reduce((n, m) => n + m.value, 0), newBoard, nextCost, reroll: way.reroll, expected: way.worth, takeAll }
}

/** The same offer: the same missions with the same rewards (sent again as it opens, or as one is taken). */
export function sameBoard(a: DutyBoard, b: DutyBoard): boolean {
  const key = (x: DutyBoard): string =>
    x.missions
      .filter((m) => m.place === 0)
      .map((m) => `${m.quest}:${m.rewards.map((r) => `${r.item}x${r.amount}@${r.chance}`).join(',')}`)
      .sort()
      .join('|')
  return key(a) === key(b)
}
