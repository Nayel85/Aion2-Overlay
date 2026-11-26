/**
 * Your characters (the Characters page): every one the character selection screen lists, their
 * class, level and gear score as it lists them, and each one's counters (Odyle energy, entry
 * counts) as the game sends them when it logs in. Combat power and portraits come from NCSoft's
 * site (the game sends neither for you), asked once a day per character.
 *
 * Kept across restarts in `<userData>/characters.json`.
 */
import { ABYSS_POINTS, SEASON_POINTS } from '../shared/sessions.ts'
import { dataFile } from './dataFile.ts'
import { broadcast } from './broadcast.ts'
import { log, tracker } from './tracker.ts'
import { ABYSS_TIME, ASCENSION, characterId, corridorReset, CORRIDORS, ENERGY, ncsoftRegion, NIGHTMARE, portraitUrl, type Characters, type TrackedCharacter } from '../shared/characters.ts'

/** How long NCSoft's combat power and portrait are kept before asking again. */
const FETCH_EVERY_MS = 24 * 3_600_000
/** A failed ask is tried again after this long. */
const RETRY_MS = 15 * 60_000
const SEARCH_URL = 'https://api-search.plaync.com/aion2global/search/v2/character'
const INFO_URL = 'https://aion2.plaync.com/api/character/info'

let characters: Characters = {}
/** Asked or failed recently, by id: not asked again before then. */
const asked = new Map<string, number>()
let fetching = false
/** Asked for while a fetch was going: another round after it. */
let again = false

const listeners = new Set<() => void>()

const file = dataFile('characters.json')

function load(): void {
  characters = (file.read() as { characters?: Characters } | null)?.characters ?? {}
}

function changed(): void {
  file.save(() => ({ characters }))
  broadcast('characters:changed', characters)
  for (const fn of listeners) fn()
}

function entry(server: number, name: string): TrackedCharacter {
  const id = characterId(server, name)
  characters[id] ??= {
    name, server, key: null, className: null, level: null, gearScore: null, legion: null,
    combatPower: null, portrait: null, fetchedAt: null, order: Object.keys(characters).length, listedAt: null, counters: null,
  }
  return characters[id]
}


async function getJson(url: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]))
  const res = await fetch(`${url}?${query}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

/** NCSoft's combat power for `c` (their search finds the character id, their info has it). */
async function fetchCombatPower(c: TrackedCharacter): Promise<number | null> {
  const region = ncsoftRegion(c.server)
  if (!region) return null
  const found = await getJson(SEARCH_URL, {
    keyword: c.name, race: c.server < 2000 ? 1 : 2, serverId: c.server, page: 1, size: 30, region, localeInfo: 'en-US',
  })
  const list = (found['list'] as { characterId: string; name: string; serverId: number; profileImageUrl?: string }[] | undefined) ?? []
  const plain = (s: string): string => s.replace(/<[^>]*>/g, '')
  const hit = list.find((e) => (c.key && e.profileImageUrl?.endsWith(`charKey=${c.key}`)) || (e.serverId === c.server && plain(e.name) === c.name))
  if (!hit) return null
  const info = await getJson(INFO_URL, { region, serverId: c.server, characterId: decodeURIComponent(hit.characterId), lang: 'en-US' })
  const power = (info['profile'] as { combatPower?: unknown } | undefined)?.combatPower
  return typeof power === 'number' ? power : null
}

async function fetchPortrait(c: TrackedCharacter): Promise<string | null> {
  if (!c.key) return null
  const res = await fetch(portraitUrl(c.server, c.key), { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) {
    log(`characters: ${c.name}'s portrait: HTTP ${res.status} ${type}`)
    return null
  }
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
}

/** Ask NCSoft about one character: its combat power and portrait, each kept when the other fails. */
async function fetchOne(c: TrackedCharacter): Promise<void> {
  const [power, portrait] = await Promise.allSettled([fetchCombatPower(c), fetchPortrait(c)])
  const got = <T>(r: PromiseSettledResult<T | null>): T | null => (r.status === 'fulfilled' ? r.value : null)
  c.combatPower = got(power) ?? c.combatPower
  c.portrait = got(portrait) ?? c.portrait
  // Done for the day only with both: a missing portrait is asked again after RETRY_MS.
  if (got(power) !== null && (got(portrait) !== null || !c.key)) c.fetchedAt = Date.now()
  const why = (r: PromiseSettledResult<unknown>): string => (r.status === 'rejected' ? ` (${(r.reason as Error).message})` : '')
  log(`characters: ${c.name} from NCSoft: combat power ${got(power) ?? '?'}${why(power)}, portrait ${got(portrait) ? 'yes' : 'no'}${why(portrait)}`)
  changed()
}

