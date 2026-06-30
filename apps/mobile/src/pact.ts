/**
 * FlickyPacts layer — self-custodial friend bets. Real ethers calls to the
 * deployed FlickyPacts on Sepolia. The on-chain record stores a keccak hash of
 * the terms; the human text is cached locally so it can be displayed (and
 * shared with the counterparty like a code).
 */
import { ethers } from "ethers"
import AsyncStorage from "@react-native-async-storage/async-storage"

import { CHAIN, FLICKY_PACTS_ABI } from "./chain"

export const ZERO = "0x0000000000000000000000000000000000000000"

export interface PactState {
  proposer: string
  counterparty: string
  arbiter: string
  stake: bigint
  status: number
  winner: string
  terms: string // keccak hash
  deadline: number
  p0Vote: string
  p1Vote: string
  p0Voted: boolean
  p1Voted: boolean
}

export function pactsContract(runner: ethers.ContractRunner): ethers.Contract {
  return new ethers.Contract(CHAIN.pactsAddress, FLICKY_PACTS_ABI as unknown as string[], runner)
}

export function hashTerms(text: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(text))
}

const termsKey = (id: string | bigint) => `flicky.pact.terms.${id}`
export async function saveTermsText(id: string | bigint, text: string) {
  try { await AsyncStorage.setItem(termsKey(id), text) } catch {}
}
export async function getTermsText(id: string | bigint): Promise<string | null> {
  try { return await AsyncStorage.getItem(termsKey(id)) } catch { return null }
}

// ── writes ──
export async function createPact(
  signer: ethers.Signer,
  opts: { counterparty: string; arbiter?: string; stake: bigint; termsText: string; deadline: number },
): Promise<{ hash: string; pactId: bigint }> {
  const c = pactsContract(signer)
  const tx = await c.createPact(
    opts.counterparty,
    opts.arbiter ?? ZERO,
    opts.stake,
    hashTerms(opts.termsText),
    BigInt(opts.deadline),
  )
  const rc = await tx.wait()
  let pactId = 0n
  for (const log of rc!.logs) {
    try {
      const p = c.interface.parseLog(log)
      if (p?.name === "PactCreated") pactId = p.args.pactId as bigint
    } catch {}
  }
  if (pactId) await saveTermsText(pactId, opts.termsText)
  return { hash: tx.hash, pactId }
}

export async function acceptPact(signer: ethers.Signer, pactId: bigint): Promise<string> {
  const tx = await pactsContract(signer).acceptPact(pactId)
  await tx.wait()
  return tx.hash
}

export async function agreePact(signer: ethers.Signer, pactId: bigint, winner: string): Promise<string> {
  const tx = await pactsContract(signer).agree(pactId, winner)
  await tx.wait()
  return tx.hash
}

export async function resolvePactByArbiter(signer: ethers.Signer, pactId: bigint, winner: string): Promise<string> {
  const tx = await pactsContract(signer).resolveByArbiter(pactId, winner)
  await tx.wait()
  return tx.hash
}

export async function cancelPact(signer: ethers.Signer, pactId: bigint): Promise<string> {
  const tx = await pactsContract(signer).cancelPact(pactId)
  await tx.wait()
  return tx.hash
}

// ── reads ──
export async function fetchPact(provider: ethers.Provider, pactId: bigint): Promise<PactState> {
  const p = await pactsContract(provider).getPact(pactId)
  return {
    proposer: p.proposer,
    counterparty: p.counterparty,
    arbiter: p.arbiter,
    stake: p.stake,
    status: Number(p.status),
    winner: p.winner,
    terms: p.terms,
    deadline: Number(p.deadline),
    p0Vote: p.p0Vote,
    p1Vote: p.p1Vote,
    p0Voted: p.p0Voted,
    p1Voted: p.p1Voted,
  }
}

/** Pact ids where I'm the proposer or counterparty (newest first). */
export async function listMyPacts(provider: ethers.Provider, address: string, lookback = 60_000): Promise<bigint[]> {
  const c = pactsContract(provider)
  const latest = await provider.getBlockNumber()
  const from = Math.max(0, latest - lookback)
  const mine = new Set<string>()
  const asProposer = await c.queryFilter(c.filters.PactCreated(null, address), from, latest)
  const asCounter = await c.queryFilter(c.filters.PactCreated(null, null, address), from, latest)
  for (const l of [...asProposer, ...asCounter]) {
    const id = (l as ethers.EventLog).args?.pactId as bigint
    if (id !== undefined) mine.add(id.toString())
  }
  return [...mine].map((x) => BigInt(x)).sort((a, b) => (a > b ? -1 : 1))
}
