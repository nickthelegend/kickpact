/* Match Room worker — runs on Bare via pear-runtime (spawned by electron/main).
 *
 * Renderer ⇄ worker over framed IPC, one JSON object per frame:
 *   renderer → worker: {cmd:"join", gameId, nick} · {cmd:"send", text} · {cmd:"leave"}
 *   worker → renderer: {type:"ready"|"peers"|"joined"|"msg"|"pact"|"log", ...}
 */
const FramedStream = require("framed-stream")
const { createRoom } = require("./room-core")

/* global Bare */
const pipe = new FramedStream(Bare.IPC)

let room = null
const toUI = (o) => pipe.write(Buffer.from(JSON.stringify(o)))

pipe.on("data", (data) => {
  let o
  try {
    o = JSON.parse(data.toString())
  } catch {
    return
  }
  if (o.cmd === "join" && !room) {
    room = createRoom(o.gameId, {
      id: o.id || "",
      nick: o.nick || "desktop-fan",
      onEvent: toUI,
    })
  } else if (o.cmd === "send" && room) {
    const m = room.send(o.text)
    toUI({ ...m, mine: true })
  } else if (o.cmd === "leave" && room) {
    room.leave()
    room = null
    toUI({ type: "log", text: "left the room" })
  }
})

pipe.on("error", () => {})
