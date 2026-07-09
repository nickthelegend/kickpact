/**
 * Polymarket CLOB client (tier 3 — real-money markets, Polygon mainnet).
 *
 * The full in-app trading path, no SDK: EIP-712 L1 auth to derive API creds,
 * HMAC-signed L2 requests, live order-book prices, and EIP-712-signed FOK
 * market orders posted straight to the CLOB. EOA flow (signatureType 0): the
 * WDK wallet is maker, signer and funder — no proxy wallet, no custodian.
 *
 * Buying needs USDC.e + a little POL for gas on Polygon (fund via the in-app
 * Swap/Bridge rails). Every step surfaces the exact CLOB error if it can't
 * proceed — nothing here is mocked.
 */
import { ethers } from "ethers"

export const CLOB_HOST = "https://clob.polymarket.com"
export const POLYGON_RPC = "https://polygon-rpc.com"
export const CHAIN_ID = 137

/** Polymarket's collateral on Polygon is bridged USDC.e (6dp). */
export const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
/** CTF Exchange (normal markets) + NegRisk CTF Exchange (neg-risk markets). */
export const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"
export const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a"

export const exchangeFor = (negRisk: boolean) => (negRisk ? NEG_RISK_EXCHANGE : CTF_EXCHANGE)

// ── EIP-712 shapes ──────────────────────────────────────────────────────────

const L1_DOMAIN = { name: "ClobAuthDomain", version: "1", chainId: CHAIN_ID }
const L1_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
}
const L1_MSG = "This message attests that I control the given wallet"

export const orderDomain = (negRisk: boolean) => ({
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: exchangeFor(negRisk),
})

export const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
}

export interface ApiCreds {
  apiKey: string
  secret: string // base64url HMAC key
  passphrase: string
}

// ── L1 auth: create-or-derive API creds with a wallet signature ─────────────

async function l1Headers(signer: ethers.Signer, nonce = 0) {
  const address = await signer.getAddress()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sig = await (signer as ethers.Wallet).signTypedData(L1_DOMAIN, L1_TYPES, {
    address,
    timestamp,
    nonce,
    message: L1_MSG,
  })
  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: sig,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: String(nonce),
  }
}

/** Create (or deterministically re-derive) the wallet's CLOB API creds. */
export async function deriveApiCreds(signer: ethers.Signer): Promise<ApiCreds> {
  const headers = await l1Headers(signer)
  // try create first (new wallets), fall back to derive (existing)
  const create = await fetch(`${CLOB_HOST}/auth/api-key`, { method: "POST", headers })
  if (create.ok) {
    const j = await create.json()
    return { apiKey: j.apiKey, secret: j.secret, passphrase: j.passphrase }
  }
  const derive = await fetch(`${CLOB_HOST}/auth/derive-api-key`, { headers })
  if (!derive.ok) throw new Error(`CLOB auth failed: HTTP ${derive.status} ${await derive.text()}`)
  const j = await derive.json()
  return { apiKey: j.apiKey, secret: j.secret, passphrase: j.passphrase }
}

// ── L2 auth: HMAC request signing ───────────────────────────────────────────

const b64uToBytes = (s: string) => {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  while (b64.length % 4) b64 += "="
  return ethers.decodeBase64(b64)
}
const bytesToB64u = (b: Uint8Array) =>
  ethers.encodeBase64(b).replace(/\+/g, "-").replace(/\//g, "_")

/** HMAC-SHA256 signature over `${ts}${method}${path}${body}` (base64url). */
export function l2Signature(secret: string, ts: string, method: string, path: string, body?: string): string {
  const msg = `${ts}${method}${path}${body ?? ""}`
  const mac = ethers.computeHmac("sha256", b64uToBytes(secret), ethers.toUtf8Bytes(msg))
  return bytesToB64u(ethers.getBytes(mac))
}

function l2Headers(address: string, creds: ApiCreds, method: string, path: string, body?: string) {
  const ts = String(Math.floor(Date.now() / 1000))
  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: l2Signature(creds.secret, ts, method, path, body),
    POLY_TIMESTAMP: ts,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
    "Content-Type": "application/json",
  }
}

