/* Terminal watch-party peer — same rooms as the phone + desktop app.
 *   bare cli.js <gameId> [nick] [--say "message"]
 * Used for headless testing and as a couch-side lurker client.
 */
import { joinRoom } from "./chat-core.js"

const [gameId = "test", nick = "cli-fan", ...rest] = (global.Bare?.argv ?? process.argv).slice(2)
const sayIdx = rest.indexOf("--say")
const say = sayIdx >= 0 ? rest[sayIdx + 1] : null

console.log(`joining match room #${gameId} as "${nick}"…`)
const room = joinRoom(gameId, {
  nick,
  onReady: () => console.log("announced on the DHT"),
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
