# Kickpact — bet on football with a wallet that's yours

**Tracks: WDK (self‑custodial wallets) · Pears (peer‑to‑peer)**

A self‑custodial, mobile‑first **World Cup prediction app**. Your wallet holds **USD₮** and never leaves your phone — then you bet three ways: trustless **Pacts** with a friend, a Tinder‑style on‑chain **Duel**, or real‑money **Polymarket** markets. Fans of the same match meet in a **serverless peer‑to‑peer watch party** over Hyperswarm, where every message is signed by your wallet.

- 🔗 **Code:** https://github.com/nickthelegend/kickpact
- ▶️ **60‑second launch video:** https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-launch.mp4
- ⛓️ **Live on Ethereum Sepolia** (contracts below) · Polygon mainnet for real‑money markets

<p align="center">
  <a href="https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-launch.mp4">
    <img src="https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/preview.gif" alt="Kickpact launch video" width="720" />
  </a>
</p>

---

## The problem

Football is the world's biggest social ritual — and the way people already "bet" on it (group chats, side‑bets with friends, the office pool) is trustless in spirit but **custodial and messy in practice**: someone has to hold the money, and someone has to be trusted to pay out. Every existing option makes it worse, not better:

- **Bookmakers & betting apps** — custodial, KYC‑gated, they hold your funds and take a cut.
- **Group‑chat side bets** — no escrow, pure trust, constant "you never paid me."
- **Prediction‑market UIs** — powerful, but they look like a Bloomberg terminal, not something you'd hand a friend at a watch party.

## The solution