// ── market data ─────────────────────────────────────────────────────────────

/** Best price for a side of a token ("BUY" = what you'd pay). 0..1. */
export async function bestPrice(tokenId: string, side: "BUY" | "SELL"): Promise<number> {
  const res = await fetch(`${CLOB_HOST}/price?token_id=${tokenId}&side=${side}`)
  if (!res.ok) throw new Error(`price: HTTP ${res.status}`)
  const j = await res.json()
  const p = Number(j.price)
  if (!(p > 0 && p < 1)) throw new Error(`no live ${side} price for this outcome`)
  return p
}

/** The market's tick size (price precision), e.g. 0.01 or 0.001. */
export async function tickSize(tokenId: string): Promise<number> {
  try {
    const res = await fetch(`${CLOB_HOST}/tick-size?token_id=${tokenId}`)
    if (!res.ok) return 0.01
    const j = await res.json()
    return Number(j.minimum_tick_size || j.tick_size || 0.01) || 0.01
  } catch {
    return 0.01
  }
}

// ── order build + sign + post ───────────────────────────────────────────────

export interface BuiltOrder {
  order: Record<string, string | number>
  price: number
  usdc: number
  tokens: number
}

// The official client's rounding tables + algorithm (order-builder/helpers.js)
// — replicated exactly, and pinned to the real SDK by a wire-parity test.
const ROUNDING: Record<string, { price: number; size: number; amount: number }> = {
  "0.1": { price: 1, size: 2, amount: 3 },
  "0.01": { price: 2, size: 2, amount: 4 },
  "0.001": { price: 3, size: 2, amount: 5 },
  "0.0001": { price: 4, size: 2, amount: 6 },
}
const decimalPlaces = (n: number) => {
  if (Number.isInteger(n)) return 0
  const s = n.toString()
  const i = s.indexOf(".")
  return i < 0 ? 0 : s.length - i - 1
}
const roundDown = (n: number, d: number) => (decimalPlaces(n) <= d ? n : Math.floor(n * 10 ** d) / 10 ** d)
const roundUp = (n: number, d: number) => (decimalPlaces(n) <= d ? n : Math.ceil(n * 10 ** d) / 10 ** d)
const roundNormal = (n: number, d: number) => (decimalPlaces(n) <= d ? n : Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d)
/** float → 6dp base units, the SDK way (parseUnits on a fixed string). */
const toUnits = (n: number) => String(ethers.parseUnits(n.toFixed(6), 6))

/** The SDK's BUY market-order amount math: returns [makerAmount, takerAmount] in 6dp units. */
export function marketBuyAmounts(usdcAmount: number, price: number, tick: number): { makerAmount: string; takerAmount: string; usdc: number; tokens: number } {
  const cfg = ROUNDING[String(tick)] ?? ROUNDING["0.01"]
  const rawPrice = roundDown(price, cfg.price)
  const rawMakerAmt = roundDown(usdcAmount, cfg.size)
  let rawTakerAmt = rawMakerAmt / rawPrice
  if (decimalPlaces(rawTakerAmt) > cfg.amount) {
    rawTakerAmt = roundUp(rawTakerAmt, cfg.amount + 4)
    if (decimalPlaces(rawTakerAmt) > cfg.amount) rawTakerAmt = roundDown(rawTakerAmt, cfg.amount)
  }
  return { makerAmount: toUnits(rawMakerAmt), takerAmount: toUnits(rawTakerAmt), usdc: rawMakerAmt, tokens: roundNormal(rawTakerAmt, cfg.amount) }
}

/**
 * Build + EIP-712-sign a Fill-or-Kill market BUY: spend `usdcAmount` USDC.e on
 * `tokenId` at the current best ask. Overrides exist for deterministic tests.
 */
