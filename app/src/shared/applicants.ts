/**
 * Join requests to your party: the engine reads every application as it is made (`07 97`), though
 * the game shows only the first until it is answered. Main keeps the list; the widget shows it.
 */

/** One person asking to join: their card, as the application carries it. */
export interface Applicant {
  /** The character's id, which a join (and a cancelled request) names too. */
  character: number
  name: string
  server: number | null
  className: string | null
  level: number | null
  gearScore: number | null
  combatPower: number | null
  /** When it arrived (ms since epoch). */
  at: number
}

export interface Applicants {
  /** Oldest first, as they arrived. */
  list: Applicant[]
  /** When the last one arrived (ms); 0 with none yet. A newer one brings a closed widget back. */
  lastAt: number
}

export const NO_APPLICANTS: Applicants = { list: [], lastAt: 0 }

/** Seconds the widget stays after the last application (the setting's range). */
export const APPLICANTS_HIDE = [10, 300] as const
