/**
 * FlickyDuel settlement keeper (reusable). Reads a duel, settles each card
 * with a settlement price (oracle-only), then finalizes so the pot pays the
 * winner. This is the logic the server will run on a schedule; here it runs
 * once for a given duelId.
 *
 * Run: DEPLOYER_PRIVATE_KEY=0x... bun scripts/keeper.ts <duelId> [p0 p1 …]
 *
 * If prices aren't supplied, each card settles at `strike + 1` (i.e. "up").
 * In production the price comes from a real feed (Chainlink/Pyth) for the
 * card's underlying at expiry.
 */
import { ethers } from "ethers"
import { CHAIN, FLICKY_DUEL_ABI } from "../src/chain"
import { fetchDuel } from "../src/duel"

const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })

export async function settleDuel(signer: ethers.Signer, duelId: bigint, prices?: bigint[]) {
  const duel = new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], signer)
  const state = await fetchDuel(provider, duelId)
  if (state.deckSize === 0) throw new Error("deck not revealed yet")

  for (let i = 0; i < state.deckSize; i++) {
    const settled = await duel.cardSettled?.(duelId, i).catch(() => false)
    if (settled) continue
    const price = prices?.[i] ?? state.cards[i].strike + 1n
    process.stdout.write(`settling card ${i} @ ${price}… `)
    await (await duel.settleCard(duelId, i, price)).wait()
    console.log("ok")
  }

  console.log("finalizing…")
  const rc = await (await duel.finalize(duelId)).wait()
  for (const log of rc.logs) {
    try {
      const p = duel.interface.parseLog(log)
      if (p?.name === "DuelFinalized") {
        console.log("winner:", p.args.winner, "payoutToP0:", p.args.payoutToP0.toString(), "payoutToP1:", p.args.payoutToP1.toString())
      }
    } catch {}
  }
}

// CLI entry
if (import.meta.main) {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY (oracle/keeper key)")
  const duelId = BigInt(process.argv[2] ?? "0")
  const prices = process.argv.slice(3).map((x) => BigInt(x))
  const signer = new ethers.Wallet(pk, provider)
  settleDuel(signer, duelId, prices.length ? prices : undefined)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("keeper failed:", e.message ?? e)
      process.exit(1)
    })
}