/** Ask NCSoft about each character not asked in a day, or still without a portrait, one at a time. */
async function fetchMissing(): Promise<void> {
  if (fetching) {
    again = true
    return
  }
  fetching = true
  try {
    do {
      again = false
      for (const [id, c] of Object.entries(characters)) {
        const now = Date.now()
        const due = !c.fetchedAt || now - c.fetchedAt >= FETCH_EVERY_MS || (!c.portrait && !!c.key)
        if (!due || (asked.get(id) ?? 0) > now) continue
        asked.set(id, now + RETRY_MS)
        await fetchOne(c)
      }
    } while (again)
  } finally {
    fetching = false
  }
}

/** A corridor's passage time, as the game said at `at` (only newer news counts: the login's counters can be told after changes). */
function corridorSeen(c: TrackedCharacter, id: string, ms: number, at: number): boolean {
  if (!CORRIDORS.some((k) => k.id === id)) return false
  c.corridors ??= { left: {}, abyssAt: null }
  const old = c.corridors.left[id]
  if (old && old.at > at) return false
  c.corridors.left[id] = { ms, at }
  if (old?.ms !== ms) log(`characters: ${c.name}'s corridor ${id}: ${ms ? `${ms} ms of passage` : 'none'}`)
  return old?.ms !== ms || !old || old.at < corridorReset(at)
}

