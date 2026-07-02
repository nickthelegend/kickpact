/* Flicky Watch Party — Pear desktop app (Pears track).
 * Run in dev:      pear run --dev .
 * Ship a link:     pear stage main && pear seed main  →  pear run pear://<key>
 */
import { joinRoom } from "./chat-core.js"

const $ = (id) => document.getElementById(id)
let room = null
let myNick = "desktop-fan"

function sys(text) {
  const d = document.createElement("div")
  d.className = "sys"
  d.textContent = text
  $("log").appendChild(d)
  $("log").scrollTop = $("log").scrollHeight
}

function bubble(m, mine) {
  const d = document.createElement("div")
  d.className = "msg" + (mine ? " mine" : "")
  const who = document.createElement("div")
  who.className = "who"
  who.textContent = m.nick + (m.sig ? " ✓ wallet-signed" : "")
  const txt = document.createElement("div")
  txt.className = "txt"
  txt.textContent = m.type === "pact" ? `⚔ bet proposal: ${m.text} (join on the Flicky app)` : m.text
  d.append(who, txt)
  $("log").appendChild(d)
  $("log").scrollTop = $("log").scrollHeight
}

$("joinBtn").onclick = () => {
  const gameId = $("gameId").value.trim()
  if (!gameId) return
  myNick = $("nick").value.trim() || "desktop-fan"
  room = joinRoom(gameId, {
    nick: myNick,
    onReady: () => sys("announced on the DHT — fans can find you now"),
    onPeers: (n) => ($("peers").textContent = `● ${n} peer${n === 1 ? "" : "s"}`, $("peers").className = "pill" + (n > 0 ? " live" : "")),
    onJoined: (o) => sys(`${o.nick} joined the room`),
    onMsg: (m) => bubble(m, false),
  })
  $("roomLabel").textContent = `match #${gameId}`
  $("joinView").style.display = "none"
  $("roomView").style.display = "flex"
}

function send() {
  const text = $("text").value.trim()
  if (!text || !room) return
  $("text").value = ""
  bubble(room.send(text), true)
}
$("sendBtn").onclick = send
$("text").addEventListener("keydown", (e) => e.key === "Enter" && send())
