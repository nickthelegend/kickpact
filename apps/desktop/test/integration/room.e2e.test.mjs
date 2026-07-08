// Integration tests — the real Hyperswarm room on a hermetic local DHT.
// No public network: hyperdht's createTestnet() runs bootstrap nodes in-process,
// and each test gets its own testnet + rooms (clean teardown, no cross-talk).
// Run: npm run test:integration
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { Wallet, verifyMessage } from "ethers"

const require = createRequire(import.meta.url)
const { createRoom } = require("../../workers/room-core.js")
const createTestnet = require("hyperdht/testnet")

function instrument(r) {
  return r
}

async function withRooms(specs, fn) {
  const testnet = await createTestnet(3)
  const rooms = []
  const make = (gameId, opts = {}) => {
    const events = []
    const waiters = []
    const r = createRoom(gameId, {
      ...opts,
      bootstrap: testnet.bootstrap,
      onEvent: (o) => {
        events.push(o)
        for (let i = waiters.length - 1; i >= 0; i--) {
          const [pred, res] = waiters[i]
          const hit = events.find(pred)
          if (hit) {
            waiters.splice(i, 1)
            res(hit)
          }
        }
      },
    })
    r.events = events
    r.waitFor = (pred, ms = 30000) =>
      new Promise((res, rej) => {
        const hit = events.find(pred)
        if (hit) return res(hit)
        waiters.push([pred, res])
        setTimeout(() => rej(new Error("timeout waiting for event")), ms).unref()
      })
    rooms.push(r)
    return instrument(r)
  }
  try {
    // Join SEQUENTIALLY: each peer must finish announcing on the DHT before
    // the next joins, or both initial lookups race to an empty topic and sit
    // out hyperswarm's long refresh timer (real fans join minutes apart).
    const made = []
    for (const [gameId, opts] of specs) {
      const r = make(gameId, opts)
      await r.waitFor((e) => e.type === "log" && e.text === "announced on the DHT")
      made.push(r)
    }
    await fn(...made, make)
  } finally {
    for (const r of rooms) r.leave()
    await new Promise((res) => setTimeout(res, 250))
    await testnet.destroy()
  }
}

test("two desktop peers meet in the same match room and chat", async () => {
  await withRooms(
    [
      ["880001", { nick: "tv-couch" }],
      ["880001", { nick: "couch-fan" }],
    ],
    async (a, b) => {
      await a.waitFor((e) => e.type === "joined" && e.nick === "couch-fan")
      await b.waitFor((e) => e.type === "joined" && e.nick === "tv-couch")

      a.send("GOAL! what a strike")
      const got = await b.waitFor((e) => e.type === "msg" && e.text === "GOAL! what a strike")
      assert.equal(got.nick, "tv-couch")
      assert.equal(got.sig, "") // desktop peers are unsigned
    },
  )
})

test("peers in different match rooms never see each other", async () => {
  await withRooms(
    [
      ["880002", { nick: "room-a" }],
      ["880003", { nick: "room-b" }],
    ],
    async (a, b) => {
      a.send("secret")
      await new Promise((res) => setTimeout(res, 3000))
      assert.equal(
        b.events.filter((e) => e.type === "msg" || e.type === "joined").length,
        0,
        "cross-room leak",
      )
    },
  )
})

test("a wallet-signed phone-style message verifies on the receiving peer", async () => {
  // Mirrors the mobile app exactly (apps/mobile/src/room.ts): payload is
  // `kickpact-room:<addr>:<ts>:<text>`, signed with the WDK wallet key.
  const wallet = Wallet.createRandom()
  await withRooms(
    [
      ["880004", { id: wallet.address, nick: "phone" }],
      ["880004", { nick: "desk" }],
    ],
    async (phone, desk) => {
      await phone.waitFor((e) => e.type === "joined" && e.nick === "desk")
      await desk.waitFor((e) => e.type === "joined")

      const text = "signed from my WDK wallet"
      const ts = Date.now()
      const payload = `kickpact-room:${wallet.address.toLowerCase()}:${ts}:${text}`
      const sig = await wallet.signMessage(payload)
      phone.sendRaw({ type: "msg", from: wallet.address, nick: "phone", text, ts, sig })

      const got = await desk.waitFor((e) => e.type === "msg" && e.sig)
      // ...and the receiver verifies it against the sender's wallet address,
      // exactly as the phone does with ethers.verifyMessage.
      const rec = verifyMessage(
        `kickpact-room:${got.from.toLowerCase()}:${got.ts}:${got.text}`,
        got.sig,
      )
      assert.equal(rec.toLowerCase(), wallet.address.toLowerCase())
    },
  )
})

test("pact proposals pass through the wire untouched", async () => {
  await withRooms(
    [
      ["880005", { nick: "proposer" }],
      ["880005", { nick: "taker" }],
    ],
    async (a, b) => {
      await a.waitFor((e) => e.type === "joined")
      await b.waitFor((e) => e.type === "joined")

      a.sendRaw({
        type: "pact",
        from: "",
        nick: "proposer",
        text: "France win · 5 USDT",
        ts: Date.now(),
        sig: "",
        pactId: "42",
        stakeUsd: 5,
        outcome: "home",
      })
      const got = await b.waitFor((e) => e.type === "pact")
      assert.equal(got.pactId, "42")
      assert.equal(got.stakeUsd, 5)
      assert.equal(got.outcome, "home")
    },
  )
})
