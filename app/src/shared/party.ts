/**
 * Your party, for its frames over the game (pages/PartyPage.vue): who is in it, as the game's roster
 * says (`02 97`, A2Tools: name, class, level, combat power, slot), and each member's HP as the game
 * sends it about once a second (`1B 92`), by their entity here.
 */

export interface PartyMember {
  name: string
  slot: number
  level: number
  combatPower: number
  server: number
  className: string | null
  /** Their entity in this zone, once seen: their vitals come by it. */
  entity: number | null
}

/** A member's vitals: HP and its maximum, the flight time left and its most (ms). */
export interface Vitals {
  hp: number
  maxHp: number
  flight: number
  maxFlight: number
  /** When it came (ms). */
  at: number
}

/** A debuff on a member, as the engine's buffs are (a monster's). */
export interface PartyDebuff {
  id: number
  stacks: number
  /** ms, null when not known. */
  endsAt: number | null
  startedAt: number
  skill: number | null
}

export interface Party {
  members: PartyMember[]
  /** By entity. */
  vitals: Record<number, Vitals>
  /** By entity: those with any. */
  debuffs: Record<number, PartyDebuff[]>
}
export const NO_PARTY: Party = { members: [], vitals: {}, debuffs: {} }
