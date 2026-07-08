// Unit tests — workers/room-core.js (pure parts: topic, framing, messages).
// Run: npm test  (node --test test/unit/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { topicFor, framed, makeMsg, badgeFor } = require("../../workers/room-core.js")
const crypto = require("hypercore-crypto")
const b4a = require("b4a")

test("topicFor derives the exact cross-platform room topic", () => {
  // Must equal hash("kickpact/match/<gameId>") — the constant shared with the
  // mobile worklet (apps/mobile/worklet/room.js) and apps/pear/chat-core.js.
  const t = topicFor("760510")
  const expected = crypto.data(b4a.from("kickpact/match/760510"))
  assert.equal(b4a.toString(t, "hex"), b4a.toString(expected, "hex"))
  assert.equal(t.length, 32)
})

test("topicFor differs per match (no cross-room bleed)", () => {
  assert.notEqual(
    b4a.toString(topicFor("760510"), "hex"),
    b4a.toString(topicFor("760511"), "hex"),
  )
})

test("framed() reassembles newline-JSON split across arbitrary chunks", () => {
  const seen = []
  const feed = framed((o) => seen.push(o))
  const wire = JSON.stringify({ type: "msg", text: "GOAL!" }) + "\n" + JSON.stringify({ type: "hello", nick: "fan" }) + "\n"
  // deliver byte-by-byte — worst-case TCP fragmentation
  for (const ch of wire) feed(b4a.from(ch))
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[0], { type: "msg", text: "GOAL!" })
  assert.deepEqual(seen[1], { type: "hello", nick: "fan" })
})

test("framed() survives garbage lines without dropping the stream", () => {
  const seen = []
  const feed = framed((o) => seen.push(o))
  feed(b4a.from('not-json\n{"type":"msg","text":"ok"}\n\n'))
  assert.equal(seen.length, 1)
  assert.equal(seen[0].text, "ok")
})

test("makeMsg builds the exact wire shape (unsigned desktop peer)", () => {
  const m = makeMsg({ id: "", nick: "desktop-fan", text: "hi" })
  assert.equal(m.type, "msg")
  assert.equal(m.from, "")
  assert.equal(m.nick, "desktop-fan")
  assert.equal(m.text, "hi")
  assert.equal(m.sig, "")
  assert.equal(typeof m.ts, "number")
})

test("makeMsg extra can carry a signature + wallet identity (phone shape)", () => {
  const m = makeMsg({
    id: "0xAbC0000000000000000000000000000000000001",
    nick: "0xAbC0…0001",
    text: "hi",
    extra: { sig: "0xdeadbeef" },
  })
  assert.equal(m.sig, "0xdeadbeef")
  assert.equal(m.from, "0xAbC0000000000000000000000000000000000001")
})

test("badgeFor maps signatures to UI badges", () => {
  assert.equal(badgeFor({ sig: "0xabc" }), "signed")
  assert.equal(badgeFor({ sig: "" }), "unverified")
  assert.equal(badgeFor({}), "unverified")
  assert.equal(badgeFor(null), "unverified")
})
