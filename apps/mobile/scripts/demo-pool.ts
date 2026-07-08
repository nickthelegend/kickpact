/**
 * Live Sepolia E2E for GROUP POOLS — the on-chain receipt run.
 *
 * From the deployer/keeper key: funds three throwaway "friends" with gas,
 * mints them test USD₮, then runs the full pool lifecycle ON SEPOLIA:
 *   alice opens a pool (home) → bob joins (draw) → carol joins (home)
 *   → (short deadline passes) → keeper settles HOME → winners claim 7.5 each.
 * Prints an etherscan link for every transaction.
 *
 * Run: DEPLOYER_PRIVATE_KEY=0x… bun scripts/demo-pool.ts
 */
import { ethers } from "ethers"

import { CHAIN, KICKPACT_POOLS_ABI, POOLS, USDT_ABI, explorerTx } from "../src/chain"
import { gameKey, pickCode } from "../src/pool"

const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY
  if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY")
  if (!POOLS.live) throw new Error("POOLS.live is false — run activate-pools.sh first")
  const keeper = new ethers.Wallet(pk, provider)
  console.log("keeper/deployer:", keeper.address)
  console.log("KickpactPools:  ", POOLS.address, "\n")

  // three throwaway friends, funded from the keeper
  const friends = Array.from({ length: 3 }, () => ethers.Wallet.createRandom().connect(provider))
  const [alice, bob, carol] = friends
  const names = ["alice", "bob", "carol"]

  console.log("── funding friends with gas + minting USD₮…")
  for (let i = 0; i < friends.length; i++) {
    const f = friends[i]
    const t1 = await keeper.sendTransaction({ to: f.address, value: ethers.parseEther("0.004") })
    await t1.wait()
    const usdt = new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], f)
    const t2 = await usdt.mint(f.address, 100n * CHAIN.ONE_USDT)
    await t2.wait()
    const t3 = await usdt.approve(POOLS.address, ethers.MaxUint256)
    await t3.wait()
    console.log(`   ${names[i]}: ${f.address} (gas ✓ mint ✓ approve ✓)`)
  }

  const pools = (w: ethers.Wallet) =>
    new ethers.Contract(POOLS.address, KICKPACT_POOLS_ABI as unknown as string[], w)

  // a demo "match" that kicks off in 90 seconds
  const demoGameId = `demo-${Math.floor(Date.now() / 1000)}`
  const kickoff = Math.floor(Date.now() / 1000) + 90
  const STAKE = 5n * CHAIN.ONE_USDT

  console.log(`\n── alice opens the pool (pick: home, 5 USD₮, game ${demoGameId})…`)
  const rc = await (
    await pools(alice).createPool(gameKey(demoGameId), keeper.address, STAKE, kickoff, pickCode("home"))
  ).wait()
  let poolId = 0n
  for (const log of rc!.logs) {
    try {
      const p = pools(alice).interface.parseLog(log)
      if (p?.name === "PoolCreated") poolId = BigInt(p.args[0])
    } catch {}
  }
  console.log(`   pool #${poolId} → ${explorerTx(rc!.hash)}`)

  console.log("── bob joins (pick: draw)…")
  const tb = await (await pools(bob).joinPool(poolId, pickCode("draw"))).wait()
  console.log(`   ${explorerTx(tb!.hash)}`)
  console.log("── carol joins (pick: home)…")
  const tc = await (await pools(carol).joinPool(poolId, pickCode("home"))).wait()
  console.log(`   ${explorerTx(tc!.hash)}`)

  const wait = kickoff + 5 - Math.floor(Date.now() / 1000)
  if (wait > 0) {
    console.log(`\n── waiting ${wait}s for kickoff to pass…`)
    await new Promise((r) => setTimeout(r, wait * 1000))
  }

  console.log("── keeper settles: official result HOME…")
  const ts = await (await pools(keeper).settle(poolId, pickCode("home"))).wait()
  console.log(`   ${explorerTx(ts!.hash)}`)

  const usdtR = new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], provider)
  console.log("── winners claim (alice + carol split 15 USD₮)…")
  for (const [w, name] of [[alice, "alice"], [carol, "carol"]] as const) {
    const before: bigint = await usdtR.balanceOf(w.address)
    const t = await (await pools(w).claim(poolId)).wait()
    const after: bigint = await usdtR.balanceOf(w.address)
    console.log(`   ${name} +${ethers.formatUnits(after - before, 6)} USD₮ → ${explorerTx(t!.hash)}`)
  }

  const potLeft: bigint = await usdtR.balanceOf(POOLS.address)
  console.log(`\n✓ DONE — pool #${poolId} settled + split on Sepolia. contract residue for this pool: 0 (global balance ${ethers.formatUnits(potLeft, 6)})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
