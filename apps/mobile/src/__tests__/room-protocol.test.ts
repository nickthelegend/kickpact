/**
 * Unit tests — the Match Room wire protocol (src/room-protocol.ts).
 * Run: bun test src
 */
import { describe, expect, test } from "bun:test"
import { ethers } from "ethers"

import { encodeLine, makeLineDecoder, signedPayload, topicString } from "../room-protocol"

describe("topicString", () => {
  test("derives the cross-platform room topic string", () => {
    // Must match the Bare worklet, the desktop app and the Pear CLI byte-for-byte.
    expect(topicString("760510")).toBe("kickpact/match/760510")
  })
})

describe("signedPayload", () => {
  test("is the exact string every peer verifies", () => {
    const m = { from: "0xAbCdEF0000000000000000000000000000000001", text: "GOAL!", ts: 1751970000000 }
    expect(signedPayload(m)).toBe(
      "kickpact-room:0xabcdef0000000000000000000000000000000001:1751970000000:GOAL!",
    )
  })

  test("lowercases the address so checksum casing can't break verification", () => {
    const a = signedPayload({ from: "0xABC0000000000000000000000000000000000001", text: "x", ts: 1 })
    const b = signedPayload({ from: "0xabc0000000000000000000000000000000000001", text: "x", ts: 1 })
    expect(a).toBe(b)
  })

  test("wallet-signed payload round-trips through ethers.verifyMessage", async () => {
    // The exact flow of MatchRoom.send() → peer verification.
    const wallet = ethers.Wallet.createRandom()
    const m = { from: wallet.address, text: "signed from my WDK wallet", ts: Date.now() }
    const sig = await wallet.signMessage(signedPayload(m))
    const recovered = ethers.verifyMessage(signedPayload(m), sig)
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase())
  })

  test("a tampered message no longer verifies", async () => {
    const wallet = ethers.Wallet.createRandom()
    const m = { from: wallet.address, text: "original", ts: Date.now() }
    const sig = await wallet.signMessage(signedPayload(m))
    const recovered = ethers.verifyMessage(signedPayload({ ...m, text: "tampered" }), sig)
    expect(recovered.toLowerCase()).not.toBe(wallet.address.toLowerCase())
  })
})

describe("makeLineDecoder", () => {
  test("reassembles messages split across arbitrary chunks", () => {
    const seen: any[] = []
    const feed = makeLineDecoder((o) => seen.push(o))
    const wire = encodeLine({ type: "msg", text: "GOAL!" }) + encodeLine({ type: "peers", count: 2 })
    for (const ch of wire) feed(ch) // worst-case: one byte at a time
    expect(seen).toEqual([
      { type: "msg", text: "GOAL!" },
      { type: "peers", count: 2 },
    ])
  })

  test("skips garbage lines without dropping the stream", () => {
    const seen: any[] = []
    const feed = makeLineDecoder((o) => seen.push(o))
    feed("not-json\n" + encodeLine({ type: "msg", text: "ok" }) + "\n")
    expect(seen).toEqual([{ type: "msg", text: "ok" }])
  })

  test("holds partial lines until the newline arrives", () => {
    const seen: any[] = []
    const feed = makeLineDecoder((o) => seen.push(o))
    feed('{"type":"msg","te')
    expect(seen).toEqual([])
    feed('xt":"split"}\n')
    expect(seen).toEqual([{ type: "msg", text: "split" }])
  })
})
