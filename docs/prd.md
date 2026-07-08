# Kickpact — Product Spec

> Authoritative product description. For the pitch, see [`../SUBMISSION.md`](../SUBMISSION.md); for the on‑chain lifecycle, see [`e2e-flow.md`](e2e-flow.md).
>
> Repo: https://github.com/nickthelegend/kickpact

---

## One‑liner

A self‑custodial, mobile‑first **World Cup prediction app**. Your WDK wallet holds **USD₮**; you bet three ways — trustless **Pacts** with a friend, a Tinder‑style on‑chain **Duel**, and real‑money **Polymarket** — and watch matches in a serverless **peer‑to‑peer room**.

## Why this exists

Football is the world's biggest social ritual, but every way people bet on it is either **custodial** (bookmakers, apps that hold your funds and KYC you) or **trust‑based and messy** (group‑chat side bets with no escrow and endless "you never paid me"). Kickpact keeps the social ritual and removes the trust problem: stakes sit in **on‑chain escrow only the outcome can release**, funds live in a **wallet the user alone controls**, and the UX feels like a pixel‑art game, not a trading terminal.

Built for the **Tether Developers Cup** — WDK (self‑custodial wallets) + Pears (peer‑to‑peer).

## Non‑negotiables

- **Self‑custodial.** The seed is generated on‑device and sealed in the OS keychain via WDK secure‑storage behind biometrics. No server ever holds keys or funds.
- **One wallet, one USD₮ balance, three bet tiers.** The wallet identity is shared across every tier and also signs P2P chat.
- **Serverless where it counts.** P2P rooms use no server (Hyperswarm DHT); match‑prediction settlement is deterministic and keeper‑driven, not a trusted oracle service.
- **Feels like a game.** Pixel UI, one‑tap bets, QR to bring a friend in.

---

## The three bet tiers

### Tier 1 — Pacts (P2P escrow bets) · Sepolia
Two people escrow an **equal USD₮ stake** against a plain‑English outcome ("France beat Morocco"). Winner claims the pot; the loser's escrow auto‑releases. No custodian, no KYC.
- **Create** — name a friend's address, or open a **room** anyone can join (`counterparty == 0`). Pick a stake tier (1 / 3 / 5 / 10 USD₮). Share a code or QR.
- **Join** — counterparty accepts and locks an equal stake into the same escrow.
- **Resolve** — by **mutual agreement** (both call `agree(winner)`) or by a **neutral arbiter** (our keeper auto‑settles World Cup predictions from the official result).
- Contract: `KickpactPacts`.

**Group pools (the watch‑party pot)** — the room‑native variant: any number of friends stake the SAME amount into `KickpactPools`, each picks home/draw/away, and the pot splits equally among correct picks when the keeper posts the official result (no winners → refunds; unsettled → self‑refund after grace). Created and joined straight from the P2P match room.

### Tier 2 — Duels (on‑chain PvP swipe game) · Sepolia
A Tinder‑style 1v1. Both players swipe **UP/DOWN** through a commit‑revealed deck of "will this crypto asset beat its strike?" cards on live prices. The contract escrows both stakes and pays the **better market‑reader** — a correct contrarian call scores more than following the crowd.
- **Practice vs bot** — free, instant, fully local; the on‑ramp to the swipe loop.
- **Staked PvP** — pick a stake tier, create + share a code; opponent joins and stakes; both swipe; the keeper posts settlement prices and finalizes.
- Contract: `KickpactDuel` (commit‑reveal deck, real‑PnL scoring).

### Tier 3 — Polymarket (real‑money markets) · Polygon
Trade **real‑money** World Cup markets with live order‑book odds — the real‑stakes version of a Pact — **in‑app**: pick an outcome, enter USDC, and the WDK wallet EIP‑712‑signs a Fill‑or‑Kill order posted straight to Polymarket's CLOB (with balance/allowance checks and a one‑tap USDC.e approve). The in‑app **Swap** and **Bridge** screens move USD₮ onto Polygon to fund this tier.

---

## End‑to‑end player flow

1. **Onboard.** Create a self‑custodial wallet (real 12‑word BIP‑39 seed via WDK) or import a phrase. Keys sealed in the keychain behind biometrics.
2. **Fund.** Mint testnet USD₮ from the in‑app faucet (Sepolia), or on mainnet buy via MoonPay / swap / bridge.
3. **Pick a match.** Home shows live World Cup fixtures (ESPN) with live / upcoming / completed filters.
4. **Bet.** Lock a **Pact** vs a friend, jump into a **Duel**, or open a real **Polymarket** market.
5. **Watch together.** Join the match's **P2P room** — signed chat, live peer count, and in‑room bet proposals that open real escrows.
6. **Settle & pay out.** Duels finalize on‑chain from settlement prices; match Pacts settle automatically when the keeper matches the official result; winners are paid in USD₮.

---

## Screens

SignIn · Home (wallet + fixtures) · Game detail (predict + Match Room) · Pacts · PvP Arena · Duel · Practice · Rank (on‑chain leaderboard) · Profile (wallet hub) · Swap · Bridge · Markets (Polymarket). See `apps/mobile/src/screens.tsx`.

## Success criteria

- A user with no crypto experience creates a self‑custodial wallet and places a bet in under two minutes.
- No server ever holds a user's keys or funds; every payout is enforced by contract or by a deterministic, verifiable keeper.
- Two strangers watching the same match can find each other and wager, with zero shared infrastructure.

## Out of scope (for now)

Fiat payout rails beyond MoonPay sandbox, and non‑football markets. The bet engine generalizes to battle royales / tournaments / gauntlets — future work.
