/**
 * E2E proof: OPEN ROOM (anyone joins) + AUTO-SETTLE from the official result.
 * Sets up an open room on a finished World Cup match and has a 2nd wallet join.
 * Then run kickpact-settle-keeper.ts to auto-settle it from the ESPN result.
 *
 *   bun scripts/demo-open-settle.ts        # create + join
 *   KEEPER_PRIVATE_KEY=… bun scripts/kickpact-settle-keeper.ts   # settles it
 */
import { ethers } from "ethers"
import { CHAIN, KICKPACT_PACTS_ABI } from "../src/chain"
import { fetchGames, finalOutcome, predictionTerms, type Outcome } from "../src/football"

const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })
// Sepolia gas is volatile — set dynamically (2× current) at runtime.
let GAS: { gasPrice: bigint; gasLimit: bigint } = { gasPrice: 40_000_000_000n, gasLimit: 300_000n }
const hashTerms = (t: string) => ethers.keccak256(ethers.toUtf8Bytes(t))
const ERC20 = [
  "function mint(address,uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]

async function main() {
  // KEEPER_PRIVATE_KEY = the arbiter (CHAIN.keeperAddress). PLAYER2_PRIVATE_KEY
  // = the open-room joiner (generated + printed if unset).
  const keeperKey = process.env.KEEPER_PRIVATE_KEY
  if (!keeperKey) throw new Error("set KEEPER_PRIVATE_KEY")
  const keeper = new ethers.Wallet(keeperKey, provider)
  let p2Key = process.env.PLAYER2_PRIVATE_KEY
  if (!p2Key) {
    const w = ethers.Wallet.createRandom()
    p2Key = w.privateKey
    console.log("generated player2 — set PLAYER2_PRIVATE_KEY to reuse:", w.privateKey)
  }
  const p2 = new ethers.Wallet(p2Key, provider)
  const fd = await provider.getFeeData()
  GAS = { gasPrice: (fd.gasPrice ?? 20_000_000_000n) * 2n, gasLimit: 300_000n }
  console.log("proposer/keeper:", keeper.address)
  console.log("joiner (player2):", p2.address)
  console.log("gas price:", ethers.formatUnits(GAS.gasPrice, "gwei"), "gwei")

  const usdtK = new ethers.Contract(CHAIN.usdtAddress, ERC20, keeper)
  const usdtP = new ethers.Contract(CHAIN.usdtAddress, ERC20, p2)
  const pactsK = new ethers.Contract(CHAIN.pactsAddress, KICKPACT_PACTS_ABI as unknown as string[], keeper)
  const pactsP = new ethers.Contract(CHAIN.pactsAddress, KICKPACT_PACTS_ABI as unknown as string[], p2)

  if ((await provider.getBalance(p2.address)) < ethers.parseEther("0.015")) {
    console.log("funding player2 gas…")
    await (await keeper.sendTransaction({ to: p2.address, value: ethers.parseEther("0.02"), gasPrice: GAS.gasPrice, gasLimit: 21000n })).wait()
  }
  const stake = 2_000_000n
  console.log("minting test USD₮ to both (open faucet, keeper pays)…")
  await (await usdtK.mint(keeper.address, 100_000_000n, GAS)).wait()
  await (await usdtK.mint(p2.address, 100_000_000n, GAS)).wait() // keeper mints TO player2
  await (await usdtK.approve(CHAIN.pactsAddress, ethers.MaxUint256, GAS)).wait()
  await (await usdtP.approve(CHAIN.pactsAddress, ethers.MaxUint256, GAS)).wait()

  // decisive finished match; proposer predicts the home win (and is right)
  const games = await fetchGames()
  const g = games.find((x) => finalOutcome(x) === "home")
  if (!g) throw new Error("no finished home-win game found")
  const result = finalOutcome(g)!
  const predicted: Outcome = "home"
  const terms = predictionTerms(g, predicted)
  console.log(`\nmatch: ${g.home.shortName} ${g.home.score}-${g.away.score} ${g.away.shortName} (#${g.id})`)
  console.log(`proposer predicts: ${predicted} · official result: ${result} · terms: "${terms}"`)

  const deadline = Math.floor(Date.now() / 1000) + 7 * 86400
  console.log("\ncreating OPEN room (counterparty = 0x0 → anyone can join)…")
  const rcC = await (await pactsK.createPact(ethers.ZeroAddress, keeper.address, stake, hashTerms(terms), deadline, GAS)).wait()
  const ev = rcC.logs.map((l: any) => { try { return pactsK.interface.parseLog(l) } catch { return null } }).find((x: any) => x?.name === "PactCreated")
  const pactId: bigint = ev.args.pactId
  console.log(`open room #${pactId} created`)

  console.log("player2 joining the open room (no invite)…")
  await (await pactsP.acceptPact(pactId, GAS)).wait()
  const pact = await pactsK.getPact(pactId)
  console.log(`joined — counterparty is now ${pact.counterparty} · status ${pact.status} (2 = active)`)

  const expectedWinner = predicted === result ? keeper.address : p2.address
  console.log(`\n>>> ACTIVE open room #${pactId} ready. expected winner (auto-settle): ${expectedWinner}`)
  console.log(`>>> USD₮ before: proposer ${await usdtK.balanceOf(keeper.address)} · player2 ${await usdtP.balanceOf(p2.address)}`)
  console.log(`>>> now run: KEEPER_PRIVATE_KEY=<keeper> bun scripts/kickpact-settle-keeper.ts`)
}
main().catch((e) => { console.error(e); process.exit(1) })
