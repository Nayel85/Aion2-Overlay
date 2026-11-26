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
import type { EngineEvents } from './engineEvents.ts'
import { dataFile } from './dataFile.ts'
import { abyss } from './abyss.ts'
import { broadcast } from './broadcast.ts'
import { log, lootCubes, tracker } from './tracker.ts'
import { onCrafted, onGathered } from './gather.ts'
import { onArrival } from './inventory.ts'
import { recipeOf } from '../shared/gather.ts'
import { BOSS_RUNS } from '../shared/bossRuns.ts'
import { AP_ITEM, apSource, GATHER_FAILED, resourceOf, dungeonOf, itemInfo, KINA_ITEM, kinaSource, NO_SESSIONS, notableLoot, noteGathering, QUEST_WITHIN_MS, questReward, RUN_COUNTERS, runIsNoise, type DungeonRun, type PlaySession, type RecentGain, type Sessions } from '../shared/sessions.ts'

/** A Hidden Cube's loot told this long after its first burst is still its own. */
const HIDDEN_CUBE_MS = 10_000
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
/** Your last PvP kill or assist: the Abyss Points right after it are its. */
let pvpAt: number | null = null
/** The Kina balance last seen for the session's character: its rises are earned. */
/** The last balances seen of the session's character: Kina and bound Kina (quests' and requests' rewards), each rise earned. */
const kinaSeen: { kina: number | null; boundKina: number | null } = { kina: null, boundKina: null }
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
/** Back in the open run's dungeon this soon after the session's last news (the app restarted): the same run. */
const RESUME_MS = 10 * 60_000
/** The run counters' last values, and the last one to drop (its kind, when): the next run's kind. */
const counterSeen = new Map<string, number>()
let counterDrop: { kind: string; at: number } | null = null

/** The run whose entry was paid last (a run counter's drop): a second drop in it is a new run. */
let paidRun: DungeonRun | null = null

/** The same dungeon again without leaving it: the run going on ends, a new one of it starts (`started`: under way at once). */
function runAgain(s: PlaySession, run: DungeonRun, at: number, started = false): DungeonRun {
  closeRun(s, at)
  const again: DungeonRun = { world: run.world, name: run.name, kind: run.kind, start: at, end: null, ap: 0, kina: 0, currencies: {}, deaths: 0, partyDeaths: 0 }
  if (started) again.started = at
  s.runs = [...(s.runs ?? []), again]
  log(`session: ${run.name} again`)
  return again
}

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

const file = dataFile('sessions.json', SAVE_AFTER_MS)

function load(): void {
  const saved = file.read() as Partial<Sessions> | null
  // None saved yet, or unreadable: start empty.
  sessions = saved ? { current: saved.current ?? null, history: Array.isArray(saved.history) ? saved.history : [] } : NO_SESSIONS
}

function changed(): void {
  broadcast('sessions:changed', sessions)
  file.save(() => sessions)
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
  kinaSeen.kina = kinaSeen.boundKina = null
  currencySeen = new Map()
  return current
}

/**
 * The Session page's Reset: the session going on goes to the past ones (if it did anything), and a new
 * one starts for the same character, now; with the souls, Kina and Abyss Points per hour (the tracker's).
 */
