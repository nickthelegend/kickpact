/**
 * On-chain stats — real reads from FlickyDuel + FlickyPacts events. Powers the
 * match history and leaderboard (no backend, no fakes; pure event queries).
 */
import { ethers } from "ethers"

import { CHAIN, FLICKY_DUEL_ABI, FLICKY_PACTS_ABI } from "./chain"

const ZERO = "0x0000000000000000000000000000000000000000"

// Dedicated provider for log queries (drpc) — see CHAIN.logsRpcUrl. The
// `p` passed by callers is kept for API symmetry but logs go through this.
const logsProvider = new ethers.JsonRpcProvider(CHAIN.logsRpcUrl, CHAIN.chainId, {
  staticNetwork: true,
})

function duel(_p: ethers.Provider) {
  return new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], logsProvider)
}
function pacts(_p: ethers.Provider) {
  return new ethers.Contract(CHAIN.pactsAddress, FLICKY_PACTS_ABI as unknown as string[], logsProvider)
}

export interface HistoryItem {
  kind: "duel" | "pact"
  id: string
  stake: bigint
  outcome: "won" | "lost" | "open" | "tie/void"
}

export interface RankRow {
  address: string
  wins: number
  wonUsdt: bigint
}

async function range(_p: ethers.Provider, lookback: number) {
  const latest = await logsProvider.getBlockNumber()
  return { from: Math.max(0, latest - lookback), to: latest }
}

/** queryFilter in <=9000-block windows — public RPCs cap eth_getLogs ranges. */
async function chunked(
  c: ethers.Contract,
  filter: ethers.ContractEventName,
  from: number,
  to: number,
  win = 9000,
): Promise<ethers.Log[]> {
  const out: ethers.Log[] = []
  for (let start = from; start <= to; start += win) {
    const end = Math.min(start + win - 1, to)
    try {
      out.push(...(await c.queryFilter(filter, start, end)))
    } catch {
      /* skip window */
    }
  }
  return out
}

/** A player's duels + pacts with outcome (newest first). */
export async function myHistory(
  p: ethers.Provider,
  me: string,
  lookback = 45_000,
): Promise<HistoryItem[]> {
  const { from, to } = await range(p, lookback)
  const lower = me.toLowerCase()
  const items: HistoryItem[] = []

  const d = duel(p)
  const created = await chunked(d, d.filters.DuelCreated(null, me), from, to)
  const joined = await chunked(d, d.filters.DuelJoined(), from, to)
  const myDuelIds = new Set<string>()
  for (const l of created) myDuelIds.add(((l as ethers.EventLog).args!.duelId as bigint).toString())
  for (const l of joined) {
    const a = (l as ethers.EventLog).args!
    if ((a.challenger as string).toLowerCase() === lower) myDuelIds.add((a.duelId as bigint).toString())
  }
  const finals = await chunked(d, d.filters.DuelFinalized(), from, to)
  const duelWinner = new Map<string, string>()
  for (const l of finals) {
    const a = (l as ethers.EventLog).args!
    duelWinner.set((a.duelId as bigint).toString(), (a.winner as string).toLowerCase())
  }
  for (const id of myDuelIds) {
    const ds = await d.getDuel(BigInt(id))
    const stake = ds.p0Stake as bigint
    const w = duelWinner.get(id)
    const outcome: HistoryItem["outcome"] =
      Number(ds.status) !== 3 ? "open" : !w || w === ZERO ? "tie/void" : w === lower ? "won" : "lost"
    items.push({ kind: "duel", id, stake, outcome })
  }

  const pc = pacts(p)
  const asProp = await chunked(pc, pc.filters.PactCreated(null, me), from, to)
  const asCounter = await chunked(pc, pc.filters.PactCreated(null, null, me), from, to)
  const myPactIds = new Set<string>()
  for (const l of [...asProp, ...asCounter]) myPactIds.add(((l as ethers.EventLog).args!.pactId as bigint).toString())
  for (const id of myPactIds) {
    const ps = await pc.getPact(BigInt(id))
    const stake = ps.stake as bigint
    const st = Number(ps.status)
    const w = (ps.winner as string).toLowerCase()
    const outcome: HistoryItem["outcome"] =
      st !== 3 ? "open" : w === ZERO ? "tie/void" : w === lower ? "won" : "lost"
    items.push({ kind: "pact", id, stake, outcome })
  }

  return items.sort((a, b) => Number(b.id) - Number(a.id))
}

/** Global leaderboard from duel + pact wins (top by total USD₮ won). */
export async function leaderboard(p: ethers.Provider, lookback = 45_000): Promise<RankRow[]> {
  const { from, to } = await range(p, lookback)
  const tally = new Map<string, RankRow>()
  const add = (addr: string, won: bigint) => {
    if (!addr || addr === ZERO) return
    const k = addr.toLowerCase()
    const r = tally.get(k) ?? { address: addr, wins: 0, wonUsdt: 0n }
    r.wins += 1
    r.wonUsdt += won
    tally.set(k, r)
  }

  const d = duel(p)
  for (const l of await chunked(d, d.filters.DuelFinalized(), from, to)) {
    const a = (l as ethers.EventLog).args!
    const winner = a.winner as string
    add(winner, (a.payoutToP0 as bigint) + (a.payoutToP1 as bigint))
  }
  const pc = pacts(p)
  for (const l of await chunked(pc, pc.filters.PactResolved(), from, to)) {
    const a = (l as ethers.EventLog).args!
    add(a.winner as string, a.payout as bigint)
  }

  return [...tally.values()].sort((a, b) => (b.wonUsdt > a.wonUsdt ? 1 : -1)).slice(0, 10)
}
