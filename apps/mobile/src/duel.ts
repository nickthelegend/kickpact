/**
 * Real on-chain duel layer for the mobile app — ethers calls to the deployed
 * FlickyDuel + MockUSDT on Sepolia. Same lifecycle as the web app's
 * duel-contract.ts. Signing is done by the wallet's ethers signer (which on a
 * device is backed by the WDK-managed key).
 */
import { ethers } from "ethers"

import { CHAIN, FLICKY_DUEL_ABI, USDT_ABI } from "./chain"
import { ASSETS, fetchTickers, toStrike } from "./prices"

export interface Card {
  strike: bigint
  probUp: bigint // scaled by PROB_SCALE (1e9), in (0, 1e9)
}

export interface DuelState {
  status: number
  tier: number
  creator: string
  challenger: string
  p0Stake: bigint
  p1Stake: bigint
  deckCommitment: string
  deckSize: number
  startedAt: number
  settledCount: number
  p0Next: number
  p1Next: number
  p0Payout: bigint
  p0Premium: bigint
  p1Payout: bigint
  p1Premium: bigint
  cards: Card[]
}

export function duelContract(runner: ethers.ContractRunner): ethers.Contract {
  return new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], runner)
}

export function usdtContract(runner: ethers.ContractRunner): ethers.Contract {
  return new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], runner)
}

// ── commit-reveal deck ──
export function deckCommitment(cards: Card[], salt: string): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256 strike, uint64 probUp)[]", "bytes32"],
    [cards.map((c) => [c.strike, c.probUp]), salt],
  )
  return ethers.keccak256(encoded)
}

export function randomSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32))
}

/** A simple demo deck of N binary cards (strike/prob are illustrative). */
export function demoDeck(n = 3): Card[] {
  const probs = [300_000_000n, 800_000_000n, 550_000_000n, 250_000_000n, 700_000_000n]
  return Array.from({ length: n }, (_, i) => ({
    strike: BigInt(100 + i * 50),
    probUp: probs[i % probs.length],
  }))
}

/**
 * A LIVE deck of N real crypto binary cards — "will <asset> be UP from its
 * current price?" Strike = live spot price in cents; probUp leans on 24h
 * momentum. The oracle settles each card with the real price at settle time, so
 * the outcome is a genuine short-term market move (no Math.random). The
 * card→asset mapping is recovered from the on-chain strike (see prices.ts
 * assetForStrike), so nothing extra needs to be committed or shared.
 */
export async function cryptoDeck(n = 3): Promise<Card[]> {
  const tickers = await fetchTickers()
  const pool = ASSETS.filter((a) => tickers.has(a.symbol))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(n, pool.length)).map((a) => {
    const t = tickers.get(a.symbol)!
    const lean = 0.5 + Math.max(-0.3, Math.min(0.3, t.changePct / 100))
    return { strike: toStrike(t.price), probUp: BigInt(Math.round(lean * 1e9)) }
  })
}

// ── reads ──
export async function getUsdtBalance(
  provider: ethers.Provider,
  address: string,
): Promise<bigint> {
  return usdtContract(provider).balanceOf(address)
}

export async function getEthBalance(
  provider: ethers.Provider,
  address: string,
): Promise<bigint> {
  return provider.getBalance(address)
}

export async function getAllowance(
  provider: ethers.Provider,
  owner: string,
): Promise<bigint> {
  return usdtContract(provider).allowance(owner, CHAIN.duelAddress)
}

export async function fetchDuel(
  provider: ethers.Provider,
  duelId: bigint,
): Promise<DuelState> {
  const d = await duelContract(provider).getDuel(duelId)
  return {
    status: Number(d.status),
    tier: Number(d.tier),
    creator: d.creator,
    challenger: d.challenger,
    p0Stake: d.p0Stake,
    p1Stake: d.p1Stake,
    deckCommitment: d.deckCommitment,
    deckSize: Number(d.deckSize),
    startedAt: Number(d.startedAt),
    settledCount: Number(d.settledCount),
    p0Next: Number(d.p0Next),
    p1Next: Number(d.p1Next),
    p0Payout: d.p0Payout as bigint,
    p0Premium: d.p0Premium as bigint,
    p1Payout: d.p1Payout as bigint,
    p1Premium: d.p1Premium as bigint,
    cards: d.cards.map((c: { strike: bigint; probUp: bigint }) => ({
      strike: c.strike,
      probUp: c.probUp,
    })),
  }
}

// ── writes (signer required) ──
export async function mintUsdt(
  signer: ethers.Signer,
  to: string,
  amount: bigint,
): Promise<string> {
  const tx = await usdtContract(signer).mint(to, amount)
  await tx.wait()
  return tx.hash
}

export async function approveUsdt(
  signer: ethers.Signer,
  amount: bigint,
): Promise<string> {
  const tx = await usdtContract(signer).approve(CHAIN.duelAddress, amount)
  await tx.wait()
  return tx.hash
}

/** Create a staked duel; returns the new duelId (parsed from the event). */
export async function createDuel(
  signer: ethers.Signer,
  stake: bigint,
  commitment: string,
): Promise<{ hash: string; duelId: bigint }> {
  const c = duelContract(signer)
  const tx = await c.createDuel(stake, commitment)
  const receipt = await tx.wait()
  let duelId = 0n
  for (const log of receipt!.logs) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === "DuelCreated") {
        duelId = parsed.args.duelId as bigint
        break
      }
    } catch {
      /* not our event */
    }
  }
  return { hash: tx.hash, duelId }
}

/** Create a free practice duel (no stake) — bot opponent + keeper settle it. */
export async function createDuelFree(
  signer: ethers.Signer,
  commitment: string,
): Promise<{ hash: string; duelId: bigint }> {
  const c = duelContract(signer)
  const tx = await c.createDuelFree(commitment)
  const receipt = await tx.wait()
  let duelId = 0n
  for (const log of receipt!.logs) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === "DuelCreated") {
        duelId = parsed.args.duelId as bigint
        break
      }
    } catch {
      /* not our event */
    }
  }
  return { hash: tx.hash, duelId }
}

export async function revealDeck(
  signer: ethers.Signer,
  duelId: bigint,
  cards: Card[],
  salt: string,
): Promise<string> {
  const tx = await duelContract(signer).revealDeck(
    duelId,
    cards.map((c) => [c.strike, c.probUp]),
    salt,
  )
  await tx.wait()
  return tx.hash
}

export async function joinDuel(
  signer: ethers.Signer,
  duelId: bigint,
): Promise<string> {
  const tx = await duelContract(signer).joinDuel(duelId)
  await tx.wait()
  return tx.hash
}

export async function recordSwipe(
  signer: ethers.Signer,
  duelId: bigint,
  cardIdx: number,
  isUp: boolean,
): Promise<string> {
  const tx = await duelContract(signer).recordSwipe(duelId, cardIdx, isUp)
  await tx.wait()
  return tx.hash
}
