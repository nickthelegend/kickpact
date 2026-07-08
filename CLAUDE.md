# CLAUDE.md

Guidance for Claude Code / agents working in this repository.

## Project

**Kickpact** is a self‑custodial, mobile‑first **World Cup prediction app** built for the **Tether Developers Cup** (tracks: **WDK** self‑custodial wallets + **Pears** peer‑to‑peer). Your WDK wallet holds **USD₮** and you bet three ways: **Pacts** (P2P escrow with a friend), **Duels** (Tinder‑style on‑chain PvP), and **Polymarket** (real‑money markets). Fans of the same match meet in a serverless **Hyperswarm watch party**.

`README.md` and `SUBMISSION.md` are the authoritative product descriptions.

> ⚠️ **Legacy code — do not treat as the current product.** This repo began as a Sui + DeepBook Predict swipe‑duel and was pivoted to the EVM/RN app above. These paths are **pre‑pivot Sui and are NOT part of the shipped product**: `apps/web`, `apps/contracts`, `apps/server`, `apps/brain`, `apps/playground`, `docs/deepbook-*`, `docs/oracle-selection.md`, `docs/zklogin-sponsored-gas-plan.md`. When they disagree with the real product, ignore them.

## Monorepo layout (the real product)

```
apps/
├── mobile     # ⭐ the app — Expo / React Native. WDK wallet, 3 bet tiers, Hyperswarm rooms.
├── duel-evm   # ⭐ Solidity + Foundry — KickpactDuel, KickpactPacts, MockUSDT (Sepolia).
├── desktop    # ⭐ Watch Party for Mac/Win/Linux — Electron + pear-runtime Bare worker, Kickpact UI.
└── pear       # ⭐ Bare terminal peer (interactive CLI) + legacy Pear-1 GUI.
videos/
└── kickpact-launch   # HyperFrames project for the 60s launch video (docs/media/kickpact-launch.mp4)
packages/ui, apps/server, apps/web, apps/contracts …   # legacy Sui scaffold (see warning above)
```

## Where things live (mobile app — `apps/mobile/src/`)

- `wallet.tsx` — self‑custodial BIP‑39 wallet + state machine. `storage.native.ts` — **real WDK** secure‑storage (`@tetherto/wdk-react-native-secure-storage`, keychain + biometrics).
- `pact.ts` / `duel.ts` — the two on‑chain bet tiers (Sepolia). `polymarket.ts` — tier 3 (Polygon, Gamma API).
- `swap.ts` / `bridge.ts` / `fiat.ts` — WDK‑shaped modules (Velora swap, USD₮0/LayerZero bridge, MoonPay fiat) — ethers implementations against the WDK module surface so `@tetherto/wdk-protocol-*` drops in.
- `room.ts` (+ `room.bundle.ts`, `scripts/pack-room.mjs`) — Hyperswarm P2P match rooms via a `react-native-bare-kit` worklet. `chain.ts` — RPC + contract addresses. `screens.tsx` — all UI.
- `scripts/kickpact-keeper.ts` — practice bot + duel settler daemon. `scripts/kickpact-settle-keeper.ts` — **serverless** match‑result settler (recomputes deterministic `keccak256(terms)` and pays matching pacts). These are the real backend — **not** `apps/server` (legacy Sui).

## Contracts (`apps/duel-evm/`)

Solidity 0.8.28, Foundry. Deployed to **Sepolia** — addresses in `deployed.json`.
- `KickpactDuel.sol` — commit‑reveal deck; `createDuel`/`joinDuel`/`revealDeck`/`recordSwipe`/`settleCard`(onlyOracle)/`finalize`. Real‑PnL scoring; `*Free` practice variants; `refundDuel`/`claimRevealTimeout` safety paths.
- `KickpactPacts.sol` — equal‑stake escrow; `createPact`/`acceptPact`/`agree(winner)`/`resolveByArbiter(winner)`/`cancelPact`/`refundExpired`. Terms = `keccak256` of a plain‑English string. v2 adds open rooms (`counterparty == 0`).
- `MockUSDT.sol` — 6‑dp USD₮ with an open `mint()` faucet (testnet only).

## Commands

```bash
bun install                       # install all workspaces (Bun ≥ 1.3)
bun --filter mobile start         # Expo dev server for the app
cd apps/duel-evm && forge test    # Solidity test suite (27 tests)
cd apps/duel-evm && forge build   # compile contracts

# tests (all offline; integration uses a hermetic in-process hyperdht testnet)
cd apps/mobile  && bun test src && npm run test:integration
cd apps/desktop && npm test     && npm run test:integration

# desktop watch party
cd apps/desktop && bun install && bun run start
```

Note: hyperswarm's udx-native crashes under `bun test` — that's why integration
tests run under `node --test` (plain .mjs). In P2P integration tests, peers must
join the swarm SEQUENTIALLY (await each announce) or simultaneous first lookups
race to an empty topic and stall on hyperswarm's long refresh timer.

Prebuilt Android release APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (app id `io.kickpact.app`).

## Load‑bearing design decisions

- **Self‑custodial, always.** Keys are generated on‑device and sealed via WDK secure‑storage; the wallet key is the only identity — it signs txs *and* P2P chat.
- **One USD₮ balance, three tiers.** Don't fork the money flow per tier; the wallet + USD₮ balance is shared. Duels/Pacts are Sepolia; swap/bridge/Polymarket are Polygon.
- **Commit‑reveal decks.** Duel decks are `keccak256`‑committed at create, revealed at match start — never expose the unrevealed deck.
- **Serverless settlement.** Match‑prediction pacts settle by recomputing a deterministic terms hash off the official result — no trusted server holds funds or decides outcomes.
- **P2P has no server.** Rooms are pure Hyperswarm DHT; the topic derives from the ESPN match id so phone + desktop peers share one swarm.

## Code style

Bun workspaces + Turborepo. Prettier: no semicolons, double quotes, 2‑space, trailing comma `es5`. TypeScript `strict`. Solidity via Foundry. Prefer `bun` over npm/pnpm/yarn.
