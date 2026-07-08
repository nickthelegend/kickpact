# apps/server — ⚠️ legacy (pre‑pivot Sui backend)

> **This directory is NOT part of the shipped Kickpact product.** It is the Bun backend from the repo's original incarnation — a Sui + DeepBook Predict swipe‑duel (indexer, DeepBook `OracleSVI` reads, deckmaster, MMR leaderboard, WebSocket match relay). Kept for history.

The shipped app (`apps/mobile`, `apps/duel-evm`, `apps/pear`) does **not** call this server. See the root [`README.md`](../../README.md) and [`CLAUDE.md`](../../CLAUDE.md) for the real product.

## Where the real backend lives

Kickpact's settlement is **serverless** — two keeper daemons, not a hosted service:

- **`apps/mobile/scripts/kickpact-keeper.ts`** — practice‑bot opponent + duel oracle/settler for `KickpactDuel` (posts `settleCard` prices, calls `finalize`).
- **`apps/mobile/scripts/kickpact-settle-keeper.ts`** — auto‑settles World Cup **Pacts** by recomputing the deterministic `keccak256(terms)` from each finished match's official result and calling `resolveByArbiter` on matching `KickpactPacts`. No trusted server holds funds or decides outcomes; anyone can run it and reproduce the result.

Peer‑to‑peer match rooms use **no server at all** — pure Hyperswarm DHT (`apps/mobile/src/room.ts` + `apps/pear`).
