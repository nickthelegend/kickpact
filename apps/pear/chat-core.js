/* Shared Match Room core — identical topic + wire protocol as the Kickpact
 * mobile worklet (apps/mobile/worklet/room.js), so desktop peers land in the
 * SAME rooms as phones:
 *   topic = hash("kickpact/match/<gameId>") · newline-JSON {type:"hello"|"msg"|"pact"}
 */
import Hyperswarm from "hyperswarm"
import crypto from "hypercore-crypto"
import b4a from "b4a"

export function joinRoom(gameId, { id = "", nick = "desktop-fan", onMsg, onPeers, onJoined, onReady }) {
  const swarm = new Hyperswarm()
  const topic = crypto.data(b4a.from(`kickpact/match/${gameId}`))
  const conns = new Set()

  const framed = (onLine) => {
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

  swarm.on("connection", (c) => {
    conns.add(c)
    onPeers?.(conns.size)
    c.write(b4a.from(JSON.stringify({ type: "hello", id, nick }) + "\n"))
    c.on("data", framed((o) => {
      if (o.type === "hello") onJoined?.(o)
      else if (o.type === "msg" || o.type === "pact") onMsg?.(o)
    }))
    const drop = () => {
      conns.delete(c)
      onPeers?.(conns.size)
    }
    c.on("close", drop)
    c.on("error", drop)
  })

  swarm.join(topic, { server: true, client: true })
  swarm.flush().then(() => onReady?.())

  return {
    send(text, extra = {}) {
      // Desktop peers have no wallet — messages go out unsigned and phones
      // render them as "⚠ unverified" (the wallet signature is the WDK tie-in).
      const m = { type: "msg", from: id, nick, text, ts: Date.now(), sig: "", ...extra }
      const wire = b4a.from(JSON.stringify(m) + "\n")
      for (const c of conns) {
        try {
          c.write(wire)
        } catch {}
      }
      return m
    },
    peers: () => conns.size,
    leave: () => swarm.destroy().catch(() => {}),
  }
}
