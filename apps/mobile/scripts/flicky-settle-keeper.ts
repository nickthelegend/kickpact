/**
 * Flicky settle-keeper — auto-settles football match predictions from the
 * official result. Closes the loop: a Pact created on a World Cup match
 * (arbiter = keeper) is paid out automatically once the match finishes.
 *
 * How it stays serverless: the on-chain `terms` is keccak256 of a DETERMINISTIC
 * string `predictionTerms(game, outcome)`. The keeper recomputes that hash for
 * every finished game × outcome and matches it against on-chain pacts — so it
 * recovers each pact's match + predicted side with no off-chain database.
 *
 * Run: KEEPER_PRIVATE_KEY=0x... bun scripts/flicky-settle-keeper.ts
 * (the key must be CHAIN.keeperAddress — the arbiter set on match predictions.)
 */
import { ethers } from "ethers"
import { CHAIN, FLICKY_PACTS_ABI, PACT_STATUS } from "../src/chain"
import { fetchGames, finalOutcome, predictionTerms, type Outcome } from "../src/football"

const GAS = { gasPrice: 1_200_000_000n } // legacy gas — survives a low balance
const POLL_MS = 30_000
const LOOKBACK = 100_000
const hashTerms = (t: string) => ethers.keccak256(ethers.toUtf8Bytes(t)).toLowerCase()

const tx = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })
const logs = new ethers.JsonRpcProvider(CHAIN.logsRpcUrl, CHAIN.chainId, { staticNetwork: true })

async function main() {
  const pk = process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error("set KEEPER_PRIVATE_KEY (the arbiter / keeper key)")
  const keeper = new ethers.Wallet(pk, tx)
  const pactsW = new ethers.Contract(CHAIN.pactsAddress, FLICKY_PACTS_ABI as unknown as string[], keeper)
  const pactsR = new ethers.Contract(CHAIN.pactsAddress, FLICKY_PACTS_ABI as unknown as string[], logs)

  console.log("flicky settle-keeper:", keeper.address)
  if (keeper.address.toLowerCase() !== CHAIN.keeperAddress.toLowerCase()) {
    console.warn("WARN: key address != CHAIN.keeperAddress", CHAIN.keeperAddress, "— resolves will revert (NotArbiter).")
  }
  console.log("watching FlickyPacts", CHAIN.pactsAddress, "for finished-match predictions\n")

  const settled = new Set<string>()

  async function tick() {
    // 1) finished games → map every candidate terms-hash to (outcome, result)
    const games = await fetchGames().catch(() => [])
    const byHash = new Map<string, { outcome: Outcome; result: Outcome }>()
    for (const g of games) {
      const result = finalOutcome(g)
      if (!result) continue
      for (const o of ["home", "draw", "away"] as Outcome[]) {
        byHash.set(hashTerms(predictionTerms(g, o)), { outcome: o, result })
      }
    }
    if (byHash.size === 0) return

    // 2) scan pacts arbitered by the keeper whose terms match a finished game
    const latest = await logs.getBlockNumber()
    const from = Math.max(0, latest - LOOKBACK)
    const events = await pactsR.queryFilter(pactsR.filters.PactCreated(), from, latest).catch(() => [])
    for (const l of events) {
      const a = (l as ethers.EventLog).args
      const pactId = a?.pactId as bigint
      if (pactId === undefined || settled.has(pactId.toString())) continue
      if (String(a?.arbiter).toLowerCase() !== keeper.address.toLowerCase()) continue
      const m = byHash.get(String(a?.terms).toLowerCase())
      if (!m) continue // match not finished yet

      // 3) must be ACTIVE (accepted) to settle
      const p = await pactsR.getPact(pactId)
      if (Number(p.status) !== PACT_STATUS.ACTIVE) {
        if (Number(p.status) >= PACT_STATUS.RESOLVED) settled.add(pactId.toString())
        continue
      }
      const winner = m.outcome === m.result ? p.proposer : p.counterparty
      console.log(`#${pactId}: predicted ${m.outcome}, official ${m.result} → winner ${winner}`)
      try {
        const t = await pactsW.resolveByArbiter(pactId, winner, GAS)
        console.log("  resolve tx", t.hash, "…")
        await t.wait()
        console.log("  ✓ settled — pot paid to", winner)
        settled.add(pactId.toString())
      } catch (e) {
        console.log("  resolve failed:", (e as Error).message.slice(0, 90))
      }
    }
  }

  await tick()
  setInterval(() => tick().catch((e) => console.log("tick error:", (e as Error).message)), POLL_MS)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