**Kickpact keeps the ritual and removes the trust problem.** Every stake sits in **on‑chain escrow that only the outcome can release**, the money lives in a **wallet you alone control** (built on Tether's WDK), and the whole thing feels like a pixel‑art mobile game rather than a DeFi terminal.

> **Your keys. Your USD₮. Your call on the match.**

---

## Three ways to bet — one wallet, one USD₮ balance

| | Tier | What it is | Where |
| --- | --- | --- | --- |
| 🤝 | **Pacts** | Escrow a bet with a friend (or an open room anyone can join). Both sides stake equal USD₮; the winner claims the pot, the loser's escrow auto‑releases. Resolve by mutual agreement, or let a neutral arbiter (our serverless keeper) settle it from the official result. | `KickpactPacts` on **Sepolia** |
| ⚔️ | **Duels** | A Tinder‑style 1v1: both players swipe UP/DOWN through a commit‑revealed deck of "will this asset beat its strike?" cards on live prices. The contract escrows both stakes and pays the better market‑reader — a correct contrarian call scores more than following the crowd. Free practice‑vs‑bot mode too. | `KickpactDuel` on **Sepolia** |
| 📈 | **Polymarket** | Browse and trade **real‑money** World Cup markets with live order‑book odds — the real‑stakes version of your Pacts. | Polymarket CLOB on **Polygon** |

The in‑app **Swap** and **Bridge** screens move USD₮ onto Polygon to fund that third tier; the testnet Pacts and Duels stay on Sepolia.

---

## WDK track — a wallet that never leaves the phone

Kickpact is built around Tether's **Wallet Development Kit**: the wallet *is* the identity, and the same key that holds your USD₮ also signs your bets and your chat.

- **Secure storage (live WDK integration).** The seed is sealed with **`@tetherto/wdk-react-native-secure-storage`** into the device keychain (Secure Enclave / StrongBox) behind biometrics — `apps/mobile/src/storage.native.ts`.
- **Self‑custodial wallet.** On‑device BIP‑39 seed, 12‑word backup / import, an explicit `INITIALIZING → NO_WALLET → BACKUP_PENDING → READY` state machine mirroring WDK RN core — `apps/mobile/src/wallet.tsx`.
- **Swap** — real swaps via the Velora/ParaSwap aggregator, shaped to drop in `@tetherto/wdk-protocol-swap-velora-evm` (`src/swap.ts`).
- **Bridge** — cross‑chain USD₮ over the **USD₮0 / LayerZero OFT**, mirroring `@tetherto/wdk-protocol-bridge-usdt0-evm` with verified OFT addresses + LayerZero EIDs (`src/bridge.ts`).
- **Fiat on/off‑ramp** — MoonPay buy/sell, mirroring `@tetherto/wdk-protocol-fiat-moonpay` (`src/fiat.ts`).

> **Honest scope:** secure‑storage is a live WDK dependency. Swap / bridge / fiat / core are implemented in ethers against the exact WDK module surface, so the real `@tetherto/wdk-protocol-*` packages drop straight in.

## Pears track — the peer‑to‑peer watch party

Open any match and **join the room**: a serverless watch party where fans of the same game find each other on the Hyperswarm DHT.

- **Real P2P.** A **Bare** worklet (`react-native-bare-kit`) runs **Hyperswarm** on the phone and joins a topic derived from the match id — `hash("kickpact/match/<gameId>")` — so everyone watching the same game lands in the same swarm (`apps/mobile/src/room.ts`).
- **Signed identity = wallet identity.** Every message is signed with your WDK key and verified with `ethers.verifyMessage`; verified peers render ✓, unsigned ones ⚠.
- **Bet from the room.** Propose a wager in‑chat and it opens an on‑chain `KickpactPacts` escrow (open room, keeper arbiter); other fans tap *join bet* to take the other side. QR "join‑escrow" flows through the same contract.
- **Desktop companion.** `apps/pear/` is a **Pears** (`pear run`) "Watch Party" window plus a headless `bare cli.js` peer — the same rooms, on the same swarm, on desktop.

---

## What's on‑chain

Solidity 0.8.28, Foundry, deployed to **Ethereum Sepolia** (`chainId 11155111`).

| Contract | Address (Sepolia) |
| --- | --- |
| **KickpactDuel** | [`0x045Ad96EB24CE29f02C4E41542507DE26FE13895`](https://sepolia.etherscan.io/address/0x045Ad96EB24CE29f02C4E41542507DE26FE13895) |
| **KickpactPacts** (v2, open rooms) | [`0xc84a624109e6406d1a5Aa8413B19a1CFFCFe7f5A`](https://sepolia.etherscan.io/address/0xc84a624109e6406d1a5Aa8413B19a1CFFCFe7f5A) |
| **MockUSDT** (USD₮, 6dp, open faucet) | [`0x4802B35fFE360CAcF7bc22702544DDA207b950A3`](https://sepolia.etherscan.io/address/0x4802B35fFE360CAcF7bc22702544DDA207b950A3) |
| **oracleKeeper** (settles duels + match results) | [`0x72AE77B55A9195526170bb4D8D2B6f20d37b8262`](https://sepolia.etherscan.io/address/0x72AE77B55A9195526170bb4D8D2B6f20d37b8262) |

Stakes and payouts are in **USD₮** (6 decimals); gas is Sepolia ETH. On Polygon, the swap/bridge/Polymarket tier uses real Tether. Settlement is **serverless**: a keeper recomputes the deterministic `keccak256` of each finished match's result and matches it against on‑chain pacts, so payout closes automatically with no trusted server.

---

## The app, screen by screen

| | | |
| --- | --- | --- |
| ![Onboarding](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-01-onboarding.png) | ![Home](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-03-home.png) | ![Match](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-04-match.png) |
| **Self‑custodial onboarding** — a real 12‑word wallet via WDK. | **Home** — USD₮ balance on Sepolia, WDK actions, live World Cup fixtures. | **Match** — join the P2P watch party or lock a prediction vs a friend. |
| ![Pacts](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-05-pacts.png) | ![PvP](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-06-pvp.png) | ![Duel](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-07-duel-game.png) |
| **Pacts** — escrow a bet, no custodian, no KYC. | **PvP Arena** — practice free or stake a 1v1 Duel. | **Duel** — swipe UP/DOWN on live‑price cards. |
| ![Profile](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-08-profile.png) | ![Swap](https://raw.githubusercontent.com/nickthelegend/kickpact/main/docs/media/screens/shot-09-swap.png) | |
| **Profile** — keys never leave the device. | **Swap** — the rail that funds the Polymarket tier. | |

---

## Tech stack

| Layer | Stack |
| --- | --- |
| **Mobile** | Expo ~56 · React Native 0.85 · React 19 · TypeScript · ethers v6 · **WDK secure‑storage** · biometrics · QR (`expo-camera`) · custom pixel UI. App id `io.kickpact.app`. |
| **Contracts** | Solidity 0.8.28 · Foundry · Ethereum Sepolia |
| **P2P** | Hyperswarm DHT · **Bare** runtime (`react-native-bare-kit` on mobile, **Pears** on desktop) · wallet‑signed JSON wire |
| **Settlement** | Two serverless keeper daemons (`apps/mobile/scripts/`) — practice bot + duel settler, and the deterministic match‑result settler |
| **External** | ESPN (fixtures/results) · Polymarket Gamma API · Velora/ParaSwap · LayerZero USD₮0 · MoonPay |

## Run it / try the demo

```bash
bun install
bun --filter mobile start          # Expo dev server → build/run on device or emulator
cd apps/duel-evm && forge test     # Solidity test suite
```

On first launch the app generates a real self‑custodial seed; on a testnet build, mint USD₮ from the in‑app faucet (Sepolia) and you're ready to bet. Prebuilt release APK: `apps/mobile/android/app/build/outputs/apk/release/`.

## What's next

- In‑app Polymarket CLOB order signing (currently deep‑links out).
- Swap in the real `@tetherto/wdk-protocol-*` packages behind the existing module surfaces.
- More bet formats on the same engine: battle royales, daily solo gauntlets, tournaments, streak rewards.

**The bigger idea:** self‑custodial betting can feel like a game. Make it feel like one and you onboard everyone — not just traders.
