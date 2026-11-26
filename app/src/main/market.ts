/**
 * Market prices for your server (shared/market.ts), from questlog.gg's market (`auctionHouse.getItemMarket`,
 * every server's at once): asked for the items the app needs a worth of (`wantPrices`: the duty
 * board's rewards), one at a time with a pause, and kept in `<userData>/market-prices.json` by server.
 * One fetched within FRESH_MS is not asked again; one not on the market, within GONE_MS.
 */
import { broadcast } from './broadcast.ts'
import { dataFile } from './dataFile.ts'
import { log, tracker } from './tracker.ts'
import type { MarketPrice, MarketPrices } from '../shared/market.ts'

const API = 'https://questlog.gg/aion-2/api/trpc'
const HEADERS = { 'user-agent': 'nayel-overlay (personal Aion 2 overlay)', accept: 'application/json' }
const FRESH_MS = 6 * 3_600_000
const GONE_MS = 24 * 3_600_000
const PAUSE_MS = 300

interface Saved {
  /** The server last played on: its prices shown while none is (the app started before the game). */
  server: number | null
  byServer: Record<string, MarketPrices>
}
interface Row {
  serverId: number
  market: string
  minPrice?: number
  median7d?: number
  listings?: number
}

const file = dataFile('market-prices.json', 2000)
let saved: Saved = { server: null, byServer: {} }
const queue = new Set<number>()
let working = false

const server = (): number | null => tracker.status().server ?? saved.server

/** Your server's prices, as known. */
export const marketStore = {
  get: (): MarketPrices => {
    const s = server()
    return s === null ? {} : (saved.byServer[s] ?? {})
  },
}

/** To be asked again: never asked, or asked too long ago (longer for one not on the market). */
const due = (p: MarketPrice | undefined): boolean => !p || Date.now() - p.at > (p.median7d === null && p.minPrice === null ? GONE_MS : FRESH_MS)

/** Ask for these items' prices (those not known, or old). */
export function wantPrices(items: number[]): void {
  const s = server()
  if (s === null) return
  const known = saved.byServer[s] ?? {}
  for (const item of items) if (due(known[item])) queue.add(item)
  void work()
}

async function work(): Promise<void> {
  if (working) return
  working = true
  try {
    while (queue.size) {
      const s = server()
      if (s === null) break
      const item = queue.values().next().value!
      queue.delete(item)
      try {
        const res = await fetch(`${API}/auctionHouse.getItemMarket?input=${encodeURIComponent(JSON.stringify({ itemId: item }))}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rows = ((await res.json()) as { result?: { data?: Row[] } }).result?.data ?? []
        const row = rows.find((r) => r.serverId === s && r.market === 'market')
        ;(saved.byServer[s] ??= {})[item] = { minPrice: row?.minPrice ?? null, median7d: row?.median7d ?? null, listings: row?.listings ?? 0, at: Date.now() }
        saved.server = s
        file.save(() => saved)
        broadcast('market:changed', marketStore.get())
      } catch (err) {
        log(`market: ${item}'s price not read: ${String(err)}`)
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }
  } finally {
    working = false
  }
}

export function startMarket(): void {
  const read = file.read() as Partial<Saved> | null
  saved = { server: read?.server ?? null, byServer: read?.byServer ?? {} }
}
