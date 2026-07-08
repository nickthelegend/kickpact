/**
 * Group pools (KickpactPools) — the watch-party pot.
 *
 * Friends in a P2P match room each lock the SAME USD₮ stake and pick an
 * outcome (home / draw / away). The contract holds the pot; after the match
 * the settle-keeper posts the official result and everyone who called it
 * splits the pot equally. No custodian — claiming is a self-serve `claim()`.
 *
 * The deterministic game key is shared with the keeper:
 *   gameKey = keccak256("WC#<espn match id>")
 */
import { ethers } from "ethers"

import { CHAIN, KICKPACT_POOLS_ABI, POOLS, USDT_ABI } from "./chain.ts"
import type { Game } from "./football.ts"

export const OUTCOMES = ["home", "draw", "away"] as const
export type PoolOutcome = (typeof OUTCOMES)[number]

/** 1 = home, 2 = draw, 3 = away (contract encoding). */
export const pickCode = (o: PoolOutcome): number => OUTCOMES.indexOf(o) + 1
export const pickName = (code: number): PoolOutcome | null =>
  code >= 1 && code <= 3 ? OUTCOMES[code - 1] : null

/** The deterministic on-chain key for a match — MUST match the keeper. */
export const gameTag = (gameId: string) => `WC#${gameId}`
export const gameKey = (gameId: string) => ethers.keccak256(ethers.toUtf8Bytes(gameTag(gameId)))

export interface PoolState {
  id: bigint
  creator: string
  gameKey: string
  arbiter: string
  stake: bigint
  deadline: number
  result: number // 0 until settled
  settled: boolean
  winners: number
  members: string[]
  pot: bigint
}

export function poolsContract(runner: ethers.ContractRunner): ethers.Contract {
  return new ethers.Contract(POOLS.address, KICKPACT_POOLS_ABI as unknown as string[], runner)
}

const asState = (id: bigint, p: any): PoolState => ({
  id,
  creator: p.creator,
  gameKey: p.gameKey,
  arbiter: p.arbiter,
  stake: BigInt(p.stake),
  deadline: Number(p.deadline),
  result: Number(p.result),
  settled: Boolean(p.settled),
  winners: Number(p.winners),
  members: [...p.members],
  pot: BigInt(p.stake) * BigInt(p.members.length),
})

/** All pools opened for a match. */
export async function poolsForGame(provider: ethers.Provider, gameId: string): Promise<PoolState[]> {
  const c = poolsContract(provider)
  const ids: bigint[] = await c.poolsForGame(gameKey(gameId))
  const out: PoolState[] = []
  for (const id of ids) out.push(asState(id, await c.getPool(id)))
  return out
}

export async function getPool(provider: ethers.Provider, poolId: bigint): Promise<PoolState> {
  const c = poolsContract(provider)
  return asState(poolId, await c.getPool(poolId))
}

export async function myPick(provider: ethers.Provider, poolId: bigint, addr: string): Promise<number> {
  return Number(await poolsContract(provider).pickOf(poolId, addr))
}

export async function hasClaimed(provider: ethers.Provider, poolId: bigint, addr: string): Promise<boolean> {
  return Boolean(await poolsContract(provider).claimed(poolId, addr))
}

async function ensureAllowance(signer: ethers.Signer, amount: bigint) {
  const me = await signer.getAddress()
  const usdt = new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], signer)
  const current: bigint = await usdt.allowance(me, POOLS.address)
  if (current < amount) {
    const tx = await usdt.approve(POOLS.address, ethers.MaxUint256)
    await tx.wait()
  }
}

/** Open a pool for a match with your stake + pick. Kickoff = join deadline. */
export async function createPool(
  signer: ethers.Signer,
  game: Game,
  stake: bigint,
  pick: PoolOutcome,
): Promise<{ poolId: bigint; txHash: string }> {
  await ensureAllowance(signer, stake)
  const c = poolsContract(signer)
  const deadline = BigInt(Math.floor(new Date(game.date).getTime() / 1000))
  const tx = await c.createPool(gameKey(game.id), POOLS.keeperAddress, stake, deadline, pickCode(pick))
  const rc = await tx.wait()
  // PoolCreated is the first log from our contract
  let poolId = 0n
  for (const log of rc!.logs) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === "PoolCreated") {
        poolId = BigInt(parsed.args[0])
        break
      }
    } catch {}
  }
  return { poolId, txHash: tx.hash }
}

/** Join an open pool with your pick (locks the pool's stake). */
export async function joinPool(signer: ethers.Signer, poolId: bigint, pick: PoolOutcome): Promise<string> {
  const provider = signer.provider!
  const p = await getPool(provider, poolId)
  await ensureAllowance(signer, p.stake)
  const tx = await poolsContract(signer).joinPool(poolId, pickCode(pick))
  await tx.wait()
  return tx.hash
}

/** Winners collect their share (or their refund when nobody won). */
export async function claimPool(signer: ethers.Signer, poolId: bigint): Promise<string> {
  const tx = await poolsContract(signer).claim(poolId)
  await tx.wait()
  return tx.hash
}

/** Post-grace self-refund if the keeper never settled. */
export async function refundPool(signer: ethers.Signer, poolId: bigint): Promise<string> {
  const tx = await poolsContract(signer).refundExpired(poolId)
  await tx.wait()
  return tx.hash
}
