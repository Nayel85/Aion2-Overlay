/**
 * Each character's expeditions: the cubes opened toward each one's guaranteed chest (shared/
 * expeditions.ts). The game sends them as you log in (the engine's `expeditions`, `12 57`); each cube
 * opened in one after that adds one, until the next login says it again. Kept in
 * `<userData>/expeditions.json`, sent to the windows as they change.
 *
 * The login's list does not say whose it is: it goes to the character the login's inventory names
 * (just before or just after it).
 */
import { dataFile } from './dataFile.ts'
import { broadcast } from './broadcast.ts'
import { log, lootCubes, tracker } from './tracker.ts'
import { characterId } from '../shared/characters.ts'
import { ceilingAt } from '../shared/instances.ts'
import type { Expeditions } from '../shared/expeditions.ts'

/** A login's list and its inventory this close together are the same character's. */
const LOGIN_WITHIN_MS = 15_000

let state: Expeditions = {}
const file = dataFile('expeditions.json')
/** Whose the cubes opened are: the character last logged in. */
let playing: { id: string; name: string; at: number } | null = null
/** A login's list waiting for its character. */
let pending: { at: number; entries: { world: number; cubes: number }[] } | null = null

function changed(): void {
  broadcast('expeditions:changed', state)
  file.save(() => state)
}

export const expeditionsStore = { get: (): Expeditions => state }

function apply(who: { id: string; name: string }, entries: { world: number; cubes: number }[], at: number): void {
  state = { ...state, [who.id]: { name: who.name, at, cubes: Object.fromEntries(entries.map((e) => [e.world, e.cubes])) } }
  log(`expeditions: ${who.name}'s ${entries.map((e) => `${e.world} ${e.cubes}`).join(', ')}`)
  changed()
}

export function startExpeditions(): void {
  state = (file.read() as Expeditions | null) ?? {} // none yet
  // A login: whose the list is.
  tracker.onEvent('inventory', (ev) => {
    const name = ev['name'] as string | null
    if (!name) return
    const server = (ev['server'] as number | null) ?? null
    playing = { id: server !== null ? characterId(server, name) : name, name, at: Date.now() }
    if (pending && Date.now() - pending.at < LOGIN_WITHIN_MS) apply(playing, pending.entries, pending.at)
    pending = null
  })
  tracker.onEvent('expeditions', (ev) => {
    const entries = ((ev['entries'] as { world: number; cubes: number }[] | undefined) ?? []).map((e) => ({ world: e.world, cubes: e.cubes }))
    if (playing && Date.now() - playing.at < LOGIN_WITHIN_MS) apply(playing, entries, Date.now())
    else pending = { at: Date.now(), entries }
  })
  // A cube opened in an expedition: one more toward its chest (the next login says it as the game counts it).
  // Each cube counts, as the game does: the membership's second too (lootCubes, the session's count).
  tracker.onEvent('loot', (ev) => {
    const world = tracker.nearby().world
    const ceiling = world !== null ? ceilingAt(world) : undefined
    const mine = playing && state[playing.id]
    if (!ceiling || !mine || world === null) return
    const cubes = Math.min(ceiling, (mine.cubes[world] ?? 0) + lootCubes(ev))
    state = { ...state, [playing!.id]: { ...mine, cubes: { ...mine.cubes, [world]: cubes } } }
    log(`expeditions: ${mine.name} at ${cubes} of ${ceiling} in ${world}`)
    changed()
  })
}
