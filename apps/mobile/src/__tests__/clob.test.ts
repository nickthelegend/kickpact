/**
 * Unit tests — the Polymarket CLOB client's pure pieces (src/clob.ts).
 * Wire parity with the official SDK is proven in tests/integration/clob-parity.
 * Run: bun test src
 */
import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { ethers } from "ethers"

import {
  CTF_EXCHANGE,
  NEG_RISK_EXCHANGE,
  ORDER_TYPES,
  exchangeFor,
  l2Signature,
  marketBuyAmounts,
  orderDomain,
} from "../clob"

describe("exchange routing", () => {
  test("normal markets sign against the CTF exchange, neg-risk against NegRisk", () => {
    expect(exchangeFor(false)).toBe(CTF_EXCHANGE)
    expect(exchangeFor(true)).toBe(NEG_RISK_EXCHANGE)
    expect(orderDomain(false).verifyingContract).toBe(CTF_EXCHANGE)
    expect(orderDomain(true).verifyingContract).toBe(NEG_RISK_EXCHANGE)
    expect(orderDomain(false).chainId).toBe(137)
  })
})

describe("l2Signature (HMAC request auth)", () => {
  // Polymarket's client base64url-encodes but KEEPS the `=` padding (its wire
  // headers end in `=`), so the reference is standard b64 with +/ swapped —
  // NOT node's unpadded "base64url" digest.
  const reference = (secret: string, msg: string) =>
    createHmac("sha256", Buffer.from(secret, "base64url"))
      .update(msg)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")

  test("matches an independent node:crypto reference (padded base64url)", () => {
    const secret = Buffer.from("kickpact-test-secret-0123456789abcdef").toString("base64url")
    const ts = "1751970000"
    const body = '{"order":{}}'
    expect(l2Signature(secret, ts, "POST", "/order", body)).toBe(reference(secret, `${ts}POST/order${body}`))
  })

  test("no-body requests sign method+path only", () => {
    const secret = Buffer.from("another-secret").toString("base64url")
    expect(l2Signature(secret, "42", "GET", "/orders")).toBe(reference(secret, "42GET/orders"))
  })
})

describe("marketBuyAmounts (SDK-parity rounding, unit level)", () => {
  test("clean price: $5 at 53¢", () => {
    const r = marketBuyAmounts(5, 0.53, 0.01)
    expect(r.makerAmount).toBe("5000000") // $5.00 in 6dp
    expect(Number(r.takerAmount)).toBeGreaterThan(9_433_000) // ≥9.433 shares
    expect(r.tokens).toBeCloseTo(9.4339, 3)
  })

  test("awkward price: $1 at 3¢ hits the roundUp→roundDown fallback", () => {
    const r = marketBuyAmounts(1, 0.03, 0.01)
    expect(r.makerAmount).toBe("1000000")
    expect(r.takerAmount).toBe("33333300") // 33.3333 shares — matches the SDK
  })

  test("order struct field order matches the on-chain Order tuple", () => {
    expect(ORDER_TYPES.Order.map((f) => f.name)).toEqual([
      "salt", "maker", "signer", "taker", "tokenId", "makerAmount",
      "takerAmount", "expiration", "nonce", "feeRateBps", "side", "signatureType",
    ])
  })

  test("a signed order verifies back to the wallet (EIP-712 round-trip)", async () => {
    const wallet = ethers.Wallet.createRandom()
    const order = {
      salt: 12345,
      maker: wallet.address,
      signer: wallet.address,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: "123",
      makerAmount: "1000000",
      takerAmount: "2000000",
      expiration: "0",
      nonce: "0",
      feeRateBps: "0",
      side: 0,
      signatureType: 0,
    }
    const sig = await wallet.signTypedData(orderDomain(false), ORDER_TYPES, order)
    const rec = ethers.verifyTypedData(orderDomain(false), ORDER_TYPES, order, sig)
    expect(rec).toBe(wallet.address)
    // ...and the same struct against the OTHER exchange gives a DIFFERENT digest
    const sig2 = await wallet.signTypedData(orderDomain(true), ORDER_TYPES, order)
    expect(sig2).not.toBe(sig)
  })
})
