/* Terminal watch-party peer — same rooms as the phone (and any other peer).
 *   bare cli.js <gameId> [nick] [--say "message"]     headless / automation
 *   bare cli.js <gameId> [nick]                       interactive: type to chat
 * Runs on Bare (the Pears runtime); also works under Node/Bun for convenience.
 * Commands while chatting: /peers · /quit
 */
import { joinRoom } from "./chat-core.js"

const argv = (global.Bare?.argv ?? process.argv).slice(2)
const [gameId = "test", nick = "cli-fan", ...rest] = argv
const sayIdx = rest.indexOf("--say")
const say = sayIdx >= 0 ? rest[sayIdx + 1] : null

const exit = (code = 0) => (global.Bare ? global.Bare.exit(code) : process.exit(code))

console.log(`joining match room #${gameId} as "${nick}"…`)
const room = joinRoom(gameId, {
  nick,
  onReady: () => console.log("announced on the DHT — type a message + enter to chat"),
  onPeers: (n) => {
    console.log(`peers: ${n}`)
    if (n > 0 && say) {
      setTimeout(() => {
        room.send(say)
        console.log(`sent: "${say}"`)
      }, 1200)
    }
  },
  onJoined: (o) => console.log(`${o.nick} joined (${o.id ? o.id.slice(0, 10) + "…" : "no wallet"})`),
  onMsg: (m) => console.log(`[${m.nick}${m.sig ? " ✓signed" : ""}] ${m.text}`),
})

// Interactive stdin — bare-tty under Bare, process.stdin under Node/Bun.
async function attachStdin() {
  let stdin = null
  try {
    if (global.Bare) {
      const { ReadStream } = await import("bare-tty")
      stdin = new ReadStream(0)
    } else {
      stdin = process.stdin
    }
  } catch {
    return // no tty (piped/daemonized) — headless mode
  }
  let buf = ""
  stdin.on("data", (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      if (line === "/quit") {
        room.leave()
        console.log("left the room")
        exit(0)
      } else if (line === "/peers") {
        console.log(`peers: ${room.peers()}`)
      } else {
        room.send(line)
        console.log(`[you] ${line}`)
      }
    }
  })
  stdin.on("error", () => {})
}
attachStdin()
