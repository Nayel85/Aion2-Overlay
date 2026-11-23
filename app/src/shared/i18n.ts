/**
 * The app in French or English (Settings → language). Text is written in English where it is used
 * and looked up here: `FR` holds its French, and a line not in it stays English. Game words players
 * use as they are (PvP, DPS, skill, buff, bosses...) and the game's own names (the client is in
 * English) are left in English, the app's own words are translated.
 *
 * `{name}` in a line is filled from `vars`. `npm run i18n:check` lists lines used without French, and
 * French no longer used.
 */
import { FR } from './i18n.fr.ts'

export type Lang = 'fr' | 'en'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
]

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  const line = lang === 'fr' ? (FR[text] ?? text) : text
  return vars ? line.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? String(vars[key]) : all)) : line
}

/** Dates and times written the language's way. */
export function locale(lang: Lang): string {
  return lang === 'fr' ? 'fr-FR' : 'en-US'
}
