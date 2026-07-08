// Integration test — pins the app's USD₮0 bridge registry to Tether's REAL
// WDK package. `apps/mobile/src/bridge.ts` is a WDK-surface implementation in
// ethers; its per-chain OFT contract addresses + LayerZero EIDs must be the
// EXACT values shipped by @tetherto/wdk-protocol-bridge-usdt0-evm, so the real
// package can drop in without a behavioural change. CI fails if they drift.
//
// Run: npm run test:integration
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const require = createRequire(import.meta.url)

// The package's exports map only exposes "." (the full protocol — heavy: tron,
// ton, erc-4337). We only need its config, so resolve the package.json (the
// exported "./package" subpath) and import the sibling src/config.js by path.
const pkgJsonPath = require.resolve("@tetherto/wdk-protocol-bridge-usdt0-evm/package")
const configUrl = pathToFileURL(path.join(path.dirname(pkgJsonPath), "src", "config.js"))
const { BLOCKCHAINS, TOKENS } = await import(configUrl.href)

// The app's registry (bridge.ts is TS — extract the table it ships).
// Parsing the literals keeps this test runnable under plain node.
const bridgeTs = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "bridge.ts"),
  "utf8",
)
const rowRe =
  /key:\s*"(\w+)",\s*name:\s*"[^"]+",\s*chainId:\s*([\d_]+),\s*eid:\s*([\d_]+),\s*oft:\s*"(0x[0-9a-fA-F]{40})"/g
const appChains = [...bridgeTs.matchAll(rowRe)].map((m) => ({
  key: m[1],
  chainId: Number(m[2].replace(/_/g, "")),
  eid: Number(m[3].replace(/_/g, "")),
  oft: m[4],
}))

test("the app ships a bridge registry (sanity)", () => {
  assert.ok(appChains.length >= 4, `parsed ${appChains.length} chains from bridge.ts`)
  const keys = appChains.map((c) => c.key)
  for (const k of ["ethereum", "arbitrum", "optimism", "polygon"]) {
    assert.ok(keys.includes(k), `bridge.ts includes ${k}`)
  }
})

test("every app chain matches Tether's @tetherto/wdk-protocol-bridge-usdt0-evm config", () => {
  for (const c of appChains) {
    const real = BLOCKCHAINS[c.key]
    assert.ok(real, `chain "${c.key}" exists in the WDK package`)
    assert.equal(c.oft.toLowerCase(), real.oftContract.toLowerCase(), `${c.key} OFT contract`)
    assert.equal(c.eid, real.eid, `${c.key} LayerZero eid`)
    assert.equal(c.chainId, real.chainId, `${c.key} chainId`)
  }
})

test("USD₮0 token metadata matches the WDK package (6 decimals, OFT keys)", () => {
  assert.equal(TOKENS.USDT0.decimals, 6)
  assert.equal(TOKENS.USDT0.symbol, "USDT0")
  assert.ok(TOKENS.USDT0.contractKeys.includes("oftContract"))
})