export async function buildMarketBuy(
  signer: ethers.Signer,
  opts: {
    tokenId: string
    usdcAmount: number
    negRisk: boolean
    price?: number // override (else live best ask)
    tick?: number // override (else live tick size)
    salt?: number // override (else random)
    feeRateBps?: number
  },
): Promise<BuiltOrder> {
  const address = await signer.getAddress()
  const tick = opts.tick ?? (await tickSize(opts.tokenId))
  const price = opts.price ?? (await bestPrice(opts.tokenId, "BUY"))
  const { makerAmount, takerAmount, usdc, tokens } = marketBuyAmounts(opts.usdcAmount, price, tick)

  const salt = opts.salt ?? Number(BigInt(ethers.hexlify(ethers.randomBytes(5))))
  const order = {
    salt,
    maker: address,
    signer: address,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: opts.tokenId,
    makerAmount,
    takerAmount,
    expiration: "0",
    nonce: "0",
    feeRateBps: String(opts.feeRateBps ?? 0),
    side: 0, // BUY (uint8 in the EIP-712 struct)
    signatureType: 0, // EOA
  }
  const signature = await (signer as ethers.Wallet).signTypedData(
    orderDomain(opts.negRisk),
    ORDER_TYPES,
    order,
  )
  // wire shape (orderToJson): side as string, salt as number
  return { order: { ...order, side: "BUY", signature } as any, price, usdc, tokens }
}

/** Post a signed FOK order to the CLOB. Returns the exchange response. */
export async function postOrder(
  signer: ethers.Signer,
  creds: ApiCreds,
  built: BuiltOrder,
): Promise<{ ok: boolean; status: number; body: any }> {
  const address = await signer.getAddress()
  // exact wire shape of the official client's orderToJson (v5.8.x)
  const body = JSON.stringify({
    deferExec: false,
    order: built.order,
    owner: creds.apiKey,
    orderType: "FOK",
    postOnly: false,
  })
  const res = await fetch(`${CLOB_HOST}/order`, {
    method: "POST",
    headers: l2Headers(address, creds, "POST", "/order", body),
    body,
  })
  let j: any = null
  try {
    j = await res.json()
  } catch {
    j = { error: await res.text().catch(() => `HTTP ${res.status}`) }
  }
  return { ok: res.ok && !j?.error, status: res.status, body: j }
}

// ── funding helpers (Polygon) ───────────────────────────────────────────────

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]

export function polygonProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(POLYGON_RPC, CHAIN_ID, { staticNetwork: true })
}

export async function usdceBalance(address: string): Promise<bigint> {
  const c = new ethers.Contract(USDCE, ERC20, polygonProvider())
  return await c.balanceOf(address)
}

export async function usdceAllowance(address: string, negRisk: boolean): Promise<bigint> {
  const c = new ethers.Contract(USDCE, ERC20, polygonProvider())
  return await c.allowance(address, exchangeFor(negRisk))
}

/** Approve the exchange to pull USDC.e (one-time per exchange). */
export async function approveUsdce(signer: ethers.Signer, negRisk: boolean): Promise<string> {
  const c = new ethers.Contract(USDCE, ERC20, signer)
  const tx = await c.approve(exchangeFor(negRisk), ethers.MaxUint256)
  await tx.wait()
  return tx.hash
}

/** Human-readable summary of why an order can't fill yet (or null if funded). */
export async function fundingGap(address: string, usdcAmount: number, negRisk: boolean): Promise<string | null> {
  const [bal, allow, pol] = await Promise.all([
    usdceBalance(address),
    usdceAllowance(address, negRisk),
    polygonProvider().getBalance(address),
  ])
  const need = BigInt(Math.round(usdcAmount * 1e6))
  if (bal < need) return `needs ${usdcAmount} USDC.e on Polygon (have ${ethers.formatUnits(bal, 6)}) — fund via Swap/Bridge`
  if (pol === 0n && allow < need) return "needs a little POL on Polygon for the one-time USDC approval"
  if (allow < need) return "APPROVE_REQUIRED"
  return null
}
