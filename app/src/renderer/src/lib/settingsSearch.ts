// Every setting of the app, to search them by name or what they do (English and French): read from
// the pages' own setting rows (`<SettingRow label="..." hint="...">`), so a new one is found without
// more to do, each with where it is (Settings, an overlay on the Overlays page, the Map page...).
// The overlays themselves are found by name too.
import { t } from '@/lib/i18n.ts'

/** Each page that has settings, by its file, and where it is (the dashboard's `go`). */
const WHERE: Record<string, string> = {
  'dashboard/SettingsView.vue': 'settings',
  'dashboard/MapView.vue': 'map',
  'dashboard/DutyView.vue': 'duty',
  'dashboard/EventsView.vue': 'events',
  'dashboard/UnifiedView.vue': 'overlays:unified',
  'dashboard/MeterView.vue': 'overlays:meter',
  'MeterSizeSettings.vue': 'overlays:meter',
  'dashboard/PartyView.vue': 'overlays:party',
  'dashboard/FlightView.vue': 'overlays:flight',
  'dashboard/GatherView.vue': 'overlays:gather',
  'dashboard/ApplicantsView.vue': 'overlays:applicants',
  'dashboard/BuffsView.vue': 'overlays:buffs',
  'dashboard/MapV2View.vue': 'overlays:gameMap',
  'overlays/SkillsSettings.vue': 'overlays:skills',
  'overlays/CcSettings.vue': 'overlays:cc',
  'overlays/MinimapSettings.vue': 'overlays:minimap',
  'overlays/EventBarSettings.vue': 'overlays:timerbar',
  'overlays/TrainingSettings.vue': 'overlays:training',
  'overlays/DutySettings.vue': 'overlays:duty',
  'overlays/KillFeedSettings.vue': 'overlays:killfeed',
  'overlays/EnemiesSettings.vue': 'overlays:enemies',
  'overlays/SoulTrackerSettings.vue': 'overlays:hud',
  'overlays/MerchantSettings.vue': 'overlays:merchant',
}
const SOURCES = import.meta.glob(['../components/dashboard/*.vue', '../components/overlays/*.vue', '../components/MeterSizeSettings.vue'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export interface SettingEntry {
  /** In English, as the page shows it translated. */
  label: string
  hint: string
  /** Where it is: a dashboard page, or `overlays:<id>`. */
  go: string
}
/** Each setting row of the pages above: its label and hint as written (static text only). */
export const SETTINGS: SettingEntry[] = Object.entries(SOURCES).flatMap(([path, src]) => {
  const go = WHERE[path.replace('../components/', '')]
  if (!go) return []
  return [...src.matchAll(/<SettingRow\b([^>]*)>/g)].flatMap((m) => {
    const label = /\slabel="([^"]+)"/.exec(m[1]!)?.[1]
    return label ? [{ label, hint: /\shint="([^"]+)"/.exec(m[1]!)?.[1] ?? '', go }] : []
  })
})

/** What matches `query` (every word, in the label or its hint, English or French), the labels' first. */
export function searchSettings(query: string, extra: SettingEntry[] = []): SettingEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const all = [...extra, ...SETTINGS]
  const text = (e: SettingEntry): [string, string] => [`${e.label} ${t(e.label)}`.toLowerCase(), `${e.hint} ${e.hint ? t(e.hint) : ''}`.toLowerCase()]
  return all
    .map((e) => {
      const [label, hint] = text(e)
      if (!words.every((w) => label.includes(w) || hint.includes(w))) return null
      return { e, score: words.filter((w) => label.includes(w)).length }
    })
    .filter((x): x is { e: SettingEntry; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e)
}

/** Once its page shows: the setting scrolled into view and lit up a moment. */
export function showSetting(label: string): void {
  setTimeout(() => {
    const el = [...document.querySelectorAll<HTMLElement>('[data-setting]')].find((x) => x.dataset['setting'] === label)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('setting-found')
    setTimeout(() => el.classList.remove('setting-found'), 1800)
  }, 120)
}
