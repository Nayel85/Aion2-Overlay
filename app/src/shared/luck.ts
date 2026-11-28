/**
 * Your luck as a verdict, for the Stats page: what you got against what the game's rates make
 * expected, over some counts at once (a character's gold drops, procs, doublings...). Each count is
 * a Poisson draw of its expected mean; its place among the draws (mid-p: half the chance of just
 * that count) is turned into a normal score, the scores are put together (Stouffer: their sum over
 * the root of how many), and the share of players with less luck read back from that. So a count
 * far from its mean weighs more the more is expected of it: one drop missing of two says little.
 */

/** From the worst luck to the best. */
export const LUCK_LEVELS = ['No luck at all', 'Unlucky', 'Normal luck', 'Lucky', 'Very lucky'] as const
export type LuckLevel = 0 | 1 | 2 | 3 | 4
/** A level's lowest share of luckier-than: below 10% no luck at all, from 90% very lucky. */
const BOUNDS = [0.1, 0.3, 0.7, 0.9]

export interface LuckVerdict {
  level: LuckLevel
  /** The share of players (0..1) with less luck than that over the same counts. */
  beats: number
}

/** The verdict over `[got, expected]` counts, those with nothing to expect left out; null with none left. */
export function luckVerdict(counts: readonly (readonly [got: number, expected: number | null])[]): LuckVerdict | null {
  const scores = counts.filter(([, e]) => e !== null && e > 0).map(([got, e]) => probit(poissonMidP(got, e!)))
  if (!scores.length) return null
  const beats = normalCdf(scores.reduce((a, b) => a + b, 0) / Math.sqrt(scores.length))
  return { level: BOUNDS.filter((b) => beats >= b).length as LuckLevel, beats }
}

/** P(X < got) + P(X = got) / 2 for X a Poisson draw of mean `mean`; its normal reading past 200. */
function poissonMidP(got: number, mean: number): number {
  if (mean > 200) return normalCdf((got - mean) / Math.sqrt(mean))
  const k = Math.round(got)
  let pmf = Math.exp(-mean)
  let below = 0
  for (let i = 0; i < k; i++) {
    below += pmf
    pmf *= mean / (i + 1)
  }
  return Math.min(1, below + pmf / 2)
}

/** The standard normal's distribution (Abramowitz and Stegun's 7.1.26 for erf). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** Its inverse (Acklam's), clamped off 0 and 1. */
function probit(p: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p))
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const tail = (r: number): number => (((((c[0]! * r + c[1]!) * r + c[2]!) * r + c[3]!) * r + c[4]!) * r + c[5]!) / ((((d[0]! * r + d[1]!) * r + d[2]!) * r + d[3]!) * r + 1)
  if (q < 0.02425) return tail(Math.sqrt(-2 * Math.log(q)))
  if (q > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - q)))
  const r = (q - 0.5) ** 2
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * (q - 0.5)) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
}
