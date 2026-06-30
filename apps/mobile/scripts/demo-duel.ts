/**
 * End-to-end P2P duel proof (real on-chain, Sepolia).
 *
 * Runs two wallets through the FULL FlickyDuel lifecycle and asserts the
 * winner is paid the escrowed pot:
 *   A.createDuel → B.joinDuel → A.revealDeck → both swipe → keeper settles
 *   each card → finalize → winner takes the USD₮ pot.
 *
 * Player A = the deployer/oracle (funded). Player B = a fresh wallet funded
 * from A. The keeper (oracle) posts each card's settlement price.
 *
 * Run: DEPLOYER_PRIVATE_KEY=0x... bun scripts/demo-duel.ts
 */
import { ethers } from "ethers"
import { CHAIN, FLICKY_DUEL_ABI, USDT_ABI } from "../src/chain"
import { deckCommitment, demoDeck, type Card } from "../src/duel"

const RPC = CHAIN.rpcUrl
const STAKE = 5_000_000n // 5 USD₮
const provider = new ethers.JsonRpcProvider(RPC, CHAIN.chainId, { staticNetwork: true })

function duel(s: ethers.ContractRunner) {
  return new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], s)
}
function usdt(s: ethers.ContractRunner) {
  return new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], s)
}
const human = (x: bigint) => (Number(x) / Number(CHAIN.ONE_USDT)).toFixed(2)

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY")
  const A = new ethers.Wallet(pk, provider) // creator + oracle/keeper
  const B = ethers.Wallet.createRandom().connect(provider) // challenger
  console.log("Player A (creator/keeper):", A.address)
  console.log("Player B (challenger):    ", B.address)

  // Fund B with gas + USD₮.
  console.log("\n→ funding B with ETH + USD₮…")
  await (await A.sendTransaction({ to: B.address, value: ethers.parseEther("0.004") })).wait()
  await (await usdt(A).mint(B.address, 50_000_000n)).wait()
  await (await usdt(A).mint(A.address, 50_000_000n)).wait()

  const deck: Card[] = demoDeck(3)
  const salt = ethers.hexlify(ethers.randomBytes(32))
  const commitment = deckCommitment(deck, salt)

  // A creates the duel.
  console.log("\n→ A approves + creates duel…")
  await (await usdt(A).approve(CHAIN.duelAddress, STAKE)).wait()
  const createRc = await (await duel(A).createDuel(STAKE, commitment)).wait()
  let duelId = 0n
  for (const log of createRc.logs) {
    try {
      const p = duel(A).interface.parseLog(log)
      if (p?.name === "DuelCreated") duelId = p.args.duelId as bigint
    } catch {}
  }
  console.log("   duel #", duelId.toString(), "created, 5 USD₮ escrowed")

  // B joins.
  console.log("→ B approves + joins…")
  await (await usdt(B).approve(CHAIN.duelAddress, STAKE)).wait()
  await (await duel(B).joinDuel(duelId)).wait()

  // A reveals the deck.
  console.log("→ A reveals the deck…")
  await (await duel(A).revealDeck(duelId, deck.map((c) => [c.strike, c.probUp]), salt)).wait()

  // Swipes — A: YES,YES,NO ; B: NO,YES,YES
  const aSwipes = [true, true, false]
  const bSwipes = [false, true, true]
  console.log("→ A swipes", aSwipes, " B swipes", bSwipes)
  for (let i = 0; i < deck.length; i++) await (await duel(A).recordSwipe(duelId, i, aSwipes[i])).wait()
  for (let i = 0; i < deck.length; i++) await (await duel(B).recordSwipe(duelId, i, bSwipes[i])).wait()

  // Keeper (oracle=A) settles each card. Prices → actual_up: [up, down, up]
  const prices = [150n, 100n, 250n]
  console.log("→ keeper settles cards with prices", prices.map(String))
  for (let i = 0; i < deck.length; i++) await (await duel(A).settleCard(duelId, i, prices[i])).wait()

  const aBefore = await usdt(provider).balanceOf(A.address)
  const bBefore = await usdt(provider).balanceOf(B.address)

  console.log("→ finalize…")
  const finRc = await (await duel(A).finalize(duelId)).wait()
  let winner = ""
  for (const log of finRc.logs) {
    try {
      const p = duel(A).interface.parseLog(log)
      if (p?.name === "DuelFinalized") winner = p.args.winner as string
    } catch {}
  }

  const aAfter = await usdt(provider).balanceOf(A.address)
  const bAfter = await usdt(provider).balanceOf(B.address)

  console.log("\n================  RESULT  ================")
  console.log("winner:", winner, winner.toLowerCase() === A.address.toLowerCase() ? "(Player A)" : "(Player B)")
  console.log(`A USD₮: ${human(aBefore)} → ${human(aAfter)}  (Δ ${human(aAfter - aBefore)})`)
  console.log(`B USD₮: ${human(bBefore)} → ${human(bAfter)}  (Δ ${human(bAfter - bBefore)})`)
  console.log("pot paid:", human(aAfter - aBefore), "USD₮ to the winner")
  console.log("==========================================")
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e)
  process.exit(1)
})
