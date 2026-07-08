// Integration test — the GROUP POOL lifecycle end-to-end on a local anvil
// chain, driven through the app's own ABI strings (src/chain.ts) exactly as
// the phone does it:
//
//   deploy → alice opens a pool (home) → bob joins (draw) → carol joins (home)
//   → kickoff passes → the keeper settles the official result → winners split
//   the pot → the contract is drained to zero.
//
// This is the same contract the forge suite covers, but exercised through the
// ethers ABI + helpers the APP ships — a typo'd ABI string or a wrong pick
// encoding fails here. Requires `anvil` (Foundry) + `forge build` artifacts.
// Run: npm run test:integration
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn, execSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, parseUnits } from "ethers"

const here = path.dirname(fileURLToPath(import.meta.url))
const evmRoot = path.join(here, "..", "..", "..", "duel-evm")
const { KICKPACT_POOLS_ABI, USDT_ABI } = await import("../../src/chain.ts")
const { gameKey, pickCode, pickName } = await import("../../src/pool.ts")

const haveAnvil = (() => {
  try {
    execSync("anvil --version", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

function artifact(name) {
  const p = path.join(evmRoot, "out", `${name}.sol`, `${name}.json`)
  if (!existsSync(p)) execSync("forge build", { cwd: evmRoot, stdio: "ignore" })
  return JSON.parse(readFileSync(p, "utf8"))
}

test("group pool lifecycle through the app's ABI (anvil)", { timeout: 120_000 }, async (t) => {
  if (!haveAnvil) return t.skip("anvil not installed")

  const PORT = 8571
  const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" })
  t.after(() => anvil.kill())
  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`, undefined, { pollingInterval: 80 })
  // wait for RPC
  for (let i = 0; i < 60; i++) {
    try {
      await provider.getBlockNumber()
      break
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  // anvil's default funded keys
  const keys = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  ]
  const [deployer, alice, bob, carol] = keys.map((k) => new NonceManager(new Wallet(k, provider)))
  const keeper = deployer // arbiter

  // deploy MockUSDT + KickpactPools from the forge artifacts
  const usdtArt = artifact("MockUSDT")
  const poolsArt = artifact("KickpactPools")
  const usdt = await (await new ContractFactory(usdtArt.abi, usdtArt.bytecode.object, deployer).deploy()).waitForDeployment()
  const pools = await (
    await new ContractFactory(poolsArt.abi, poolsArt.bytecode.object, deployer).deploy(await usdt.getAddress())
  ).waitForDeployment()
  const poolsAddr = await pools.getAddress()

  // the APP's view of the contracts: its own ABI strings from chain.ts
  const appPools = (signer) => new Contract(poolsAddr, KICKPACT_POOLS_ABI, signer)
  const appUsdt = (signer) => new Contract(usdt.target, USDT_ABI, signer)

  const STAKE = parseUnits("5", 6)
  for (const w of [alice, bob, carol]) {
    await (await appUsdt(w).mint(await w.getAddress(), parseUnits("100", 6))).wait()
    await (await appUsdt(w).approve(poolsAddr, parseUnits("1000", 6))).wait()
  }

  // the app's deterministic key for France v Morocco
  const GAME_ID = "760510"
  const key = gameKey(GAME_ID)
  const chainKey = await appPools(alice).getFunction("poolsForGame") // sanity: view resolves
  assert.ok(chainKey)

  const now = (await provider.getBlock("latest")).timestamp
  const kickoff = now + 3600

  // alice opens the pool picking HOME
  const rc = await (await appPools(alice).createPool(key, await keeper.getAddress(), STAKE, kickoff, pickCode("home"))).wait()
  const created = rc.logs.map((l) => {
    try {
      return appPools(alice).interface.parseLog(l)
    } catch {
      return null
    }
  }).find((p) => p?.name === "PoolCreated")
  const poolId = created.args[0]
  assert.equal(poolId, 1n)

  // bob (draw) + carol (home) join
  await (await appPools(bob).joinPool(poolId, pickCode("draw"))).wait()
  await (await appPools(carol).joinPool(poolId, pickCode("home"))).wait()

  const p = await appPools(alice).getPool(poolId)
  assert.equal(p.members.length, 3)
  assert.equal(await appUsdt(alice).balanceOf(poolsAddr), STAKE * 3n)

  // kickoff passes; the keeper posts the official result: HOME won
  await provider.send("evm_increaseTime", [7200])
  await provider.send("evm_mine", [])
  await (await appPools(keeper).settle(poolId, pickCode("home"))).wait()

  const settled = await appPools(alice).getPool(poolId)
  assert.equal(settled.settled, true)
  assert.equal(pickName(Number(settled.result)), "home")
  assert.equal(Number(settled.winners), 2)

  // winners split 15 USD₮ → 7.5 each; bob (draw) is refused
  const a0 = await appUsdt(alice).balanceOf(await alice.getAddress())
  await (await appPools(alice).claim(poolId)).wait()
  assert.equal((await appUsdt(alice).balanceOf(await alice.getAddress())) - a0, parseUnits("7.5", 6))

  await assert.rejects(async () => {
    await (await appPools(bob).claim(poolId)).wait()
  })

  const c0 = await appUsdt(carol).balanceOf(await carol.getAddress())
  await (await appPools(carol).claim(poolId)).wait()
  assert.equal((await appUsdt(carol).balanceOf(await carol.getAddress())) - c0, parseUnits("7.5", 6))

  // pot fully drained — the contract never holds residue
  assert.equal(await appUsdt(alice).balanceOf(poolsAddr), 0n)
})
