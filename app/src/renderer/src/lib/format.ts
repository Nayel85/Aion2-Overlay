/**
 * What the windows write in the language picked, the same way everywhere: how long ago, a time of
 * day, a date, and a class's emblem. Numbers and durations: shared/format.ts.
 */
import { loc, t } from './i18n.ts'

/** How long ago, from `now`: just now, 5 min ago, 3 h ago, 2 d ago (past 48 hours). */
export function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  if (m < 1) return t('just now')
  if (m < 60) return t('{n} min ago', { n: m })
  const h = Math.round(m / 60)
  return h < 48 ? t('{n} h ago', { n: h }) : t('{n} d ago', { n: Math.round(h / 24) })
}

/** A time of day: 15:30 (or 3:30 PM, as the clock setting says). */
export const timeOfDay = (ms: number): string => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

/** A date and its time: 24 Nov, 15:30. */
export const dateTime = (ms: number): string => new Date(ms).toLocaleString(loc(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const CLASS_ICONS = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
/** The engine's (and the Lokthar site's) names for one class, the files'. */
const CLASS_ALIAS: Record<string, string> = { elementalist: 'spiritmaster', summoner: 'spiritmaster' }

/** A class's emblem (assets/classes, from A2Tools DPS Meter), by its name; null for an unknown one. */
export function classIconUrl(className: string | null | undefined): string | null {
  const name = className?.toLowerCase()
  return name ? (CLASS_ICONS[`/src/assets/classes/${CLASS_ALIAS[name] ?? name}.png`] ?? null) : null
}
