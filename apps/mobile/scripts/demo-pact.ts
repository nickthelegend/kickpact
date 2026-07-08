/**
 * End-to-end P2P Pact proof (real on-chain, Sepolia).
 *
 * Two friends lock a bet in escrow, then mutually agree the winner — who is
 * auto-paid the pot:
 *   A.createPact(B, terms, stake) → B.acceptPact → both agree(winner=A)
 *   → A receives the whole pot, B's escrow auto-released to A.
 *
 * Run: DEPLOYER_PRIVATE_KEY=0x... bun scripts/demo-pact.ts
 */
import { ethers } from "ethers"
import { CHAIN, KICKPACT_PACTS_ABI, USDT_ABI } from "../src/chain"

const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })
const STAKE = 2_000_000n // 2 USD₮ each
const TERMS = "If Brazil scores first, you owe me 2 USDt"

function pacts(s: ethers.ContractRunner) {
  return new ethers.Contract(CHAIN.pactsAddress, KICKPACT_PACTS_ABI as unknown as string[], s)
}
function usdt(s: ethers.ContractRunner) {
  return new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], s)
}
const human = (x: bigint) => (Number(x) / Number(CHAIN.ONE_USDT)).toFixed(2)

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY")
  const A = new ethers.Wallet(pk, provider)
  const B = ethers.Wallet.createRandom().connect(provider)
  console.log("Friend A (proposer):", A.address)
  console.log("Friend B (counter): ", B.address)

  console.log("\n→ funding B with ETH + USD₮…")
  await (await A.sendTransaction({ to: B.address, value: ethers.parseEther("0.003") })).wait()
  await (await usdt(A).mint(B.address, 20_000_000n)).wait()
  await (await usdt(A).mint(A.address, 20_000_000n)).wait()

  const terms = ethers.keccak256(ethers.toUtf8Bytes(TERMS))
  const deadline = Math.floor(Date.parse("2030-01-01") / 1000)

  console.log(`\n→ A creates pact: "${TERMS}" (2 USD₮ each, mutual)…`)
  await (await usdt(A).approve(CHAIN.pactsAddress, STAKE)).wait()
  const rc = await (await pacts(A).createPact(B.address, ethers.ZeroAddress, STAKE, terms, deadline)).wait()
  let pactId = 0n
  for (const log of rc.logs) {
    try {
      const p = pacts(A).interface.parseLog(log)
      if (p?.name === "PactCreated") pactId = p.args.pactId as bigint
    } catch {}
  }
  console.log("   pact #", pactId.toString(), "created (A's 2 USD₮ escrowed)")

  console.log("→ B accepts (locks 2 USD₮)…")
  await (await usdt(B).approve(CHAIN.pactsAddress, STAKE)).wait()
  await (await pacts(B).acceptPact(pactId)).wait()

  const aBefore = await usdt(provider).balanceOf(A.address)
  const bBefore = await usdt(provider).balanceOf(B.address)

  console.log("→ both agree the winner is A (Brazil scored first)…")
  await (await pacts(A).agree(pactId, A.address)).wait()
  await (await pacts(B).agree(pactId, A.address)).wait()

  const aAfter = await usdt(provider).balanceOf(A.address)
  const bAfter = await usdt(provider).balanceOf(B.address)
  const st = await pacts(provider).getPact(pactId)

  console.log("\n================  RESULT  ================")
  console.log("pact status:", Number(st.status), "(3 = resolved)")
  console.log("winner:", st.winner, st.winner.toLowerCase() === A.address.toLowerCase() ? "(A 🏆)" : "(B)")
  console.log(`A USD₮: ${human(aBefore)} → ${human(aAfter)}  (Δ ${human(aAfter - aBefore)})`)
  console.log(`B USD₮: ${human(bBefore)} → ${human(bAfter)}  (Δ ${human(bAfter - bBefore)})`)
  console.log("pot auto-released to winner:", human(aAfter - aBefore), "USD₮")
  console.log("==========================================")
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e)
  process.exit(1)
})
