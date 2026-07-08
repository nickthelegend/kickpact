// Integration test — WIRE PARITY with the official @polymarket/clob-client.
//
// The app's hand-rolled CLOB client (src/clob.ts) must produce EXACTLY the
// bytes the official SDK produces: same EIP-712 domain/struct (so the same
// wallet yields the SAME signature), same rounding math, same order JSON.
// This runs fully offline (no CLOB server), so it can't be geo-blocked and
// proves the trading path's correctness everywhere, including CI.
//
// Run: npm run test:integration
import { test } from "node:test"
import assert from "node:assert/strict"
import { Wallet as Wallet6 } from "ethers"
import { Wallet as Wallet5 } from "ethers5"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

// createMarketOrder/orderToJson aren't re-exported from the package root —
// import the dist modules directly (resolved via the package's real location).
const require = createRequire(import.meta.url)
const clobRoot = path.dirname(require.resolve("@polymarket/clob-client/package.json"))
const { createMarketOrder } = await import(pathToFileURL(path.join(clobRoot, "dist", "order-builder", "helpers.js")).href)
const { orderToJson } = await import(pathToFileURL(path.join(clobRoot, "dist", "utilities.js")).href)
const mod = await import("../../src/clob.ts")

// one fixed wallet on both sides
const PRIV = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
const TOKEN = "69910730841487615802736046038473620030754616421912831175284551372639933569112"

async function officialOrder({ negRisk, price, amount, feeRateBps }) {
  const w5 = new Wallet5(PRIV)
  const signed = await createMarketOrder(
    w5,
    137, // Polygon
    0, // SignatureType.EOA
    await w5.getAddress(), // funder = EOA
    { tokenID: TOKEN, amount, side: "BUY", price, feeRateBps, orderType: "FOK" },
    { tickSize: "0.01", negRisk },
  )
  return orderToJson(signed, "test-owner", "FOK").order
}

for (const negRisk of [false, true]) {
  test(`order bytes identical to the official SDK (negRisk=${negRisk})`, async () => {
    const official = await officialOrder({ negRisk, price: 0.53, amount: 5, feeRateBps: 0 })

    const mine = await mod.buildMarketBuy(new Wallet6(PRIV), {
      tokenId: TOKEN,
      usdcAmount: 5,
      negRisk,
      price: 0.53,
      tick: 0.01,
      feeRateBps: 0,
      salt: official.salt, // salt is random — inject theirs, everything else must match
    })

    // identical wire fields…
    assert.deepEqual(
      { ...mine.order },
      { ...official },
      "order JSON must match the official client byte-for-byte",
    )
    // …including the EIP-712 signature: same domain + struct + wallet ⇒ same sig
    assert.equal(mine.order.signature, official.signature, "EIP-712 signature parity")
  })
}

test("amount math matches the SDK's rounding on awkward prices", async () => {
  // 1 / 0.03 = 33.333… — exercises the roundUp(+4)→roundDown fallback
  const official = await officialOrder({ negRisk: false, price: 0.03, amount: 1, feeRateBps: 0 })
  const m = mod.marketBuyAmounts(1, 0.03, 0.01)
  assert.equal(m.makerAmount, official.makerAmount)
  assert.equal(m.takerAmount, official.takerAmount)
})
