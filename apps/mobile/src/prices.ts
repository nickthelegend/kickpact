/**
 * Real crypto spot prices (Binance) — the settlement source for duel cards.
 *
 * A duel card is a binary market: "will <asset> be UP from <strike>?" The strike
 * is the asset's price at deck creation (scaled to integer cents = on-chain
 * units). At settle time the oracle posts the *current* price, so the outcome is
 * the real short-term move — no more Math.random(). Card→asset is recovered from
 * the on-chain strike by nearest price magnitude, so no off-chain metadata is
 * needed (assets span very different price ranges: BTC ~$60k … DOGE ~$0.07).
 */
export interface Asset {
  symbol: string
  name: string
  binance: string
}

export const ASSETS: Asset[] = [
  { symbol: "BTC", name: "Bitcoin", binance: "BTCUSDT" },
  { symbol: "ETH", name: "Ethereum", binance: "ETHUSDT" },
  { symbol: "SOL", name: "Solana", binance: "SOLUSDT" },
  { symbol: "BNB", name: "BNB", binance: "BNBUSDT" },
  { symbol: "XRP", name: "XRP", binance: "XRPUSDT" },
  { symbol: "DOGE", name: "Dogecoin", binance: "DOGEUSDT" },
]

export interface Ticker {
  symbol: string
  price: number
  changePct: number
}

const BINANCE = "https://api.binance.com/api/v3/ticker/24hr"
let cache: { at: number; map: Map<string, Ticker> } | null = null

export async function fetchTickers(): Promise<Map<string, Ticker>> {
  if (cache && Date.now() - cache.at < 8_000) return cache.map
  const res = await fetch(BINANCE)
  const all = (await res.json()) as { symbol: string; lastPrice: string; priceChangePercent: string }[]
  const map = new Map<string, Ticker>()
  for (const a of ASSETS) {
    const t = all.find((x) => x.symbol === a.binance)
    if (t) map.set(a.symbol, { symbol: a.symbol, price: Number(t.lastPrice), changePct: Number(t.priceChangePercent) })
  }
  cache = { at: Date.now(), map }
  return map
}

/** Price → integer cents (on-chain strike / settlementPrice units). */
export const toStrike = (price: number): bigint => BigInt(Math.round(price * 100))
export const fromStrike = (strike: bigint): number => Number(strike) / 100

/** Recover a card's asset from its on-chain strike by nearest price magnitude. */
export function assetForStrike(strike: bigint, tickers: Map<string, Ticker>): Asset | null {
  const target = fromStrike(strike)
  if (target <= 0) return null
  let best: Asset | null = null
  let bestRatio = Infinity
  for (const a of ASSETS) {
    const t = tickers.get(a.symbol)
    if (!t || t.price <= 0) continue
    const ratio = Math.max(target, t.price) / Math.min(target, t.price)
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = a
    }
  }
  return best
}

export const priceLabel = (n: number): string =>
  n >= 1000 ? "$" + Math.round(n).toLocaleString() : n >= 1 ? "$" + n.toFixed(2) : "$" + n.toFixed(4)
