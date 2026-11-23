/**
 * Play sessions (shared/sessions.ts): one per character's login. A login (its counters, sent as
 * you enter the world from the character selection) ends the session going on, keeps it in the
 * history, starts the new character's, and starts the Session page's souls, Kina and Abyss Points
 * again. Each Abyss Points gain goes to the session by where it came from (`apSource`); each rise
 * of the Kina balance adds to its Kina, and of the Enhance Stones' and Phantasmal Fragments' to
 * theirs. Each dungeon entered is a run (`dungeonOf`), with what it gave; a counter dropping as you
 * enter one (Nightmare, Ascension Trial, Daily Dungeon) says which kind it is.
 *
 * Kept across restarts in `<userData>/sessions.json` (the last HISTORY_MAX sessions): an app
 * restarted mid-game goes on with the session it had, unless nothing came in it for CONTINUE_MS
 * (another day's).
 */
import { app } from 'electron'
import { readFileSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { abyss } from './abyss.ts'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { RECIPES } from '../shared/recipes.ts'
import { BOSS_RUNS } from '../shared/bossRuns.ts'
import { AP_ITEM, apSource, dungeonOf, itemInfo, KINA_ITEM, kinaSource, NO_SESSIONS, notableLoot, noteGathering, QUEST_WITHIN_MS, questReward, RUN_COUNTERS, runIsNoise, type DungeonRun, type PlaySession, type RecentGain, type Sessions } from '../shared/sessions.ts'

const HISTORY_MAX = 200
const CONTINUE_MS = 6 * 3_600_000
const SAVE_AFTER_MS = 3000
/** A cube opened this soon after leaving a dungeon is that run's. */
const LOOT_AFTER_MS = 2 * 60_000
/** A counter's drop this long before entering a dungeon is that run's kind (you pay, then go in). */
const COUNTER_BEFORE_MS = 2 * 60_000
/** A field boss's chest opened this soon after it fell in view is that kill's. */
const BOSS_CHEST_MS = 30 * 60_000
/** A run opened this soon before a login (the zone comes first) goes with the new session. */
const RUN_CARRY_MS = 30_000

let sessions: Sessions = NO_SESSIONS
/** The character selection was shown (its list of characters): the next counters are a login. */
let selecting = false
let saveTimer: NodeJS.Timeout | null = null
/** Your last PvP kill or assist: the Abyss Points right after it are its. */
let pvpAt: number | null = null
/** The Kina balance last seen for the session's character: its rises are earned. */
let kinaSeen: number | null = null
/** The gains of the last few seconds: a quest's rewards, told just after, are taken from them. */
let recent: RecentGain[] = []
/** What each run's reward board (a Shugo Festival's chests) added to its loot, so a board sent again replaces it. */
const boardLoot = new WeakMap<DungeonRun, Record<string, number>>()
/** The last field boss that fell in view (its monster code) and when: its loot chest, opened soon after, says when it fell. */
let bossDown: { npc: number; at: number } | null = null
function noteGain(gain: RecentGain): void {
  recent = [...recent.filter((g) => gain.at - g.at <= QUEST_WITHIN_MS), gain]
}
/** The other currencies' balances last seen, by item id: their rises are earned. */
let currencySeen = new Map<number, number>()
/** The zone you were last in: a dungeon run starts and ends as it changes. */
let worldSeen: number | null = null
/** The run counters' last values, and the last one to drop (its kind, when): the next run's kind. */
const counterSeen = new Map<string, number>()
let counterDrop: { kind: string; at: number } | null = null

/** The dungeon run going on in the current session, if any. */
const openRun = (): DungeonRun | null => {
  const run = sessions.current?.runs?.at(-1)
  return run && run.end === null ? run : null
}
/** What a run earned: added to the one going on. */
function toRun(add: (run: DungeonRun) => void): void {
  const run = openRun()
  if (run) add(run)
}
/** A counter's total: its values together (Nightmare's are its entries and tickets). */
const total = (values: number[]): number => values.reduce((n, v) => n + v, 0)

const file = (): string => join(app.getPath('userData'), 'sessions.json')

function load(): void {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Sessions>
    sessions = { current: saved.current ?? null, history: Array.isArray(saved.history) ? saved.history : [] }
  } catch {
    sessions = NO_SESSIONS // none saved yet, or unreadable: start empty
  }
}

