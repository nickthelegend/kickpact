# End‑to‑End Flow

How a bet travels from tap to payout across Kickpact's three tiers, plus the peer‑to‑peer room. Contracts live in [`../apps/duel-evm/src`](../apps/duel-evm/src) (Sepolia); the app in [`../apps/mobile`](../apps/mobile). See [`prd.md`](prd.md) for product intent.

Everything below is **self‑custodial**: the player signs every transaction with their own WDK wallet key; no server holds keys or funds.

---

## Tier 1 — Pacts (P2P escrow) · `KickpactPacts`

A plain‑English bet held in equal‑stake escrow.

```
create ─────────────► accept ─────────────► resolve ─────────────► payout
creator locks stake   counterparty locks    agree(winner) ×2  OR   winner claims pot;
+ terms hash          equal stake            resolveByArbiter       loser escrow releases
```

1. **Create** — `createPact(...)`. The creator escrows their USD₮ stake and stores `keccak256(terms)` (e.g. `"WORLDCUP:FRA-MAR:FRANCE"`). Counterparty is a named address, or `0x0` for an **open room** anyone can join. Approve USD₮ to the contract first.
2. **Accept** — `acceptPact(pactId)`. The counterparty locks an **equal** stake into the same escrow. Both sides are now committed.
3. **Resolve** — either
   - **Mutual:** both call `agree(pactId, winner)`; when they agree, the pot is released; or
   - **Arbiter:** a designated arbiter calls `resolveByArbiter(pactId, winner)`. For World Cup pacts the arbiter is the **keeper**, which settles automatically from the official result (see *Serverless settlement* below).
4. **Payout** — the winner receives both stakes in USD₮; a tie/refund path returns stakes.
5. **Safety** — `cancelPact` (before accept) and `refundExpired` (if it never resolves) return escrowed funds. Read state with `getPact`; hash terms client‑side with `hashTerms`.

## Tier 2 — Duels (on‑chain PvP swipe game) · `KickpactDuel`

A commit‑reveal 1v1 on live crypto prices, scored by real PnL.

```
create ──► join ──► reveal ──► swipe ──► settle each card ──► finalize
commit     opponent  deck       UP/DOWN   oracle posts price   better reader
deck hash  stakes    revealed   per card  per card             takes the pot
```

1. **Create** — `createDuel(stake, deckCommitment)` (or `createDuelFree(deckCommitment)` for practice). The deck is `keccak256`‑committed so it can't be changed later; the salt is kept in secure storage. Share a duel code / QR.
2. **Join** — `joinDuel(duelId)`. The opponent escrows an equal stake.
3. **Reveal** — `revealDeck(duelId, cards, salt)`. The contract checks the reveal against the commitment; each `Card { oracle, strike }` pins its own price reference.
4. **Swipe** — `recordSwipe(duelId, cardIdx, isUp)` per card. UP = will beat strike, DOWN = won't.
5. **Settle** — the **oracle keeper** calls `settleCard(duelId, cardIdx, settlementPrice)` (`onlyOracle`) once per card, recording each player's per‑card payout vs premium.
6. **Finalize** — `finalize(duelId)` compares aggregate PnL and pays the winner the pot. Contrarian correct calls (lower implied probability) score more than consensus calls.
7. **Safety** — `refundDuel` / `claimRevealTimeout` unwind a stuck duel. Read with `getDuel` / `getCard` / `getSwipes`.

## Tier 3 — Polymarket · Polygon

1. **Fund Polygon** — in‑app **Swap** (USD₮→USDC via Velora/ParaSwap) and **Bridge** (USD₮ over USD₮0 / LayerZero) move value onto Polygon.
2. **Browse** — the Markets screen lists live World Cup markets with YES/NO cents + volume (Polymarket Gamma API).
3. **Trade** — currently deep‑links to Polymarket for order signing; in‑app CLOB signing is next.

---

## The peer‑to‑peer room (Pears) · `apps/mobile/src/room.ts`

No server — pure Hyperswarm DHT.

1. **Join** — opening a match spins up a **Bare** worklet (`react-native-bare-kit`) that runs Hyperswarm and joins the topic `hash("kickpact/match/<gameId>")`, where `gameId` is the ESPN match id. Phone and desktop (`apps/pear`) peers watching the same match land in the same swarm.
2. **Chat** — newline‑delimited JSON over encrypted sockets. Every message is signed with the WDK wallet key and verified with `ethers.verifyMessage`; verified peers render ✓, unsigned ⚠.
3. **Bet from the room** — a fan proposes a wager; the app opens an **open `KickpactPacts` escrow** (arbiter = keeper) and broadcasts a `pact` message. Other fans tap *join bet* → `acceptPact` to take the other side. QR "join‑escrow" flows through the same contract.

---

## Serverless settlement (`apps/mobile/scripts/`)

- **`kickpact-keeper.ts`** — daemon that plays the bot opponent for free practice duels and, as the oracle, posts `settleCard` prices and `finalize`s.
- **`kickpact-settle-keeper.ts`** — auto‑settles World Cup **Pacts** with no trusted server: the on‑chain `terms` is `keccak256` of a **deterministic** string derived from the match + outcome. The keeper recomputes that hash for every finished match × outcome and matches it against open pacts, then calls `resolveByArbiter`. Anyone can run it and get the same result — settlement is verifiable, not authoritative.
