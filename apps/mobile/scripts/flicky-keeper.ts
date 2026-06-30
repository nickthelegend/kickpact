/**
 * Flicky keeper + practice bot (daemon). Polls Sepolia for FREE practice duels
 * and drives the opponent + settlement so a solo player can play the full loop:
 *   pending → bot joins → (player reveals + swipes) → bot swipes → keeper
 *   settles each card → finalize. Free tier = no stakes, no payout, just scores.
 *
 * Uses the deployer key as both the bot (challenger) and the oracle (settler).
 * Run: DEPLOYER_PRIVATE_KEY=0x... bun scripts/flicky-keeper.ts
 */
import { ethers } from "ethers"
import { CHAIN, FLICKY_DUEL_ABI, DUEL_STATUS } from "../src/chain"

const ZERO = "0x0000000000000000000000000000000000000000"
const TIER_FREE = 2
const POLL_MS = 7000
// Cheap legacy gas so the bot keeps working on a low balance (ethers' default
// EIP-1559 maxFeePerGas estimate can exceed a near-empty wallet's balance).
const GAS = { gasPrice: 1_200_000_000n }

const tx = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })
const logs = new ethers.JsonRpcProvider(CHAIN.logsRpcUrl, CHAIN.chainId, { staticNetwork: true })

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY (bot + oracle key)")
  const bot = new ethers.Wallet(pk, tx)
  const duelW = new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], bot)
  const duelR = new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], logs)
  console.log("flicky keeper/bot:", bot.address)
  console.log("watching free practice duels on FlickyDuel", CHAIN.duelAddress, "\n")

  const done = new Set<string>()

  async function recentFreeDuelIds(): Promise<bigint[]> {
    const latest = await logs.getBlockNumber()
    const from = Math.max(0, latest - 2500)
    const ev = await duelR.queryFilter(duelR.filters.DuelCreated(), from, latest).catch(() => [])
    return ev
      .map((l) => (l as ethers.EventLog).args?.duelId as bigint)
      .filter((x) => x !== undefined && !done.has(x.toString()))
  }

  async function step(id: bigint) {
    const d = await duelR.getDuel(id)
    if (Number(d.tier) !== TIER_FREE) return
    const status = Number(d.status)
    const me = bot.address.toLowerCase()

    if (status === DUEL_STATUS.COMPLETE) {
      done.add(id.toString())
      return
    }
    // creator can't be the bot
    if (d.creator.toLowerCase() === me) return

    // 1) join as bot
    if (status === DUEL_STATUS.PENDING && d.challenger === ZERO) {
      console.log(`#${id}: joining as bot…`)
      await (await duelW.joinDuel(id, GAS)).wait()
      return
    }
    if (status !== DUEL_STATUS.ACTIVE) return
    if (d.challenger.toLowerCase() !== me) return // not our duel
    const deckSize = Number(d.deckSize)
    if (deckSize === 0) return // wait for player to reveal

    // 2) bot swipes its remaining cards (random read)
    let p1Next = Number(d.p1Next)
    while (p1Next < deckSize) {
      const isUp = Math.random() > 0.5
      console.log(`#${id}: bot swipes card ${p1Next} ${isUp ? "YES" : "NO"}`)
      await (await duelW.recordSwipe(id, p1Next, isUp, GAS)).wait()
      p1Next++
    }

    // 3) settle once both finished
    const p0Next = Number(d.p0Next)
    if (p0Next < deckSize) return // player still swiping
    const settled = Number(d.settledCount)
    if (settled < deckSize) {
      for (let i = 0; i < deckSize; i++) {
        const already = await duelR.cardSettled(id, i).catch(() => false)
        if (already) continue
        const strike = d.cards[i].strike as bigint
        const price = strike + (Math.random() > 0.5 ? 25n : -25n) // random outcome
        console.log(`#${id}: settle card ${i} @ ${price}`)
        await (await duelW.settleCard(id, i, price, GAS)).wait()
      }
    }
    console.log(`#${id}: finalize`)
    await (await duelW.finalize(id, GAS)).wait()
    done.add(id.toString())
    console.log(`#${id}: done ✓\n`)
  }

  // poll loop
  for (;;) {
    try {
      const ids = await recentFreeDuelIds()
      for (const id of ids) {
        try {
          await step(id)
        } catch (e) {
          // transient (already joined / race) — retry next tick
        }
      }
    } catch (e) {
      console.error("poll error:", (e as Error).message)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((e) => {
  console.error("keeper failed:", e.message ?? e)
  process.exit(1)
})
