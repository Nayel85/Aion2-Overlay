/**
 * Numbers and durations written the same way in every window: as the game writes them (123,186;
 * 1.92K; 12.3M) and as a clock (1:05, 1:02:05). The ones that depend on the language (ago, a time of
 * day, a date) are the windows' own: renderer/src/lib/format.ts.
 */

/**
 * A number in short: as it is under 1,000 (grouped by thousands), then in thousands (K), millions
 * (M) or billions (B), with two decimals under 10, one under 100, none above (1.92K, 12.3K, 123K).
 */
export function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs < 1000) return Math.round(n).toLocaleString('en-US')
  for (const [size, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (abs < size) continue
    const v = n / size
    const a = Math.abs(v)
    return `${v.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0)}${unit}`
  }
  return String(n)
}

/** A duration as a clock: 1:05, 1:02:05 past an hour. `up`: a countdown, its seconds rounded up. */
export function duration(ms: number, up = false): string {
  const s = Math.max(0, up ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** A share as a percentage: 0.5 → 50%. */
export const percent = (share: number, digits = 0): string => `${(share * 100).toFixed(digits)}%`

/** A combat power, short: 192.3K (to a tenth of a thousand, never rounded up), as every page shows it. */
export const combatPower = (v: number): string => (v >= 1000 ? `${(Math.floor(v / 100) / 10).toFixed(1)}K` : String(v))
