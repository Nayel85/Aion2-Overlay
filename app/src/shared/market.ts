/**
 * The players' market (the game's trade broker), as questlog.gg tracks it for each server
 * (`auctionHouse.getItemMarket`): an item's lowest price listed, how many listings, its median over
 * 7 days. Fetched by main (main/market.ts) for your server, for the items the app needs a worth of.
 * A bound item is never listed: it is priced as its tradeable twin (the same name without "(Bound)").
 */
import { ITEMS } from './items.ts'

export interface MarketPrice {
  /** The lowest price listed when questlog last looked, and the median of the last 7 days (Kina); both null when not on the market (bound, never listed). */
  minPrice: number | null
  median7d: number | null
  listings: number
  /** When it was fetched. */
  at: number
}
/** By item id: its price on your server, as last fetched. */
export type MarketPrices = Record<string, MarketPrice>

/** What one is worth on the market: its median over 7 days (the lowest listed jumps about), else its lowest; null when not on it. */
export const marketValue = (p: MarketPrice | undefined): number | null => (p ? (p.median7d ?? p.minPrice) : null)

let twins: Map<string, number> | null = null
/** The item the market lists for this one: itself, or a bound one's tradeable twin (none for a currency). */
export function marketItem(item: number): number {
  const [name, , , kind] = ITEMS[item] ?? []
  if (!name?.endsWith(' (Bound)') || kind === 'currency') return item
  if (!twins) {
    twins = new Map()
    for (const [id, [n]] of Object.entries(ITEMS)) if (!n.endsWith(' (Bound)') && !twins.has(n)) twins.set(n, Number(id))
  }
  return twins.get(name.slice(0, -' (Bound)'.length)) ?? item
}
/** An item's price on the market, as listed itself or as its twin. */
export const priceOf = (prices: MarketPrices, item: number): number | null => marketValue(prices[marketItem(item)])
