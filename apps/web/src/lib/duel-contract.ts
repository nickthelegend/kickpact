/**
 * EVM duel-contract layer — the KickpactDuel equivalent of the old Sui
 * `kickpact.ts` + `deepbook.ts`. Builds calldata for the KickpactDuel lifecycle
 * and reads duel state from Sepolia. Stakes are USD₮ (ERC-20).
 *
 * Transactions are returned as `{ to, data, value }` request objects so they
 * can be signed+sent by a WDK account (see `wdk/use-evm-sign.ts`). Reads use a
 * read-only ethers provider.
 */
import { ethers } from "ethers"

import { EVM_CONFIG } from "./evm-config"
import { KICKPACT_DUEL_ABI, USDT_ABI } from "./abi"

export interface Card {
  /** Settlement price threshold; settlement > strike ⇒ "up". */
  strike: bigint
  /** Implied P(up), scaled by PROB_SCALE (1e9), in (0, 1e9). */
  probUp: bigint
}

export interface TxRequest {
  to: string
  data: string
  value?: bigint
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

const duelIface = new ethers.Interface(KICKPACT_DUEL_ABI as unknown as string[])
const usdtIface = new ethers.Interface(USDT_ABI as unknown as string[])

const DUEL = EVM_CONFIG.duelAddress
const USDT = EVM_CONFIG.usdtAddress

// === Deck commitment ===

/** keccak256(abi.encode(Card[] cards, bytes32 salt)) — matches the contract. */
export function deckCommitment(cards: Card[], salt: string): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256 strike, uint64 probUp)[]", "bytes32"],
    [cards.map((c) => [c.strike, c.probUp]), salt],
  )
  return ethers.keccak256(encoded)
}

/** A random 32-byte salt for the commit-reveal deck. */
export function randomSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32))
}

// === Tx builders (USD₮ token) ===

export function mintUsdtTx(to: string, amount: bigint): TxRequest {
  return { to: USDT, data: usdtIface.encodeFunctionData("mint", [to, amount]) }
}

export function approveUsdtTx(amount: bigint): TxRequest {
  return {
    to: USDT,
    data: usdtIface.encodeFunctionData("approve", [DUEL, amount]),
  }
}

// === Tx builders (duel lifecycle) ===

export function createDuelTx(stake: bigint, commitment: string): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("createDuel", [stake, commitment]),
  }
}

export function createDuelFreeTx(commitment: string): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("createDuelFree", [commitment]),
  }
}

export function joinDuelTx(duelId: bigint): TxRequest {
  return { to: DUEL, data: duelIface.encodeFunctionData("joinDuel", [duelId]) }
}

export function revealDeckTx(
  duelId: bigint,
  cards: Card[],
  salt: string,
): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("revealDeck", [
      duelId,
      cards.map((c) => [c.strike, c.probUp]),
      salt,
    ]),
  }
}

export function recordSwipeTx(
  duelId: bigint,
  cardIdx: number,
  isUp: boolean,
): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("recordSwipe", [duelId, cardIdx, isUp]),
  }
}

export function settleCardTx(
  duelId: bigint,
  cardIdx: number,
  settlementPrice: bigint,
): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("settleCard", [
      duelId,
      cardIdx,
      settlementPrice,
    ]),
  }
}

export function finalizeTx(duelId: bigint): TxRequest {
  return { to: DUEL, data: duelIface.encodeFunctionData("finalize", [duelId]) }
}

export function refundDuelTx(duelId: bigint): TxRequest {
  return {
    to: DUEL,
    data: duelIface.encodeFunctionData("refundDuel", [duelId]),
  }
}

// === Reads ===

export function duelContract(provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(DUEL, KICKPACT_DUEL_ABI as unknown as string[], provider)
}

export function usdtContract(provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(USDT, USDT_ABI as unknown as string[], provider)
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
    p0Payout: d.p0Payout,
    p0Premium: d.p0Premium,
    p1Payout: d.p1Payout,
    p1Premium: d.p1Premium,
    cards: d.cards.map((c: { strike: bigint; probUp: bigint }) => ({
      strike: c.strike,
      probUp: c.probUp,
    })),
  }
}

export async function getUsdtBalance(
  provider: ethers.Provider,
  address: string,
): Promise<bigint> {
  return usdtContract(provider).balanceOf(address)
}

export async function getUsdtAllowance(
  provider: ethers.Provider,
  owner: string,
): Promise<bigint> {
  return usdtContract(provider).allowance(owner, DUEL)
}

/** Recently created duels (newest first), via DuelCreated logs. */
export async function listDuelIds(
  provider: ethers.Provider,
  lookbackBlocks = 50_000,
): Promise<bigint[]> {
  const c = duelContract(provider)
  const latest = await provider.getBlockNumber()
  const from = Math.max(0, latest - lookbackBlocks)
  const logs = await c.queryFilter(c.filters.DuelCreated(), from, latest)
  return logs
    .map((l) => (l as ethers.EventLog).args?.duelId as bigint)
    .filter((x): x is bigint => x !== undefined)
    .reverse()
}
