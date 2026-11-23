/**
 * The guild (shared/guild.ts), from the Lokthar site: sends what the game says of your characters
 * (PUT /api/aion2/characters: class, level, gear score, combat power, Odyle energy and the other
 * recharge counters, as they change) and asks the site for your roster (GET /api/aion2/guild) and
 * which of your characters is your main. Identified as the guild events are (main/guildEvents.ts):
 * by the characters this app has seen, no sign-in. If none of them is on an Aion 2 roster of the
 * site nothing is kept or shown, and it asks again only now and then.
 *
 * It goes with the guild events' switch (Settings → Lokthar site): off, nothing is sent.
 */
import { broadcast } from './broadcast.ts'
import { characterStore } from './characters.ts'
import { siteBase } from './lokthar.ts'
import { settings } from './settings.ts'
import { log, tracker } from './tracker.ts'
import { ASCENSION, corridorStates, ENERGY, nextCorridorReset, NIGHTMARE, type TrackedCharacter } from '../shared/characters.ts'
import { serverName } from '../shared/servers.ts'
import { NO_GUILD, type GuildCharacter, type GuildMember, type GuildState, type SiteCounter } from '../shared/guild.ts'

const TIMEOUT_MS = 10_000
/** What the site has of the roster is asked again this often, and after any change of yours. */
const POLL_MS = 5 * 60_000
/** A change of a character (a counter ticking, a level) is sent this long after the last one. */
const SEND_DELAY_MS = 4_000
/** Not on a roster: asked again this seldom. */
const NOT_MEMBER_MS = 30 * 60_000
const RETRY_MS = 60_000

let state: GuildState = { ...NO_GUILD }
let timer: ReturnType<typeof setTimeout> | null = null
let sendTimer: ReturnType<typeof setTimeout> | null = null
/** What was last sent (so an unchanged list isn't sent again). */
let sent = ''
let running: Promise<void> | null = null
let again = false

function set(patch: Partial<GuildState>): void {
  state = { ...state, ...patch, at: patch.at ?? state.at }
  broadcast('guild:changed', state)
}

const enabled = (): boolean => settings.get('guildEvents').enabled

/** The characters to be known by: the one playing first, then the rest of the Characters page. */
function known(): { name: string; server: number }[] {
  const s = tracker.status()
  const all = Object.values(characterStore.all()).map((c) => ({ name: c.name, server: c.server }))
  if (s.character && s.server !== null && s.server !== undefined) all.unshift({ name: s.character, server: s.server })
  return [...new Map(all.map((c) => [`${c.server}:${c.name.toLowerCase()}`, c])).values()]
}

/** One counter as the site wants it: its values and when the game said them. */
function counter(c: TrackedCharacter, id: string): { values: number[]; read_at: number } | undefined {
  const values = c.counters?.values[id]
  if (!c.counters || !values) return undefined
  return { values: values.slice(0, 2), read_at: c.counters.changedAt?.[id] ?? c.counters.at }
}

/** What the game said of each character, for the site. */
function payload(): object[] {
  const order = known()
  const characters = characterStore.all()
  return order.map((k) => {
    const c = Object.values(characters).find((x) => x.server === k.server && x.name.toLowerCase() === k.name.toLowerCase())
    const now = Date.now()
    const counters = c
      ? Object.fromEntries(
          [
            ['energy', counter(c, ENERGY.id)],
            ['nightmare', counter(c, NIGHTMARE.id)],
            ['ascension', counter(c, ASCENSION.id)],
            // The Abyss corridors as worked out now, good until they come back.
            ['corridors', { states: corridorStates(c.corridors, now), until: nextCorridorReset(now) }],
          ].filter(([, v]) => v),
        )
      : {}
    return {
      name: k.name,
      server: k.server,
      server_name: serverName(k.server) ?? undefined,
      class_name: c?.className ?? undefined,
      level: c?.level ?? undefined,
      gear_score: c?.gearScore ?? undefined,
      combat_power: c?.combatPower ?? undefined,
      legion: c?.legion ?? undefined,
      portrait_key: c?.key ?? undefined,
      counters,
    }
  })
}

