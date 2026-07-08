/* Match Room core — the SAME topic derivation + wire protocol as the Kickpact
 * mobile worklet (apps/mobile/worklet/room.js) and apps/pear/chat-core.js, so
 * desktop peers land in the same rooms as phones:
 *
 *   topic = hash("kickpact/match/<gameId>")
 *   wire  = newline-JSON {type:"hello"|"msg"|"pact"} over encrypted sockets
 *
 * Runs on Bare (inside the pear-runtime worker) and on Node/Bun (tests).
 * CJS + dependency-injected callbacks so it is unit-testable without a window.
 */
const Hyperswarm = require("hyperswarm")
const crypto = require("hypercore-crypto")
const b4a = require("b4a")

/** The room topic for a given match id (32-byte buffer). */
function topicFor(gameId) {
  return crypto.data(b4a.from(`kickpact/match/${gameId}`))
}

/** Newline-JSON framing for a byte stream: returns a feed(data) function. */
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

/** Build an outgoing chat message. Desktop peers have no wallet → sig:"" and
 * phones render them "⚠ unverified"; pass {sig, from} in extra to sign. */
function makeMsg({ id = "", nick = "desktop-fan", text, extra = {} }) {
  return {
    type: "msg",
    from: id,
    nick,
    text,
    ts: Date.now(),
    sig: "",
    ...extra,
  }
}

/** How a message should be badged in any Kickpact UI. */
function badgeFor(msg) {
  return msg && typeof msg.sig === "string" && msg.sig.length > 0 ? "signed" : "unverified"
}

/**
 * Join a match room. Events fire as plain objects, ready to serialize:
 *   {type:"ready", topic} · {type:"peers", count} · {type:"joined", id, nick}
 *   {type:"msg"|"pact", ...wire} · {type:"log", text}
 */
function createRoom(gameId, { id = "", nick = "desktop-fan", bootstrap, onEvent }) {
  const swarm = bootstrap ? new Hyperswarm({ bootstrap }) : new Hyperswarm()
  const topic = topicFor(gameId)
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
    const drop = () => {
      conns.delete(c)
      emit({ type: "peers", count: conns.size })
    }
    c.on("close", drop)
    c.on("error", drop)
  })

  swarm.join(topic, { server: true, client: true })
  swarm.flush().then(() => emit({ type: "log", text: "announced on the DHT" }))
  emit({ type: "ready", topic: b4a.toString(topic, "hex") })

  return {
    /** Broadcast a chat line (unsigned unless extra carries {sig}). */
    send(text, extra = {}) {
      const m = makeMsg({ id, nick, text, extra })
      const wire = b4a.from(JSON.stringify(m) + "\n")
      for (const c of conns) {
        try {
          c.write(wire)
        } catch {}
      }
      return m
    },
    /** Broadcast a raw pre-built wire message (e.g. a pact proposal). */
    sendRaw(msg) {
      const wire = b4a.from(JSON.stringify(msg) + "\n")
      for (const c of conns) {
        try {
          c.write(wire)
        } catch {}
      }
      return msg
    },
    peers: () => conns.size,
    leave: () => swarm.destroy().catch(() => {}),
  }
}

module.exports = { createRoom, topicFor, framed, makeMsg, badgeFor }