function changed(): void {
  broadcast('sessions:changed', sessions)
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    writeFile(file(), JSON.stringify(sessions), () => {})
  }, SAVE_AFTER_MS)
}

/** The session going on into the history (if it earned anything), and a new one for `name`. */
function begin(name: string, server: number | null, at: number): PlaySession {
  const old = sessions.current
  // The zone comes a moment before the login says who you are (entering the world, or the app
  // started as you went into a Shugo Festival's game): a run opened just now is the new session's.
  const open = old?.runs?.at(-1)
  const carried = open && open.end === null && at - open.start <= RUN_CARRY_MS ? open : null
  if (old && carried) old.runs = old.runs!.slice(0, -1)
  const kept = old && (old.ap > 0 || old.kina > 0 || (old.runs?.length ?? 0) > 0 || Object.keys(old.currencies ?? {}).length > 0 || (old.gathering?.done ?? 0) > 0)
  const history = kept ? [old, ...sessions.history].slice(0, HISTORY_MAX) : sessions.history
  if (old) closeRun(old, at)
  const current: PlaySession = { name, server, start: carried?.start ?? at, last: at, ap: 0, sources: {}, kina: 0, kinaSources: {}, currencies: {}, runs: carried ? [carried] : [] }
  sessions = { current, history }
  kinaSeen = null
  currencySeen = new Map()
  return current
}

/** A session's run going on, over at `at`; one left straight away with nothing is not kept. */
function closeRun(s: PlaySession, at: number): void {
  const run = s.runs?.at(-1)
  if (run && run.end === null) run.end = at
  if (run && runIsNoise(run)) s.runs = s.runs!.slice(0, -1)
}

/** The session `name` earns in: the current one if it is theirs and recent, else a new one. */
function sessionOf(name: string, server: number | null, at: number): PlaySession {
  const c = sessions.current
  if (c && c.name === name && (c.server === null || server === null || c.server === server) && at - c.last < CONTINUE_MS) return c
  log(`session: ${name}'s, from their first gain (no login seen)`)
  return begin(name, server, at)
}

export const sessionStore = {
  all: (): Sessions => sessions,
}

