/**
 * Persisted settings: `%APPDATA%\Lokthar\settings.json`.
 *
 * As in marnis-app: the store is created on first use, never at import, because electron-store
 * fixes the `userData` path when it is constructed. And every write is normalised, then broadcast
 * to every window so all three stay in step.
 */
import ElectronStore from 'electron-store'
import { HUD_WIDGETS, normalise, SETTINGS_DEFAULTS, type SettingKey, type Settings } from '../shared/settings.ts'

// electron-store is ESM-only and the main bundle is CommonJS: the class sits on `.default`.
const Store = ((ElectronStore as unknown as { default?: typeof ElectronStore }).default ??
  ElectronStore) as typeof ElectronStore

let store: ElectronStore<Settings> | null = null
const listeners = new Set<(all: Settings, key: SettingKey) => void>()

function db(): ElectronStore<Settings> {
  store ??= new Store<Settings>({ name: 'settings', defaults: SETTINGS_DEFAULTS })
  return store
}

export const settings = {
  get<K extends SettingKey>(key: K): Settings[K] {
    return normalise(key, db().get(key))
  },
  set<K extends SettingKey>(key: K, value: unknown): void {
    db().set(key, normalise(key, value))
    const all = this.all()
    for (const fn of listeners) fn(all, key)
  },
  all(): Settings {
    const out = {} as Record<SettingKey, unknown>
    for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingKey[]) out[key] = this.get(key)
    return out as unknown as Settings
  },
  onChanged(fn: (all: Settings, key: SettingKey) => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get path(): string {
    return db().path
  },
}

/**
 * One-time layout updates, run at start before any window opens; each is numbered in
 * `layoutVersion` so it runs once.
 *   1: the Unified HUD takes over: it is turned on and the other widgets are closed (the DPS meter
 *      and the pets HUD keep whatever the player set). They are still a click away on the HUD.
 *   2: the Hidden Cube's sound leaves the pets HUD's settings for its own (`cubes`): as it was set.
 *   3: the party frames show their members' debuffs (their icons were off by default).
 *   4: the Aggro overlay's button on the Unified HUD (it came without one).
 */
export function applyLayoutUpdates(): void {
  if (settings.get('layoutVersion') < 1) layoutUpdate1()
  if (settings.get('layoutVersion') < 2) {
    const was = (db().get('hud') ?? {}) as { cubeSound?: unknown; cubeSoundId?: unknown; cubeVolume?: unknown; cubeCustomName?: unknown }
    settings.set('cubes', { sound: was.cubeSound, soundId: was.cubeSoundId, volume: was.cubeVolume, customName: was.cubeCustomName })
    settings.set('layoutVersion', 2)
  }
  if (settings.get('layoutVersion') < 3) {
    settings.set('party', { ...settings.get('party'), debuffIcons: true })
    settings.set('layoutVersion', 3)
  }
  if (settings.get('layoutVersion') < 4) {
    const u = settings.get('unified')
    if (!u.widgets.includes('aggro')) settings.set('unified', { ...u, widgets: HUD_WIDGETS.filter((w) => w === 'aggro' || u.widgets.includes(w)) })
    settings.set('layoutVersion', 4)
  }
}
function layoutUpdate1(): void {
  settings.set('unified', { ...settings.get('unified'), enabled: true })
  settings.set('minimap', { ...settings.get('minimap'), enabled: false })
  settings.set('gameMap', { ...settings.get('gameMap'), enabled: false })
  settings.set('timerBar', { ...settings.get('timerBar'), enabled: false })
  settings.set('killFeed', { ...settings.get('killFeed'), open: false })
  settings.set('enemies', { ...settings.get('enemies'), enabled: false })
  settings.set('skills', { ...settings.get('skills'), enabled: false })
  settings.set('dummy', { ...settings.get('dummy'), overlay: false })
  settings.set('buffs', { ...settings.get('buffs'), enabled: false, cc: false })
  settings.set('layoutVersion', 1)
}
