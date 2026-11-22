/**
 * The guild, as the Lokthar site has it (main/guild.ts): your characters as the site keeps them
 * (which one is your main) and every member of your roster with all their characters, their gear
 * score, combat power and Odyle energy. The overlay sends what the game says of yours (class, level,
 * gear score, combat power, the recharge counters); the site sends the rest back.
 */

/** A recharge counter as the site worked it out when it answered. */
export interface SiteCounter {
  value: number
  /** The charged part, which does not refill. */
  extra: number
  max: number
  per: number
  /** ms since epoch. */
  nextAt: number
  fullAt: number
  readAt: number
}

export interface GuildCharacter {
  name: string
  server: number | null
  className: string | null
  level: number | null
  gearScore: number | null
  combatPower: number | null
  /** The member's main, by their own registration on the site. */
  main: boolean
  portraitUrl: string | null
  legion: string | null
  /** When the overlay last reported them (ms); null for one only NCSoft's data has. */
  reportedAt: number | null
  energy: SiteCounter | null
  nightmare: SiteCounter | null
  ascension: SiteCounter | null
}

export interface GuildMember {
  /** Their main's name. */
  name: string
  /** You. */
  you: boolean
  characters: GuildCharacter[]
}

export type GuildSyncState =
  /** Turned off (Settings → Lokthar site). */
  | 'off'
  /** No character seen yet to be known by. */
  | 'waiting'
  | 'loading'
  | 'ok'
  /** None of your characters is on an Aion 2 roster of the site: nothing is sent or shown. */
  | 'notMember'
  | 'error'

export interface GuildState {
  state: GuildSyncState
  message: string | null
  roster: string | null
  /** Your main, as the site has it. */
  main: { name: string; server: number } | null
  members: GuildMember[]
  /** When the site last answered (ms); 0 before. */
  at: number
}

export const NO_GUILD: GuildState = { state: 'off', message: null, roster: null, main: null, members: [], at: 0 }
