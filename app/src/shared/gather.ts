/** A gathering's outcome, known as it starts (main/gather.ts). */
export interface GatherForecast {
  outcome: 'ok' | 'rankUp' | 'fail'
  /** It gives twice as much (the game's x2). */
  doubled: boolean
  /** When it started (ms). */
  at: number
}