async function request(method: 'GET' | 'PUT', path: string, body?: object): Promise<{ status: number; json: Record<string, unknown> }> {
  const base = siteBase()
  if (typeof base === 'string') throw new Error(base)
  const url = new URL(path, base)
  if (method === 'GET') url.searchParams.set('characters', JSON.stringify(known()))
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) || 0 : 0)

function toCounter(v: unknown): SiteCounter | null {
  const c = v as Record<string, unknown> | null
  if (!c || num(c['value']) === null) return null
  return {
    value: num(c['value'])!,
    extra: num(c['extra']) ?? 0,
    max: num(c['max']) ?? 0,
    per: num(c['per']) ?? 0,
    nextAt: time(c['next_at']),
    fullAt: time(c['full_at']),
    readAt: time(c['read_at']),
  }
}

function toCharacter(r: Record<string, unknown>): GuildCharacter {
  return {
    name: String(r['name'] ?? ''),
    server: num(r['server']),
    className: typeof r['class_name'] === 'string' ? r['class_name'] : null,
    level: num(r['level']),
    gearScore: num(r['gear_score']),
    combatPower: num(r['combat_power']),
    main: r['main'] === true,
    portraitUrl: typeof r['portrait_url'] === 'string' ? r['portrait_url'] : null,
    legion: typeof r['legion'] === 'string' ? r['legion'] : null,
    reportedAt: time(r['reported_at']) || null,
    energy: toCounter(r['energy']),
    nightmare: toCounter(r['nightmare']),
    ascension: toCounter(r['ascension']),
  }
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void sync(true), ms)
}

/** Send what changed, then ask for the roster. One at a time; asked meanwhile, once more after. */
function sync(force = false): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    if (!enabled()) return set({ ...NO_GUILD })
    if (!known().length) return set({ state: 'waiting', message: null })
    if (state.state === 'off' || state.state === 'waiting') set({ state: 'loading' })
    try {
      const body = payload()
      const key = JSON.stringify(body)
      if (force || key !== sent) {
        const put = await request('PUT', '/api/aion2/characters', { characters: body })
        if (put.status === 403 && put.json['error'] === 'not_a_member') {
          sent = ''
          set({ state: 'notMember', message: null, roster: null, main: null, members: [] })
          return schedule(NOT_MEMBER_MS)
        }
        if (put.status !== 200) throw new Error(`the site answered ${put.status}`)
        sent = key
        const main = (put.json['member'] as { main?: { name?: string; server?: number } | null } | undefined)?.main
        set({ main: main?.name && main.server ? { name: main.name, server: main.server } : null })
      }
      const guild = await request('GET', '/api/aion2/guild')
      if (guild.status === 403) {
        set({ state: 'notMember', message: null, roster: null, main: null, members: [] })
        return schedule(NOT_MEMBER_MS)
      }
      if (guild.status !== 200) throw new Error(`the site answered ${guild.status}`)
      const members: GuildMember[] = ((guild.json['members'] as Record<string, unknown>[] | undefined) ?? []).map((m, i) => ({
        id: num(m['id']) ?? -i - 1,
        name: String(m['name'] ?? ''),
        you: m['you'] === true,
        characters: ((m['characters'] as Record<string, unknown>[] | undefined) ?? []).map(toCharacter),
      }))
      set({ state: 'ok', message: null, roster: typeof guild.json['roster'] === 'string' ? guild.json['roster'] : null, members, at: Date.now() })
      schedule(POLL_MS)
    } catch (err) {
      sent = ''
      set({ state: 'error', message: `could not reach the site: ${(err as Error).message}` })
      log(`guild: ${(err as Error).message}`)
      schedule(RETRY_MS)
    }
  })().finally(() => {
    running = null
    if (again) {
      again = false
      void sync()
    }
  })
  return running
}

export const guild = {
  get: (): GuildState => state,
  /** Ask the site again now (the Guild page opened, or its refresh). */
  refresh: (): Promise<void> => sync(true),
}

export function startGuild(): void {
  settings.onChanged((_all, key) => {
    if (key === 'guildEvents' || key === 'lokthar') void sync(true)
  })
  const changed = (): void => {
    if (!enabled()) return
    if (sendTimer) clearTimeout(sendTimer)
    sendTimer = setTimeout(() => void sync(), SEND_DELAY_MS)
  }
  tracker.onStatus(changed)
  characterStore.onChange(changed)
  void sync()
}
