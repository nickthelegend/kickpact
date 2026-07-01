/**
 * End-to-end P2P duel proof (real on-chain, Sepolia) — now with a LIVE crypto
 * card settled from the real price:
 *   A.createDuel → B.joinDuel → A.revealDeck → both swipe → oracle settles the
 *   card with the REAL current price → finalize → winner takes the USD₮ pot.
 *
 * A 1-card deck keeps it inside a tight Sepolia gas budget; gas is spread across
 * three wallets (creator / oracle / a fresh challenger funded by the oracle).
 *
 *   CREATOR_KEY=0x… ORACLE_KEY=0x… bun scripts/demo-duel.ts
 */
import { ethers } from "ethers"
import { CHAIN, FLICKY_DUEL_ABI, USDT_ABI } from "../src/chain"
import { cryptoDeck, deckCommitment, randomSalt } from "../src/duel"
import { assetForStrike, fetchTickers, fromStrike, priceLabel, toStrike } from "../src/prices"

const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })
const STAKE = 2_000_000n // 2 USD₮/side
const human = (x: bigint) => (Number(x) / Number(CHAIN.ONE_USDT)).toFixed(2)
let GP = 15_000_000_000n
const g = () => ({ gasPrice: GP })
const duel = (s: ethers.ContractRunner) => new ethers.Contract(CHAIN.duelAddress, FLICKY_DUEL_ABI as unknown as string[], s)
const usdt = (s: ethers.ContractRunner) => new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], s)

async function main() {
  const A = new ethers.Wallet(process.env.CREATOR_KEY!, provider) // creator
  const O = new ethers.Wallet(process.env.ORACLE_KEY!, provider) // FlickyDuel oracle
  const B = ethers.Wallet.createRandom().connect(provider) // challenger
  GP = (((await provider.getFeeData()).gasPrice ?? 12_000_000_000n) * 13n) / 10n
  console.log("creator A:", A.address, "\noracle  O:", O.address, "\nchallenger B:", B.address)
  console.log("gas price:", ethers.formatUnits(GP, "gwei"), "gwei\n")

  console.log("→ oracle funds B gas; mint + approve USD₮…")
  await (await O.sendTransaction({ to: B.address, value: ethers.parseEther("0.006"), gasPrice: GP, gasLimit: 21000n })).wait()
  await (await usdt(A).mint(A.address, 50_000_000n, g())).wait()
  await (await usdt(A).mint(B.address, 50_000_000n, g())).wait()
  await (await usdt(A).approve(CHAIN.duelAddress, STAKE, g())).wait()
  await (await usdt(B).approve(CHAIN.duelAddress, STAKE, g())).wait()

  const cards = await cryptoDeck(1)
  const tickers = await fetchTickers()
  const asset = assetForStrike(cards[0].strike, tickers)!
  const salt = randomSalt()
  console.log(`\ncard: ${asset.symbol} — will it be UP from ${priceLabel(fromStrike(cards[0].strike))}?`)

  const rc = await (await duel(A).createDuel(STAKE, deckCommitment(cards, salt), g())).wait()
  const duelId: bigint = rc.logs.map((l: any) => { try { return duel(A).interface.parseLog(l) } catch { return null } }).find((x: any) => x?.name === "DuelCreated").args.duelId
  console.log(`duel #${duelId} created · ${human(STAKE)} USD₮/side escrowed`)

  await (await duel(B).joinDuel(duelId, g())).wait()
  await (await duel(A).revealDeck(duelId, cards.map((c) => [c.strike, c.probUp]), salt, g())).wait()
  console.log("B joined · deck revealed")

  await (await duel(A).recordSwipe(duelId, 0, true, g())).wait() // A: UP
  await (await duel(B).recordSwipe(duelId, 0, false, g())).wait() // B: DOWN
  console.log("A swiped UP · B swiped DOWN")

  console.log("\nwaiting ~25s for the real price to move…")
  await new Promise((r) => setTimeout(r, 25000))

  const live = (await fetchTickers()).get(asset.symbol)!.price
  const settlePrice = toStrike(live)
  const actualUp = settlePrice > cards[0].strike
  console.log(`settle: ${asset.symbol} now ${priceLabel(live)} vs ${priceLabel(fromStrike(cards[0].strike))} → ${actualUp ? "UP" : "DOWN"}`)

  const aBefore = await usdt(provider).balanceOf(A.address)
  const bBefore = await usdt(provider).balanceOf(B.address)
  await (await duel(O).settleCard(duelId, 0, settlePrice, g())).wait()
  const finRc = await (await duel(O).finalize(duelId, g())).wait()
  const winner: string = finRc.logs.map((l: any) => { try { return duel(O).interface.parseLog(l) } catch { return null } }).find((x: any) => x?.name === "DuelFinalized" || x?.name === "DuelForfeited")?.args?.winner ?? ""

  const aAfter = await usdt(provider).balanceOf(A.address)
  const bAfter = await usdt(provider).balanceOf(B.address)
  console.log("\n================  RESULT  ================")
  console.log("winner:", winner, winner.toLowerCase() === A.address.toLowerCase() ? "→ A (UP)" : winner.toLowerCase() === B.address.toLowerCase() ? "→ B (DOWN)" : "(tie/none)")
  console.log(`A USD₮ Δ ${human(aAfter - aBefore)} · B USD₮ Δ ${human(bAfter - bBefore)}`)
  console.log("real-crypto duel settled + paid out on-chain ✅")
  console.log("==========================================")
}
main().catch((e) => { console.error("FAILED:", e.shortMessage ?? e.message ?? e); process.exit(1) })
