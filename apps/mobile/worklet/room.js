/* Match Room worklet — runs inside Bare (react-native-bare-kit) on the phone.
 *
 * P2P watch-party chat over Hyperswarm: peers who join the same match topic
 * (hash of "kickpact/match/<gameId>") discover each other on the DHT and get
 * direct encrypted sockets — full mesh, no server. The RN side talks to this
 * worklet over IPC with newline-delimited JSON.
 *
 *   RN → worklet: {cmd:"join", gameId, id, nick} · {cmd:"send", msg} · {cmd:"leave"}
 *   worklet → RN: {type:"ready"|"joined"|"peers"|"msg"|"log", ...}
 */
const { IPC } = BareKit
const Hyperswarm = require("hyperswarm")
const crypto = require("hypercore-crypto")
const b4a = require("b4a")

let swarm = null
let me = { id: "", nick: "" }
const conns = new Set()

const toRN = (o) => IPC.write(b4a.from(JSON.stringify(o) + "\n"))

// newline-JSON framing for a byte stream
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

function broadcast(o) {
  const wire = b4a.from(JSON.stringify(o) + "\n")
  for (const c of conns) {
    try {
      c.write(wire)
    } catch {}
  }
}

function join(gameId, id, nick) {
  me = { id, nick }
  swarm = new Hyperswarm()
  const topic = crypto.data(b4a.from(`kickpact/match/${gameId}`))

  swarm.on("connection", (c) => {
    conns.add(c)
    toRN({ type: "peers", count: conns.size })
    c.write(b4a.from(JSON.stringify({ type: "hello", id: me.id, nick: me.nick }) + "\n"))
    c.on("data", framed((o) => {
      if (o.type === "hello") toRN({ type: "joined", id: o.id, nick: o.nick })
      else if (o.type === "msg" || o.type === "pact") toRN(o)
    }))
    const drop = () => {
      conns.delete(c)
      toRN({ type: "peers", count: conns.size })
    }
    c.on("close", drop)
    c.on("error", drop)
  })

  swarm.join(topic, { server: true, client: true })
  swarm.flush().then(() => toRN({ type: "log", text: "announced on the DHT" }))
  toRN({ type: "ready", topic: b4a.toString(topic, "hex") })
}

IPC.on(
  "data",
  framed((o) => {
    if (o.cmd === "join") join(o.gameId, o.id, o.nick)
    else if (o.cmd === "send") broadcast(o.msg)
    else if (o.cmd === "leave" && swarm) swarm.destroy().catch(() => {})
  }),
)
