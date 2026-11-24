/**
 * What the Black Cloud Merchant has offered, kept over time (`<userData>/merchant-seen.json`): each
 * item, when it was first and last seen, and the stocks it was in (by when each was replaced), so a
 * pet's card can say how often its soul or unlock is sold, and the pets sold there alone come out.
 */
import { app } from 'electron'
import { readFileSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { tracker } from './tracker.ts'
import type { MerchantSeen } from '../shared/tracker.ts'

/** The stocks remembered per item. */
const STOCKS_KEPT = 200
let seen: MerchantSeen = {}
const file = (): string => join(app.getPath('userData'), 'merchant-seen.json')

export const merchantSeen = { get: (): MerchantSeen => seen }

export function startMerchantSeen(): void {
  try {
    seen = JSON.parse(readFileSync(file(), 'utf8')) as MerchantSeen
  } catch {
    seen = {} // none yet
  }
  tracker.onShop((stocks) => {
    const now = Date.now()
    let changed = false
    for (const stock of stocks)
      for (const it of stock.items) {
        const e = seen[it.item] ?? { first: now, last: now, stocks: [] }
        // A stock is told by when it is replaced (or, unsaid, by the hour it was seen).
        const key = stock.nextAt ?? Math.floor(stock.at / 3_600_000) * 3_600_000
        if (!e.stocks.includes(key)) e.stocks = [...e.stocks, key].slice(-STOCKS_KEPT)
        seen[it.item] = { ...e, last: now }
        changed = true
      }
    if (changed) writeFile(file(), JSON.stringify(seen), () => {})
  })
}
