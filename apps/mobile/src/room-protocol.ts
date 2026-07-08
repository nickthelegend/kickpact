/**
 * Match Room wire protocol — the pure, testable core of the P2P chat.
 * Shared constants with the Bare worklet (worklet/room.js), the desktop app
 * (apps/desktop/workers/room-core.js) and the Pear CLI (apps/pear/chat-core.js):
 *
 *   topic   = hash("kickpact/match/<gameId>")
 *   wire    = newline-JSON {type:"hello"|"msg"|"pact"}
 *   payload = `kickpact-room:<addr>:<ts>:<text>` signed by the WDK wallet key
 */

/** Topic string hashed into the swarm topic — must match every peer. */
export const topicString = (gameId: string) => `kickpact/match/${gameId}`

/** The exact byte string a phone signs (and every peer verifies). */
export const signedPayload = (m: { from: string; text: string; ts: number }) =>
  `kickpact-room:${m.from.toLowerCase()}:${m.ts}:${m.text}`

/** Newline-JSON decoder that survives arbitrary chunking and garbage lines.
 * Returns a feed(chunk) function; parsed objects fire through onLine. */
export function makeLineDecoder(onLine: (o: any) => void): (chunk: string) => void {
  let buf = ""
  return (chunk: string) => {
    buf += chunk
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

/** One wire line (newline-terminated JSON). */
export const encodeLine = (o: unknown) => JSON.stringify(o) + "\n"
