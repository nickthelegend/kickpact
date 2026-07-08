/**
 * Unit tests — group-pool helpers (src/pool.ts). The gameKey + pick encodings
 * are the contract the app AND the settle-keeper share; if these drift, pools
 * would never settle.
 * Run: bun test src
 */
import { describe, expect, test } from "bun:test"
import { ethers } from "ethers"

import { OUTCOMES, gameKey, gameTag, pickCode, pickName } from "../pool"

describe("gameKey", () => {
  test("is keccak256 of the deterministic WC#<id> tag (keeper parity)", () => {
    expect(gameTag("760510")).toBe("WC#760510")
    expect(gameKey("760510")).toBe(ethers.keccak256(ethers.toUtf8Bytes("WC#760510")))
  })

  test("different matches never collide", () => {
    expect(gameKey("760510")).not.toBe(gameKey("760511"))
  })
})

describe("pick encoding (contract: 1=home 2=draw 3=away)", () => {
  test("codes match the contract constants", () => {
    expect(pickCode("home")).toBe(1)
    expect(pickCode("draw")).toBe(2)
    expect(pickCode("away")).toBe(3)
  })

  test("round-trips through pickName", () => {
    for (const o of OUTCOMES) expect(pickName(pickCode(o))).toBe(o)
    expect(pickName(0)).toBeNull()
    expect(pickName(4)).toBeNull()
  })
})
