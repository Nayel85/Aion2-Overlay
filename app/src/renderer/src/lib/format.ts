/**
 * What the windows write in the language picked, the same way everywhere: how long ago, a time of
 * day, a date, and a class's emblem. Numbers and durations: shared/format.ts.
 */
import { loc, t } from './i18n.ts'
import { duration } from '@shared/format.ts'

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

/** A date: 24 Nov. */
export const shortDate = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
/** A date in figures: 24/11. */
export const numericDate = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })
/** A date in full: Monday 24 November. */
export const longDate = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
/** A day of the week: Mon. */
export const weekday = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { weekday: 'short' })
/** A date as the language writes it: 24/11/2026. */
export const plainDate = (at: number | string): string => new Date(at).toLocaleDateString(loc())

/** What is left until a moment, as a clock rounded up (48:09, 1:48:09); "now" once it is there. */
export const countdown = (at: number, now: number): string => (at - now <= 0 ? t('now') : duration(at - now, true))

/** A day of the week and its time: Mon 15:30. */
export const weekdayTime = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })
/** A day, its date and its time: Mon 24 Nov, 15:30. */
export const fullDateTime = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** A count grouped as the language does: 12 500 (French), 12,500. */
export const amount = (n: number): string => n.toLocaleString(loc())

/** A length in minutes and hours: 45 min, 2 h 05. */
export function lasting(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

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
