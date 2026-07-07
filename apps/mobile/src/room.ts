/**
 * Match Room client — RN side of the P2P watch-party chat (Pears track).
 *
 * Spins up a Bare worklet (react-native-bare-kit) that runs Hyperswarm and
 * joins the match topic; this side signs every outgoing message with the WDK
 * wallet key and verifies incoming signatures, so your chat identity IS your
 * on-chain identity. Rooms are ephemeral (live P2P, no history server).
 */
import { Worklet } from "react-native-bare-kit"
import { ethers } from "ethers"
// Bundle produced by `bun run pack:room` (bare-pack → base64) — addons load
// from the APK. Decoded to bytes: passing the serialized bundle as a JS string
// through JSI segfaults native-side, so it MUST go in as a Uint8Array.
import bundleB64 from "./room.bundle"

function bundleBytes(): Uint8Array {
  const bin = globalThis.atob(bundleB64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface RoomMsg {
  type: "msg" | "pact"
  from: string // wallet address
  nick: string
  text: string
  ts: number
  sig: string
  verified?: boolean
  mine?: boolean
  // pact proposals carry the on-chain reference
  pactId?: string
  stakeUsd?: number
  outcome?: string
}

export interface RoomEvents {
  onReady?: () => void
  onPeers?: (count: number) => void
  onJoined?: (nick: string) => void
  onMsg?: (m: RoomMsg) => void
  onLog?: (text: string) => void
}

const signedPayload = (m: { from: string; text: string; ts: number }) =>
  `flicky-room:${m.from.toLowerCase()}:${m.ts}:${m.text}`

export class MatchRoom {
  private worklet: Worklet | null = null
  private buf = ""

  constructor(
    private gameId: string,
    private me: { address: string; nick: string },
    private signer: ethers.Signer,
    private ev: RoomEvents,
  ) {}

  async start(): Promise<void> {
    const w = new Worklet()
    this.worklet = w
    await w.start("/room.bundle", bundleBytes())
    const { IPC } = w as unknown as { IPC: { on: (e: string, f: (d: Uint8Array) => void) => void; write: (d: Uint8Array) => void } }
    IPC.on("data", (data) => this.onData(data))
    this.cmd({ cmd: "join", gameId: this.gameId, id: this.me.address, nick: this.me.nick })
  }

  private onData(data: Uint8Array) {
    this.buf += new TextDecoder().decode(data)
    let i
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i)
      this.buf = this.buf.slice(i + 1)
      if (!line.trim()) continue
      try {
        this.onEvent(JSON.parse(line))
      } catch {}
    }
  }

  private async onEvent(o: any) {
    if (o.type === "ready") this.ev.onReady?.()
    else if (o.type === "peers") this.ev.onPeers?.(o.count)
    else if (o.type === "joined") this.ev.onJoined?.(o.nick)
    else if (o.type === "log") this.ev.onLog?.(o.text)
    else if (o.type === "msg" || o.type === "pact") {
      const m = o as RoomMsg
      try {
        const rec = ethers.verifyMessage(signedPayload(m), m.sig)
        m.verified = rec.toLowerCase() === m.from.toLowerCase()
      } catch {
        m.verified = false
      }
      this.ev.onMsg?.(m)
    }
  }

  private cmd(o: unknown) {
    const w = this.worklet as unknown as { IPC: { write: (d: Uint8Array) => void } } | null
    if (!w) return
    w.IPC.write(new TextEncoder().encode(JSON.stringify(o) + "\n"))
  }

  /** Sign + broadcast a chat message. Returns the local echo. */
  async send(text: string, extra?: Partial<RoomMsg>): Promise<RoomMsg> {
    const m: RoomMsg = {
      type: (extra?.type as RoomMsg["type"]) ?? "msg",
      from: this.me.address,
      nick: this.me.nick,
      text,
      ts: Date.now(),
      sig: "",
      ...extra,
    }
    m.sig = await this.signer.signMessage(signedPayload(m))
    this.cmd({ cmd: "send", msg: m })
    return { ...m, verified: true, mine: true }
  }

  stop() {
    this.cmd({ cmd: "leave" })
    setTimeout(() => this.worklet?.terminate(), 250)
    this.worklet = null
  }
}
