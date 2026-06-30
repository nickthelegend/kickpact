/**
 * Polymarket (tier 3 — real-money CLOB on Polygon mainnet). Reads live markets
 * + odds from Polymarket's public Gamma API (no auth needed for reads). This is
 * the real-money counterpart to the testnet Pacts/Duels: same World Cup, real
 * order-book prices. Trading deep-links to Polymarket (in-app CLOB order signing
 * is the next step — needs USDC + API-key auth on Polygon).
 */
const GAMMA = "https://gamma-api.polymarket.com"

export interface PolyMarket {
  id: string
  question: string
  group?: string // e.g. "USA" (groupItemTitle)
  outcomes: string[] // e.g. ["Yes","No"]
  prices: number[] // parallel to outcomes, 0..1
  tokenIds: string[] // CLOB token ids parallel to outcomes
  volume: number
  liquidity: number
  image?: string
  slug?: string
  endDate?: string
}

function parseMarket(m: any): PolyMarket | null {
  try {
    const outcomes = JSON.parse(m.outcomes || "[]")
    const prices = JSON.parse(m.outcomePrices || "[]").map(Number)
    const tokenIds = JSON.parse(m.clobTokenIds || "[]")
    if (!outcomes.length || !prices.length) return null
    return {
      id: String(m.id),
      question: m.question || "",
      group: m.groupItemTitle || undefined,
      outcomes,
      prices,
      tokenIds,
      volume: Number(m.volumeNum || 0),
      liquidity: Number(m.liquidityNum || 0),
      image: m.image || m.icon || undefined,
      slug: m.slug || undefined,
      endDate: m.endDate || undefined,
    }
  } catch {
    return null
  }
}

let cache: { at: number; key: string; data: PolyMarket[] } | null = null

/** Live open markets ordered by volume; optional client-side text filter. */
export async function fetchMarkets(opts?: { limit?: number; query?: string }): Promise<PolyMarket[]> {
  const limit = opts?.limit ?? 40
  const key = `${limit}:${opts?.query ?? ""}`
  if (cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.data
  const url = `${GAMMA}/markets?closed=false&active=true&limit=${limit}&order=volumeNum&ascending=false`
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : data.data || []
      let markets = arr.map(parseMarket).filter(Boolean) as PolyMarket[]
      if (opts?.query) {
        const q = opts.query.toLowerCase()
        markets = markets.filter((m) => m.question.toLowerCase().includes(q) || (m.group || "").toLowerCase().includes(q))
      }
      if (markets.length) cache = { at: Date.now(), key, data: markets }
      return markets
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("failed to load markets")
}

export const marketUrl = (m: PolyMarket) => `https://polymarket.com/event/${m.slug ?? ""}`

/** A 0..1 price as cents, e.g. 0.0305 -> "3¢". */
export const toCents = (p: number) => `${Math.round(p * 100)}¢`
/** A 0..1 price as a percentage, e.g. 0.0305 -> "3%". */
export const toPct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`

export function fmtVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