export function restartSession(): void {
  const s = sessions.current
  tracker.resetSession()
  if (!s) return
  begin(s.name, s.server, Date.now())
  log(`session: ${s.name}'s restarted by hand`)
  changed()
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
    if (((ev.characters as unknown[] | undefined) ?? []).length) selecting = true
  })
  // A login: the counters come as you enter the world from the character selection. They come too
  // as you go into an instance on its own server (Expeditions, Transcendences...) and back out, with
  // no selection (whose list comes once, the first time): the same character goes on with its session.
  tracker.onEvent('counters', (ev) => {
    const name = ev.name
    if (!name) return
    const at = ev.ts ?? Date.now()
    const server = ev.server ?? null
    const c = sessions.current
    if (!selecting && c && c.name === name && (c.server === null || server === null || c.server === server) && at - c.last < CONTINUE_MS) {
      const values = ev.values
      for (const id of Object.keys(RUN_COUNTERS)) if (values[id]) counterSeen.set(id, total(values[id]))
      log(`session: ${name} moved servers (an instance's), same session`)
      return
    }
    selecting = false
    begin(name, server, at)
    log(`session: ${name} logged in`)
    tracker.resetSession()
    const values = ev.values
    counterSeen.clear()
    counterDrop = null
    for (const id of Object.keys(RUN_COUNTERS)) if (values[id]) counterSeen.set(id, total(values[id]))
    changed()
  })
  // An entry paid (a Nightmare's, an Ascension Trial's, a Daily Dungeon's): the run's kind.
  tracker.onEvent('counter', (ev) => {
    const id = ev.id
    const kind = RUN_COUNTERS[id]
    if (!kind) return
    const now = total(ev.values)
    const before = counterSeen.get(id)
    counterSeen.set(id, now)
    if (before === undefined || now >= before) return
    let run = openRun()
    const s = sessions.current
    // A second entry paid in the same instance (Crobakhi's daily: you stay in it between runs): a new run.
    if (s && run && run === paidRun) run = runAgain(s, run, Date.now(), true)
    if (run) {
      run.kind = kind
      paidRun = run
    } else counterDrop = { kind, at: Date.now() }
    log(`session: a ${kind} entered`)
    changed()
  })
  // Into a dungeon, or out of one: a run starts, or ends.
  tracker.onEvent('nearby', (ev) => {
    const world = ev.world ?? null
    if (world === null || world === worldSeen) return
    const first = worldSeen === null
    worldSeen = world
    const s = sessions.current
    if (!s) return
    // The app started again inside the dungeon of the run left open (an update, a restart): that run
    // goes on, not a new one (nor the first one left as abandoned).
    const open = openRun()
    if (first && open && open.world === world && Date.now() - s.last < RESUME_MS) {
      log(`session: back in ${open.name}, the same run`)
      return
    }
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
    if (s && run && run.cleared !== undefined) run = runAgain(s, run, Date.now())
    if (run && run.started === undefined) {
      run.started = Date.now()
      changed()
    }
  })
  // The run's own clock (the game's): under way at the end of its countdown, over as its reward comes.
  // Its time is the game's run alone, the countdown before and the reward's wait after left out.
  tracker.onEvent('dungeonState', (ev) => {
    const run = openRun()
    if (!run || run.world !== ev.zone || !ev.at) return
    if (ev.state === 2) run.started = ev.at
    else if (ev.state === 3 && run.started !== undefined && ev.at >= run.started) {
      run.cleared = ev.at
      log(`session: ${run.name} over in ${Math.round((ev.at - run.started) / 1000)} s`)
    } else return
    changed()
  })
  // A player down: yours and the group's deaths in the run going on.
  tracker.onEvent('playerDied', (ev) => {
    const run = openRun()
    if (!run) return
    run.partyDeaths = (run.partyDeaths ?? 0) + 1
    if (ev.you === true) run.deaths = (run.deaths ?? 0) + 1
    log(`session: ${String(ev.name ?? 'a player')} died in ${run.name}`)
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
    run.boss = ev.boss
    if (typeof ev.level === 'number') run.level = ev.level
    changed()
  })
  // A cube opened: its Unique-or-better items and Arcana cards go to the run (the membership's
  // second cube comes in the same list). One opened just after leaving goes to the run just left.
  tracker.onEvent('loot', (ev) => {
    const loot = notableLoot(ev.items ?? [])
    const last = sessions.current?.runs?.at(-1)
    const run = openRun() ?? (last?.end && Date.now() - last.end < LOOT_AFTER_MS ? last : null)
    if (!run || !Object.keys(loot).length) return
    run.loot ??= {}
    for (const [id, n] of Object.entries(loot)) run.loot[id] = (run.loot[id] ?? 0) + n
    run.cubes = (run.cubes ?? 0) + lootCubes(ev)
    log(`session: ${run.name}'s cube gave ${JSON.stringify(loot)} (${run.cubes} cubes)`)
    changed()
  })
  // A Hidden Cube opened: what came into your bags with it is a run of its own, done, in the history
  // (before the run going on, if any, as a field boss's chest).
  onArrival((a) => {
    const s = sessions.current
    if (a.source !== 'hiddencube' || !s) return
    // All it gave, the least things too: what a cube is worth is the point.
    const loot = { ...a.items }
    // Its loot can come in two bursts (2026-11-25: 6 s apart, the second its Manastones and Soulstones): one cube.
    const same = [...(s.runs ?? [])].reverse().find((r) => r.kind === 'hiddencube' && a.at - r.start <= HIDDEN_CUBE_MS)
    if (same) {
      same.loot ??= {}
      for (const [id, n] of Object.entries(loot)) same.loot[id] = (same.loot[id] ?? 0) + n
      log(`session: the Hidden Cube also gave ${JSON.stringify(loot)}`)
      changed()
      return
    }
    const done: DungeonRun = { world: tracker.nearby().world ?? 0, name: 'Hidden Cube', kind: 'hiddencube', start: a.at, end: a.at, ap: 0, kina: 0, currencies: {}, loot }
    const run = openRun()
    const runs = s.runs ?? []
    s.runs = run ? [...runs.slice(0, -1), done, run] : [...runs, done]
    s.last = Date.now()
    log(`session: a Hidden Cube gave ${JSON.stringify(loot)}`)
    changed()
  })
  // A field boss that fell in view: when it fell, for its loot chest opened after.
  tracker.onEvent('bossKilled', (ev) => {
    bossDown = { npc: ev.npc, at: Date.now() }
  })
  // A box opened from your bags. A field boss's loot chest ("Kashapa's Loot Chest"): what it gave is
  // that boss's run, done, in the history. Any other: what it gave goes to the run going on.
  tracker.onEvent('boxOpened', (ev) => {
    const s = sessions.current
    const items = ev.items ?? []
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
    for (const r of ev.rewards ?? []) rewards[r.item] = (rewards[r.item] ?? 0) + r.amount
    const at = Date.now()
    // Its Abyss Points (not in its list: the balance rose as it was handed in): the rewards', not
    // where you stood, nor a rift's.
    const ap = recent.filter((g) => g.kind === 'ap' && g.gained > 0 && at - g.at >= 0 && at - g.at <= QUEST_WITHIN_MS).map((g) => g.gained)
    for (const n of ap) questReward(s, recent, 'ap', n, at)
    // A reward, not farming: off the Abyss Points per hour.
    for (const n of ap) abyss.notFarmed(n, at - QUEST_WITHIN_MS, at)
    const apTotal = ap.reduce((a, n) => a + n, 0)
    if (apTotal) {
      rewards[AP_ITEM] = (rewards[AP_ITEM] ?? 0) + apTotal
      abyss.notRift(at - QUEST_WITHIN_MS, at)
    }
    const offered = (ev.offered ?? []).map((r) => ({ ...r, chance: r.chance / 100_000_000 }))
    s.duties = [...(s.duties ?? []), { at, quest: ev.quest, rewards, offered }]
    s.last = at
    log(`session: duty mission ${String(ev.quest)} gave ${JSON.stringify(rewards)}`)
    changed()
  })
  // A craft over (main/gather.ts follows it): what it made, its count the recipe's (shared/recipes.ts:
  // a proc can be the item twice), or nothing, failed.
  onCrafted((c) => {
    const s = sessions.current
    if (!s) return
    const r = recipeOf(c.recipe)
    const count = c.failed ? 0 : ((c.proc ? r?.[1]?.[1] : r?.[0][1]) ?? 1)
    s.crafts = [...(s.crafts ?? []), c.failed ? { at: c.at, recipe: c.recipe, proc: false, failed: true, item: 0, count } : { at: c.at, recipe: c.recipe, proc: c.proc, item: c.item ?? 0, count }]
    s.last = c.at
    changed()
  })
  // A supply request handed in: its rewards, the game's set ones. Its Abyss Points rose the balance
  // in the same breath, counted a moment later: then taken off where you stood (or a rift) as a reward.
  tracker.onEvent('supplyDone', (ev) => {
    const s = sessions.current
    if (!s) return
    const rewards: Record<string, number> = {}
    for (const r of ev.rewards ?? []) rewards[r.item] = (rewards[r.item] ?? 0) + r.amount
    const at = Date.now()
    s.supplies = [...(s.supplies ?? []), { at, request: ev.request, rewards }]
    s.last = at
    log(`session: supply request ${String(ev.request)} gave ${JSON.stringify(rewards)}`)
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
          abyss.notFarmed(ap, at - QUEST_WITHIN_MS, now)
          moved = true
        }
        if (kina && questReward(s, recent, 'kina', kina, now, 'supply')) {
          tracker.kinaNotFarmed(kina, at - QUEST_WITHIN_MS, now)
          moved = true
        }
        if (moved) changed()
        else log(`session: supply request ${String(ev.request)}'s rewards came with no gain to take them from`)
      }, 1_500)
  })
  // A field event's reward board (a Shugo Festival's five chests): the entries with your name are
  // the chests you opened; theirs go to the run, as a cube's loot.
  tracker.onEvent('rewardBoard', (ev) => {
    const s = sessions.current
    const last = s?.runs?.at(-1)
    const run = openRun() ?? (last?.end && Date.now() - last.end < LOOT_AFTER_MS ? last : null)
    if (!s || !run) return
    const entries = ev.entries ?? []
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
    const item = ev.item
    const balance = ev.balance
    if (!s || s.name !== ev.name) return
    const before = currencySeen.get(item)
    currencySeen.set(item, balance)
    if (before === undefined || balance <= before) return
    const gained = balance - before
    s.currencies = { ...s.currencies, [item]: (s.currencies?.[item] ?? 0) + gained }
    toRun((run) => (run.currencies[item] = (run.currencies[item] ?? 0) + gained))
    s.last = Date.now()
    changed()
  })
  // A gathering over (main/gather.ts follows it): the session's stats (done, failed, doubled, ranked
  // up) and what it gave. Given up, it counts as a failure of the spot's resource; not at all when
  // that is not known. One begun before the app saw it counts in the stats only.
  onGathered(({ at, start, result, plain }) => {
    const s = sessions.current
    if (!s) return
    if (!result) {
      if (!start || !plain) return
      s.gatherings = [...(s.gatherings ?? []), { at, resource: plain, outcome: start.outcome, grade: start.grade, doubled: start.doubled, failed: true, abandoned: true, item: plain, amount: 0, skills: start.skills }]
      noteGathering(s, plain, 0, GATHER_FAILED)
    } else {
      const amount = result.amount + result.bonus
      if (start) s.gatherings = [...(s.gatherings ?? []), { at, resource: resourceOf(result.item), outcome: start.outcome, grade: start.grade, doubled: start.doubled, failed: result.result === 2 || amount <= 0, item: result.item, amount, skills: start.skills }]
      if (result.result > 2) log(`session: a gathering's result ${result.result} not known (${result.amount} x ${result.item})`)
      noteGathering(s, result.item, result.amount, result.result, result.bonus)
    }
    s.last = at
    changed()
  })
  tracker.onEvent('pvpKill', (ev) => {
    if (ev.died !== true && (ev.mine === true || typeof ev.fight === 'string')) pvpAt = Date.now()
  })
  tracker.onEvent('abyssGain', (ev) => {
    const name = ev.name
    const gained = ev.gained
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
    if (sessions.current?.name !== ev.name) return
    if (typeof ev.kina === 'number') kinaSeen.kina = ev.kina
    if (typeof ev.boundKina === 'number') kinaSeen.boundKina = ev.boundKina
  })
  // Kina and bound Kina alike: the session's Kina is both (most rewards are bound).
  const onKina = (which: 'kina' | 'boundKina') => (ev: EngineEvents['kina']): void => {
    const name = ev.name
    const balance = ev.balance
    const s = sessions.current
    // Only the session going on's character: a balance alone (spending) never starts one.
    if (!name || !s || s.name !== name) {
      kinaSeen[which] = null
      return
    }
    const seen = kinaSeen[which]
    if (seen !== null && balance > seen) {
      const gained = balance - seen
      const source = kinaSource(Date.now(), tracker.nearby().world)
      s.kina += gained
      s.kinaSources = { ...s.kinaSources, [source]: (s.kinaSources?.[source] ?? 0) + gained }
      s.last = Date.now()
      toRun((run) => (run.kina += gained))
      noteGain({ at: s.last, kind: 'kina', gained, source })
      changed()
    }
    kinaSeen[which] = balance
  }
  tracker.onEvent('kina', onKina('kina'))
  tracker.onEvent('boundKina', onKina('boundKina'))
}
