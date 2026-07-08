/* Kickpact Watch Party — renderer. Talks to the Bare room worker through the
 * preload bridge (framed IPC, one JSON object per frame). */
const api = window.bridge // exposeInMainWorld("bridge") also declares a global `bridge` — don't shadow it
const decoder = new TextDecoder("utf-8")
const WORKER = "/workers/room.js"

const $ = (id) => document.getElementById(id)
const joinView = $("joinView")
const roomView = $("roomView")
const log = $("log")

let joined = false

function sys(text) {
  const el = document.createElement("div")
  el.className = "sys"
  el.textContent = text
  log.appendChild(el)
  log.scrollTop = log.scrollHeight
}

function shortId(id) {
  return id && id.startsWith("0x") && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
}

function bubble(m) {
  const el = document.createElement("div")
  el.className = "bubble" + (m.mine ? " mine" : "") + (m.type === "pact" ? " pact" : "")
  const who = document.createElement("div")
  who.className = "who"
  const badge = m.mine
    ? ""
    : m.sig && m.sig.length > 0
      ? ' <span class="ok">✓ signed</span>'
      : ' <span class="warn">⚠</span>'
  who.innerHTML = `${(shortId(m.from) || m.nick || "peer").toUpperCase()}${badge}`
  const txt = document.createElement("div")
  txt.className = "txt"
  txt.textContent =
    m.type === "pact" ? `⚔ bet proposal: ${m.text} (take the side in the Kickpact app)` : m.text
  el.appendChild(who)
  el.appendChild(txt)
  log.appendChild(el)
  log.scrollTop = log.scrollHeight
}

function onRoomEvent(o) {
  if (o.type === "peers") $("peersPill").textContent = `● ${o.count} PEERS`
  else if (o.type === "joined") sys(`${o.nick || shortId(o.id) || "peer"} joined the room`)
  else if (o.type === "log") sys(o.text)
  else if (o.type === "msg" || o.type === "pact") bubble(o)
}

function send() {
  const text = $("msg").value.trim()
  if (!text || !joined) return
  $("msg").value = ""
  api.writeWorkerIPC(WORKER, JSON.stringify({ cmd: "send", text }))
}

if (!api) {
  // opened in a plain browser (no Electron preload) — show the static UI only
  $("joinBtn").textContent = "OPEN VIA THE DESKTOP APP"
  $("joinBtn").disabled = true
} else {
  api.startWorker(WORKER)

  api.onWorkerIPC(WORKER, (data) => {
    let o
    try {
      o = JSON.parse(decoder.decode(data))
    } catch {
      return
    }
    onRoomEvent(o)
  })
  api.onWorkerStderr(WORKER, (data) => {
    console.error("[room worker]", decoder.decode(data))
  })
  api.onWorkerExit(WORKER, (code) => {
    sys(`room worker exited (${code}) — restart the app to rejoin`)
    joined = false
  })

  $("joinBtn").onclick = () => {
    const gameId = $("gameId").value.trim()
    const nick = $("nick").value.trim() || "desktop-fan"
    if (!gameId) return
    api.writeWorkerIPC(WORKER, JSON.stringify({ cmd: "join", gameId, nick }))
    joined = true
    $("roomLabel").textContent = `· #${gameId}`
    joinView.style.display = "none"
    roomView.style.display = "flex"
    sys("finding fans of this match on the DHT…")
    $("msg").focus()
  }

  $("sendBtn").onclick = send
  $("msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter") send()
  })
  $("leaveBtn").onclick = () => {
    api.writeWorkerIPC(WORKER, JSON.stringify({ cmd: "leave" }))
    joined = false
    roomView.style.display = "none"
    joinView.style.display = "block"
    log.innerHTML = ""
    $("peersPill").textContent = "● 0 PEERS"
  }
}