export function startSessions(): void {
  load()
  // The character selection: its list (empty as a dungeon's server takes you in or out).
  tracker.onEvent('characterList', (ev) => {
    if (((ev['characters'] as unknown[] | undefined) ?? []).length) selecting = true
  })
  // A login: the counters come as you enter the world from the character selection. They come too
  // as you go into an instance on its own server (Expeditions, Transcendences...) and back out, with
  // no selection (whose list comes once, the first time): the same character goes on with its session.
  tracker.onEvent('counters', (ev) => {
    const name = ev['name'] as string | null
    if (!name) return
    const at = (ev['ts'] as number | undefined) ?? Date.now()
    const server = (ev['server'] as number | null) ?? null
    const c = sessions.current
    if (!selecting && c && c.name === name && (c.server === null || server === null || c.server === server) && at - c.last < CONTINUE_MS) {
      const values = ev['values'] as Record<string, number[]>
      for (const id of Object.keys(RUN_COUNTERS)) if (values[id]) counterSeen.set(id, total(values[id]))
      log(`session: ${name} moved servers (an instance's), same session`)
      return
    }
    selecting = false
    begin(name, server, at)
    log(`session: ${name} logged in`)
    tracker.resetSession()
    const values = ev['values'] as Record<string, number[]>
    counterSeen.clear()
    counterDrop = null
    for (const id of Object.keys(RUN_COUNTERS)) if (values[id]) counterSeen.set(id, total(values[id]))
    changed()
  })
  // An entry paid (a Nightmare's, an Ascension Trial's, a Daily Dungeon's): the run's kind.
  tracker.onEvent('counter', (ev) => {
    const id = ev['id'] as string
    const kind = RUN_COUNTERS[id]
    if (!kind) return
    const now = total(ev['values'] as number[])
    const before = counterSeen.get(id)
    counterSeen.set(id, now)
    if (before === undefined || now >= before) return
    const run = openRun()
    if (run) run.kind = kind
    else counterDrop = { kind, at: Date.now() }
    log(`session: a ${kind} entered`)
    changed()
  })
  // Into a dungeon, or out of one: a run starts, or ends.
  tracker.onEvent('nearby', (ev) => {
    const world = (ev['world'] as number | null) ?? null
    if (world === null || world === worldSeen) return
    worldSeen = world
    const s = sessions.current
    if (!s) return
    const at = Date.now()
    closeRun(s, at)
    const dungeon = dungeonOf(world)
    if (dungeon) {
      const paid = counterDrop && at - counterDrop.at <= COUNTER_BEFORE_MS ? counterDrop.kind : null
      counterDrop = null
      s.runs = [...(s.runs ?? []), { world, name: dungeon[0], kind: paid ?? dungeon[1], start: at, end: null, ap: 0, kina: 0, currencies: {}, deaths: 0, partyDeaths: 0 }]
      log(`session: into ${dungeon[0]} (${paid ?? dungeon[1]})`)
    }
    changed()
  })
  // The game lets you in, and its last boss falls: the run's clear time. Let in again where the
  // last boss already fell (the party went again without leaving): a new run of the same dungeon.
  tracker.onEvent('dungeonStart', () => {
    let run = openRun()
    const s = sessions.current
    if (s && run && run.cleared !== undefined) {
      const at = Date.now()
      closeRun(s, at)
      const again: DungeonRun = { world: run.world, name: run.name, kind: run.kind, start: at, end: null, ap: 0, kina: 0, currencies: {}, deaths: 0, partyDeaths: 0 }
      s.runs = [...(s.runs ?? []), again]
      log(`session: ${run.name} again`)
      run = again
    }
    if (run && run.started === undefined) {
      run.started = Date.now()
      changed()
    }
  })
  // A player down: yours and the group's deaths in the run going on.
  tracker.onEvent('playerDied', (ev) => {
    const run = openRun()
    if (!run) return
    run.partyDeaths = (run.partyDeaths ?? 0) + 1
    if (ev['you'] === true) run.deaths = (run.deaths ?? 0) + 1
    log(`session: ${String(ev['name'] ?? 'a player')} died in ${run.name}`)
    changed()
  })
  tracker.onEvent('dungeonClear', () => {
    const run = openRun()
    if (run && run.cleared === undefined) {
      run.cleared = Date.now()
      log(`session: ${run.name} cleared`)
      changed()
    }
  })
  // A Nightmare: its boss as you enter, its level once cleared.
  tracker.onEvent('nightmare', (ev) => {
    const run = openRun()
    if (!run) return
    run.boss = ev['boss'] as number
    if (typeof ev['level'] === 'number') run.level = ev['level']
    changed()
  })
  // A cube opened: its Unique-or-better items and Arcana cards go to the run (the membership's
  // second cube comes in the same list). One opened just after leaving goes to the run just left.
  tracker.onEvent('loot', (ev) => {
    const loot = notableLoot((ev['items'] as { item: number; amount: number }[] | undefined) ?? [])
    const last = sessions.current?.runs?.at(-1)
    const run = openRun() ?? (last?.end && Date.now() - last.end < LOOT_AFTER_MS ? last : null)
    if (!run || !Object.keys(loot).length) return
    run.loot ??= {}
    for (const [id, n] of Object.entries(loot)) run.loot[id] = (run.loot[id] ?? 0) + n
    // Its source: how many cubes the list holds (2 with the membership's).
    const source = ev['source'] as number | undefined
    run.cubes = (run.cubes ?? 0) + (source === 1 || source === 2 ? source : 1)
    log(`session: ${run.name}'s cube gave ${JSON.stringify(loot)} (${run.cubes} cubes)`)
    changed()
  })
  // A field boss that fell in view: when it fell, for its loot chest opened after.
  tracker.onEvent('bossKilled', (ev) => {
    bossDown = { npc: ev['npc'] as number, at: Date.now() }
  })
  // A box opened from your bags. A field boss's loot chest ("Kashapa's Loot Chest"): what it gave is
  // that boss's run, done, in the history. Any other: what it gave goes to the run going on.
  tracker.onEvent('boxOpened', (ev) => {
    const s = sessions.current
    const items = (ev['items'] as { item: number; spent: boolean; amount: number }[] | undefined) ?? []
    const loot = notableLoot(items.filter((i) => !i.spent))
    const chest = items.filter((i) => i.spent).map((i) => itemInfo(i.item)?.name ?? '').map((name) => /^(.+)'s Loot Chest/.exec(name)?.[1]).find(Boolean)
    // A boss's chest is its run, whatever it gave (none worth keeping, or not read); another box only for what it gave.
    if (!s || (!chest && !Object.keys(loot).length)) return
    const at = Date.now()
    const run = openRun()
    if (chest) {
      // When it fell, if it fell in view not long before; else when its chest was opened.
      const killed = bossDown && BOSS_RUNS.find((r) => r.npc === bossDown!.npc)?.short === chest && at - bossDown.at < BOSS_CHEST_MS ? bossDown.at : at
      const done: DungeonRun = { world: 0, name: chest, kind: 'fieldboss', start: killed, end: at, cleared: killed, ap: 0, kina: 0, currencies: {}, loot }
      // Before the run going on, if any: that one stays the last.
      const runs = s.runs ?? []
      s.runs = run ? [...runs.slice(0, -1), done, run] : [...runs, done]
    } else if (run) {
      run.loot ??= {}
      for (const [id, n] of Object.entries(loot)) run.loot[id] = (run.loot[id] ?? 0) + n
    } else {
      log(`session: a box opened gave ${JSON.stringify(loot)}, no run`)
      return
    }
    s.last = at
    log(`session: ${chest ? `${chest}'s chest` : 'a box'} gave ${JSON.stringify(loot)} (all: ${JSON.stringify(items.map((i) => [i.item, i.spent, i.amount]))})`)
    changed()
  })
  // A duty mission handed in: which, and what it gave (the rewards drawn from its list).
  tracker.onEvent('dutyDone', (ev) => {
    const s = sessions.current
    if (!s) return
    const rewards: Record<string, number> = {}
    for (const r of (ev['rewards'] as { item: number; amount: number }[] | undefined) ?? []) rewards[r.item] = (rewards[r.item] ?? 0) + r.amount
    const at = Date.now()
    // Its Abyss Points (not in its list: the balance rose as it was handed in): the rewards', not
    // where you stood, nor a rift's.
    const ap = recent.filter((g) => g.kind === 'ap' && g.gained > 0 && at - g.at >= 0 && at - g.at <= QUEST_WITHIN_MS).map((g) => g.gained)
    for (const n of ap) questReward(s, recent, 'ap', n, at)
    const apTotal = ap.reduce((a, n) => a + n, 0)
    if (apTotal) {
      rewards[AP_ITEM] = (rewards[AP_ITEM] ?? 0) + apTotal
      abyss.notRift(at - QUEST_WITHIN_MS, at)
    }
    const offered = ((ev['offered'] as { item: number; amount: number; chance: number; got: boolean }[] | undefined) ?? []).map((r) => ({ ...r, chance: r.chance / 100_000_000 }))
    s.duties = [...(s.duties ?? []), { at, quest: ev['quest'] as number, rewards, offered }]
    s.last = at
    log(`session: duty mission ${String(ev['quest'])} gave ${JSON.stringify(rewards)}`)
    changed()
  })
  // A craft: as it starts the game says whether it will proc; once done, what it made (its count the
  // recipe's, shared/recipes.ts: a proc can be the item twice).
  let crafting: { recipe: number; proc: boolean } | null = null
  tracker.onEvent('craftStart', (ev) => {
    const code = ev['outcome'] as number
    crafting = { recipe: ev['recipe'] as number, proc: (code & 1) === 1 && (code & 12) !== 0 }
    // A failed one (its outcome without 1) makes nothing: recorded as it ends.
    if ((code & 1) === 0) failing = ev['recipe'] as number
  })
  let failing: number | null = null
  tracker.onEvent('craftDone', (ev) => {
    const s = sessions.current
    if (failing === null || failing !== ev['recipe']) return
    failing = null
    crafting = null
    if (!s) return
    const at = Date.now()
    s.crafts = [...(s.crafts ?? []), { at, recipe: ev['recipe'] as number, proc: false, failed: true, item: 0, count: 0 }]
    s.last = at
    changed()
  })
  tracker.onEvent('craftResult', (ev) => {
    const s = sessions.current
    const c = crafting
    crafting = null
    if (!s || !c || c.recipe !== ev['recipe']) return
    const at = Date.now()
    const r = RECIPES[String(c.recipe)]
    const count = (c.proc ? r?.[1]?.[1] : r?.[0][1]) ?? 1
    s.crafts = [...(s.crafts ?? []), { at, recipe: c.recipe, proc: c.proc, item: ev['item'] as number, count }]
    s.last = at
    changed()
  })
  // A supply request handed in: its rewards, the game's set ones. Its Abyss Points rose the balance
  // in the same breath, counted a moment later: then taken off where you stood (or a rift) as a reward.
  tracker.onEvent('supplyDone', (ev) => {
    const s = sessions.current
    if (!s) return
    const rewards: Record<string, number> = {}
    for (const r of (ev['rewards'] as { item: number; amount: number }[] | undefined) ?? []) rewards[r.item] = (rewards[r.item] ?? 0) + r.amount
    const at = Date.now()
    s.supplies = [...(s.supplies ?? []), { at, request: ev['request'] as number, rewards }]
    s.last = at
    log(`session: supply request ${String(ev['request'])} gave ${JSON.stringify(rewards)}`)
    changed()
    const ap = rewards[AP_ITEM] ?? 0
    const kina = rewards[KINA_ITEM] ?? 0
    if (ap || kina)
      setTimeout(() => {
        const now = Date.now()
        if (sessions.current !== s) return
        let moved = false
        if (ap && questReward(s, recent, 'ap', ap, now, 'supply')) {
          abyss.notRift(at - QUEST_WITHIN_MS, now)
          moved = true
        }
        if (kina && questReward(s, recent, 'kina', kina, now, 'supply')) moved = true
        if (moved) changed()
        else log(`session: supply request ${String(ev['request'])}'s rewards came with no gain to take them from`)
      }, 1_500)
  })
  // A field event's reward board (a Shugo Festival's five chests): the entries with your name are
  // the chests you opened; theirs go to the run, as a cube's loot.
  tracker.onEvent('rewardBoard', (ev) => {
    const s = sessions.current
    const last = s?.runs?.at(-1)
    const run = openRun() ?? (last?.end && Date.now() - last.end < LOOT_AFTER_MS ? last : null)
    if (!s || !run) return
    const entries = (ev['entries'] as { name: string | null; items: { item: number; amount: number }[] }[] | undefined) ?? []
    const loot = notableLoot(entries.filter((e) => e.name === s.name).flatMap((e) => e.items))
    if (!Object.keys(loot).length) return
    // The game sends the board more than once (twice, 0.1 s apart): the last one replaces the one before.
    run.loot ??= {}
    for (const [id, n] of Object.entries(boardLoot.get(run) ?? {})) run.loot[id] = (run.loot[id] ?? 0) - n
    for (const [id, n] of Object.entries(loot)) run.loot[id] = (run.loot[id] ?? 0) + n
    for (const [id, n] of Object.entries(run.loot)) if (n <= 0) delete run.loot[id]
    boardLoot.set(run, loot)
    log(`session: ${run.name}'s rewards ${JSON.stringify(loot)} (all: ${JSON.stringify(entries.filter((e) => e.name === s.name).flatMap((e) => e.items.map((i) => [i.item, i.amount])))})`)
    changed()
  })
  // Enhance Stones and Phantasmal Fragments: each rise of their balance is earned.
  tracker.onEvent('currency', (ev) => {
    const s = sessions.current
    const item = ev['item'] as number
    const balance = ev['balance'] as number
    if (!s || s.name !== ev['name']) return
    const before = currencySeen.get(item)
    currencySeen.set(item, balance)
    if (before === undefined || balance <= before) return
    const gained = balance - before
    s.currencies = { ...s.currencies, [item]: (s.currencies?.[item] ?? 0) + gained }
    toRun((run) => (run.currencies[item] = (run.currencies[item] ?? 0) + gained))
    s.last = Date.now()
    changed()
  })
  // A gathering: the session's stats (done, failed, doubled, ranked up) and what it gave.
  tracker.onEvent('gather', (ev) => {
    const s = sessions.current
    if (!s) return
    const result = ev['result'] as number
    if (result > 2) log(`session: a gathering's result ${result} not known (${ev['amount']} x ${ev['item']})`)
    noteGathering(s, ev['item'] as number, ev['amount'] as number, result, (ev['bonus'] as number | undefined) ?? 0)
    s.last = Date.now()
    changed()
  })
  tracker.onEvent('pvpKill', (ev) => {
    if (ev['died'] !== true && (ev['mine'] === true || typeof ev['fight'] === 'string')) pvpAt = Date.now()
  })
  tracker.onEvent('abyssGain', (ev) => {
    const name = ev['name'] as string | null
    const gained = ev['gained'] as number
    if (!name || !(gained > 0)) return
    const at = Date.now()
    const s = sessionOf(name, tracker.status().server, at)
    const source = apSource(gained, at, tracker.nearby().world, pvpAt)
    s.ap += gained
    s.sources[source] = (s.sources[source] ?? 0) + gained
    s.last = at
    toRun((run) => (run.ap += gained))
    noteGain({ at, kind: 'ap', gained, source })
    changed()
  })
  // `questReward` is the same message as `supplyDone` (a supply request handed in), which the
  // handler above takes: its gains come just after it, so they are moved a moment later.
  // The login's balance is a start; each rise after it is earned.
  tracker.onEvent('wallet', (ev) => {
    if (sessions.current?.name === ev['name'] && typeof ev['kina'] === 'number') kinaSeen = ev['kina']
  })
  tracker.onEvent('kina', (ev) => {
    const name = ev['name'] as string | null
    const balance = ev['balance'] as number
    const s = sessions.current
    // Only the session going on's character: a balance alone (spending) never starts one.
    if (!name || !s || s.name !== name) {
      kinaSeen = null
      return
    }
    if (kinaSeen !== null && balance > kinaSeen) {
      const gained = balance - kinaSeen
      const source = kinaSource(Date.now(), tracker.nearby().world)
      s.kina += gained
      s.kinaSources = { ...s.kinaSources, [source]: (s.kinaSources?.[source] ?? 0) + gained }
      s.last = Date.now()
      toRun((run) => (run.kina += gained))
      noteGain({ at: s.last, kind: 'kina', gained, source })
      changed()
    }
    kinaSeen = balance
  })
}
