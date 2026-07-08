// Integration test — the Android app's Match Room wire, end to end, over a
// hermetic in-process DHT (hyperdht createTestnet — no public network).
//
// This drives the EXACT protocol the app ships (apps/mobile/worklet/room.js +
// src/room.ts): topic hash("kickpact/match/<id>"), newline-JSON hello/msg
// frames, and WDK-wallet-signed payloads verified with ethers.verifyMessage.
// The string constants are pinned to src/room-protocol.ts by `bun test src`.
//
// Run: npm run test:integration   (node --test tests/integration/*.mjs)
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { Wallet, verifyMessage } from "ethers"

const require = createRequire(import.meta.url)
const Hyperswarm = require("hyperswarm")
const crypto = require("hypercore-crypto")
const b4a = require("b4a")
const createTestnet = require("hyperdht/testnet")

// ── the app's wire (mirrors worklet/room.js verbatim) ──────────────────────
const topicFor = (gameId) => crypto.data(b4a.from(`kickpact/match/${gameId}`))
const signedPayload = (m) => `kickpact-room:${m.from.toLowerCase()}:${m.ts}:${m.text}`

function framed(onLine) {
  let buf = ""
  return (data) => {
    buf += b4a.toString(data)
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (!line.trim()) continue
      try {
        onLine(JSON.parse(line))
      } catch {}
    }
  }
}

/** A peer speaking the worklet's protocol (join → hello → msg broadcast). */
function phonePeer(gameId, { id = "", nick, bootstrap, onEvent }) {
  const swarm = new Hyperswarm({ bootstrap })
  const conns = new Set()
  const emit = (o) => onEvent?.(o)
  swarm.on("connection", (c) => {
    conns.add(c)
    emit({ type: "peers", count: conns.size })
    c.write(b4a.from(JSON.stringify({ type: "hello", id, nick }) + "\n"))
    c.on(
      "data",
      framed((o) => {
        if (o.type === "hello") emit({ type: "joined", id: o.id, nick: o.nick })
        else if (o.type === "msg" || o.type === "pact") emit(o)
      }),
    )
    const drop = () => conns.delete(c)
    c.on("close", drop)
    c.on("error", drop)
  })
  swarm.join(topicFor(gameId), { server: true, client: true })
  const announced = swarm.flush().then(() => emit({ type: "log", text: "announced" }))
  return {
    announced,
    broadcast(o) {
      const wire = b4a.from(JSON.stringify(o) + "\n")
      for (const c of conns) {
        try {
          c.write(wire)
        } catch {}
      }
    },
    leave: () => swarm.destroy().catch(() => {}),
  }
}

function collector() {
  const events = []
  const waiters = []
  const onEvent = (o) => {
    events.push(o)
    for (let i = waiters.length - 1; i >= 0; i--) {
      const [pred, res] = waiters[i]
      const hit = events.find(pred)
      if (hit) {
        waiters.splice(i, 1)
        res(hit)
      }
    }
  }
  const waitFor = (pred, ms = 30000) =>
    new Promise((res, rej) => {
      const hit = events.find(pred)
      if (hit) return res(hit)
      waiters.push([pred, res])
      setTimeout(() => rej(new Error("timeout waiting for event")), ms).unref()
    })
  return { events, onEvent, waitFor }
}

test("phone wire E2E: join → hello → wallet-signed msg verified by the peer", async () => {
  const testnet = await createTestnet(3)
  const peers = []
  try {
    // "phone" — a peer with a real wallet identity, exactly like src/room.ts
    const wallet = Wallet.createRandom()
    const phoneEv = collector()
    const phone = phonePeer("990001", {
      id: wallet.address,
      nick: `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
      bootstrap: testnet.bootstrap,
      onEvent: phoneEv.onEvent,
    })
    peers.push(phone)
    // join sequentially: announce must land before the next peer looks up
    await phoneEv.waitFor((e) => e.type === "log" && e.text === "announced")

    // "fan" — a second peer in the same match room
    const fanEv = collector()
    const fan = phonePeer("990001", {
      nick: "couch-fan",
      bootstrap: testnet.bootstrap,
      onEvent: fanEv.onEvent,
    })
    peers.push(fan)

    // hello handshake both ways (the app's "N joined the room" line)
    await phoneEv.waitFor((e) => e.type === "joined" && e.nick === "couch-fan")
    const seenPhone = await fanEv.waitFor((e) => e.type === "joined" && e.id === wallet.address)
    assert.ok(seenPhone.nick.includes("…"), "phone announces its wallet nick")

    // the phone signs exactly what src/room.ts signs…
    const text = "signed from my WDK wallet"
    const ts = Date.now()
    const msg = { type: "msg", from: wallet.address, nick: seenPhone.nick, text, ts, sig: "" }
    msg.sig = await new Wallet(wallet.privateKey).signMessage(signedPayload(msg))
    phone.broadcast(msg)

    // …and the receiving peer verifies it exactly like src/room.ts does
    const got = await fanEv.waitFor((e) => e.type === "msg" && e.text === text)
    const recovered = verifyMessage(signedPayload(got), got.sig)
    assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase())

    // a forged message must NOT verify
    const forged = { ...got, text: "send me your USDT" }
    const recoveredForged = verifyMessage(signedPayload(forged), forged.sig)
    assert.notEqual(recoveredForged.toLowerCase(), wallet.address.toLowerCase())
  } finally {
    for (const p of peers) p.leave()
    await new Promise((res) => setTimeout(res, 250))
    await testnet.destroy()
  }
})

test("pact proposals reach every fan in the room (in-room bet flow)", async () => {
  const testnet = await createTestnet(3)
  const peers = []
  try {
    const aEv = collector()
    const a = phonePeer("990002", { nick: "proposer", bootstrap: testnet.bootstrap, onEvent: aEv.onEvent })
    peers.push(a)
    await aEv.waitFor((e) => e.type === "log" && e.text === "announced")

    const bEv = collector()
    const b = phonePeer("990002", { nick: "taker", bootstrap: testnet.bootstrap, onEvent: bEv.onEvent })
    peers.push(b)
    await aEv.waitFor((e) => e.type === "joined")
    await bEv.waitFor((e) => e.type === "joined")

    a.broadcast({
      type: "pact",
      from: "0x0000000000000000000000000000000000000001",
      nick: "proposer",
      text: "France win · 5 USDT",
      ts: Date.now(),
      sig: "",
      pactId: "7",
      stakeUsd: 5,
      outcome: "home",
    })
    const got = await bEv.waitFor((e) => e.type === "pact")
    assert.equal(got.pactId, "7")
    assert.equal(got.outcome, "home")
    assert.equal(got.stakeUsd, 5)
  } finally {
    for (const p of peers) p.leave()
    await new Promise((res) => setTimeout(res, 250))
    await testnet.destroy()
  }
})