export const characterStore = {
  all: (): Characters => characters,
  /** Told after every change (guild events: a new character may be the one the site knows). */
  onChange(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** Ask NCSoft again now (the refresh button). */
  async refresh(id: string): Promise<void> {
    const c = characters[id]
    if (!c) return
    asked.set(id, Date.now() + RETRY_MS)
    await fetchOne(c)
  },
  /** Stop tracking a character (it was deleted in game, say). */
  forget(id: string): void {
    delete characters[id]
    changed()
  },
}

export function startCharacters(): void {
  load()
  // The character selection screen: every character of the server, in the game's order.
  tracker.onEvent('characterList', (ev) => {
    const list = ev.characters ?? []
    const at = ev.ts ?? Date.now()
    list.forEach((l, order) => {
      const c = entry(l.server, l.name)
      Object.assign(c, { key: l.key, className: l.className ?? c.className, level: l.level, gearScore: l.gearScore, legion: l.legion, order, listedAt: at })
    })
    log(`characters: listed ${list.map((l) => l.name).join(', ')}`)
    changed()
    void fetchMissing()
  })
  // You, entering the world: what you are now.
  tracker.onEvent('me', (ev) => {
    const c = entry(ev.server, ev.name)
    Object.assign(c, { className: ev.className ?? c.className, level: ev.level, gearScore: ev.gearScore })
    changed()
    void fetchMissing()
  })
  /** Runs entered, kept up to date as they happen (energy changes with every fight: it waits for the next login). */
  const RUNS = new Set([NIGHTMARE.id, ASCENSION.id, ENERGY.id])
  // The login's counters.
  tracker.onEvent('counters', (ev) => {
    const server = ev.server
    if (server === null) return
    const c = entry(server, ev.name)
    c.counters = { at: ev.ts ?? Date.now(), values: ev.values}
    for (const { id } of CORRIDORS) corridorSeen(c, id, c.counters.values[id]?.[0] ?? 0, c.counters.at)
    log(`characters: ${c.name}'s counters, energy ${JSON.stringify(c.counters.values['60000001'] ?? null)}`)
    changed()
  })
  // A counter changed while playing: a Nightmare or Ascension Trial entered, Odyle energy spent (the loot chest), the corridors given or
  // done, and your Abyss time ticking.
  tracker.onEvent('counter', (ev) => {
    const server = ev.server
    if (server === null) return
    const c = entry(server, ev.name)
    const at = ev.ts ?? Date.now()
    const id = ev.id
    if (id === ABYSS_TIME) {
      c.corridors ??= { left: {}, abyssAt: null }
      // Saved only when it tells something new: the first time in the Abyss since the reset.
      const fresh = (c.corridors.abyssAt ?? 0) < corridorReset(at)
      c.corridors.abyssAt = Math.max(c.corridors.abyssAt ?? 0, at)
      if (fresh) changed()
      return
    }
    if (RUNS.has(id)) {
      // Only newer news than what is kept (the login's counters can be told after changes).
      if (!c.counters || at < (c.counters.changedAt?.[id] ?? c.counters.at)) return
      const values = ev.values
      c.counters.values[id] = values
      c.counters.changedAt = { ...c.counters.changedAt, [id]: at }
      log(`characters: ${c.name}'s ${id === NIGHTMARE.id ? 'Nightmare' : id === ENERGY.id ? 'Odyle energy' : 'Ascension Trial'} now ${JSON.stringify(values)}`)
      changed()
      return
    }
    if (!CORRIDORS.some((k) => k.id === id)) {
      // Any other counter: kept up to date as it changes (a Daily Dungeon entered, keys used), and logged.
      const values = ev.values
      log(`characters: ${c.name}'s counter ${id} now ${JSON.stringify(values)} (was ${JSON.stringify(c.counters?.values[id] ?? null)})`)
      if (!c.counters || at < (c.counters.changedAt?.[id] ?? c.counters.at)) return
      c.counters.values[id] = values
      c.counters.changedAt = { ...c.counters.changedAt, [id]: at }
      changed()
      return
    }
    if (corridorSeen(c, id, ev.values[0] ?? 0, at)) changed()
  })
  // Your Kina and bound Kina as you enter the world (the item list): theirs until they change.
  tracker.onEvent('wallet', (ev) => {
    const server = ev.server
    if (server === null) return
    const c = entry(server, ev.name)
    const at = ev.ts ?? Date.now()
    const kina = ev.kina
    const bound = ev.boundKina
    if (kina !== null) c.kina = { balance: kina, at }
    // Not in the list: none.
    c.boundKina = { balance: bound ?? 0, at }
    // Logged with the last ones seen: what the weekly reset did between them.
    const oath = ev.balances?.[SEASON_POINTS]
    const abyss = ev.balances?.[ABYSS_POINTS]
    log(`characters: ${c.name} at login: Oath Coins ${oath ?? '?'} (last ${c.seasonPoints?.balance ?? '?'}), Abyss Points ${abyss ?? '?'}, season week ${ev.seasonWeek ?? '?'} (last ${c.seasonWeek?.value ?? '?'})`)
    if (oath !== undefined) c.seasonPoints = { balance: oath, at }
    if (abyss !== undefined) c.abyssPoints = { balance: abyss, at }
    if (ev.seasonWeek != null) c.seasonWeek = { value: ev.seasonWeek, at }
    changed()
  })
  // The Oath Coins and the Abyss Points as they change: the character's.
  tracker.onEvent('balance', (ev) => {
    if (ev.server === null || !ev.name) return
    const c = entry(ev.server, ev.name)
    const at = ev.ts ?? Date.now()
    if (ev.item === SEASON_POINTS) {
      log(`characters: ${c.name}'s Oath Coins ${c.seasonPoints?.balance ?? '?'} -> ${ev.balance}`)
      c.seasonPoints = { balance: ev.balance, at }
    } else if (ev.item === ABYSS_POINTS) c.abyssPoints = { balance: ev.balance, at }
    else return
    changed()
  })
  // The season's weekly progress as it moves (a mission done).
  tracker.onEvent('seasonWeek', (ev) => {
    if (ev.server === null || !ev.name) return
    const c = entry(ev.server, ev.name)
    log(`characters: ${c.name}'s season week ${c.seasonWeek?.value ?? '?'} -> ${ev.value}`)
    c.seasonWeek = { value: ev.value, at: ev.ts ?? Date.now() }
    changed()
  })
  // Your subscriptions, at login: the account's, kept on the character that logged in (the newest
  // reading counts, whichever character it was); the memberships among them show on the Characters page.
  tracker.onEvent('subscriptions', (ev) => {
    const server = ev.server
    if (server === null) return
    const c = entry(server, ev.name)
    const list = ev.list
    c.subscriptions = { list, at: ev.ts ?? Date.now() }
    log(`characters: ${c.name}'s subscriptions ${JSON.stringify(list)}`)
    changed()
  })
  // The Kina and bound Kina of the character playing, kept as theirs: saved a few seconds after
  // they stop changing (farming sends many).
  let kinaSave: ReturnType<typeof setTimeout> | null = null
  for (const [type, field] of [['kina', 'kina'], ['boundKina', 'boundKina']] as const) {
    tracker.onEvent(type, (ev) => {
      // Whose the engine says (nobody's while a login is under way: the one playing is the last one).
      const name = ev.name
      const server = ev.server
      if (!name || server === null) return
      const c = characters[characterId(server, name)]
      if (!c) return
      c[field] = { balance: ev.balance, at: ev.ts ?? Date.now() }
      if (kinaSave) clearTimeout(kinaSave)
      kinaSave = setTimeout(() => {
        kinaSave = null
        changed()
      }, 5000)
    })
  }
  void fetchMissing()
}
