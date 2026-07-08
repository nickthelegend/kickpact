# apps/server

Single-process Bun backend for Kickpact. One `bun --watch src/index.ts`
boots HTTP + WebSocket on the same port and starts every background
service (indexer, keeper, match clock, oracle stream, chat prune).

Open **`http://localhost:3001/docs`** for the Scalar API reference.

## What lives where

```
src/
├── index.ts            # Bun.serve entry + service boot + graceful shutdown
├── env.ts              # centralized env loading
├── log.ts              # tiny tagged logger
├── db.ts               # Bun.sql (Postgres) — cursors, duel mirror, chat, player ratings, deck store
├── deckmaster.ts       # /deckmaster/{generate,reveal} — 5-oracle deck builder + seeded PRG + Postgres plaintext store
├── oracle.ts           # /oracle/list, /oracle/{id} — DeepBook OracleSVI reads
├── duels-api.ts        # /duels/recent, /duels/{id} — read from indexer mirror
├── leaderboard-api.ts  # /leaderboard — top players by MMR
├── docs.ts             # /openapi.json + /docs (Scalar HTML via CDN)
├── sponsor.ts          # /sponsor — Enoki sponsored-gas service + MoveCall allowlist
├── indexer.ts          # cursor-driven event poller → WS rooms + duel mirror + MMR updates
├── keeper.ts           # background settle/redeem/finalize service (in-process)
├── predict.ts          # DeepBook Predict reads — findManagerFor, balance gate
├── mmr.ts              # ELO + window-expanding pair selection
├── ratelimit.ts        # token-bucket per-route rate limits
├── lib/
│   ├── http.ts         # json / cors helpers
│   ├── sui.ts          # SuiClient + Ed25519 keypair helpers
│   └── sui.test.ts
├── ws/
│   ├── protocol.ts     # ClientMsg / ServerMsg wire types + STAKE_TIERS
│   ├── matchmaking.ts  # in-memory queue, rooms, MMR pair selection, forfeit signaling
│   ├── handlers.ts     # Bun WebSocketHandler — parse + dispatch + rate limit
│   ├── practice.ts     # `practice_start` — solo-vs-bot deck (no chain)
│   ├── chat.ts         # global chat room + emoji reactions
│   ├── match-clock.ts  # 1 s tick to active rooms — server-authoritative timing
│   └── oracle-stream.ts # `oracle_subscribe` → live spot/forward broadcast
├── deckmaster.test.ts
├── db.test.ts
├── mmr.test.ts
└── scripts/
    ├── deepbook-discover.ts  # ops: list/inspect DeepBook OracleSVI on testnet
    ├── demo-duel.ts          # one-off: end-to-end DeepBook-backed duel demo
    └── e2e.test.ts           # opt-in live-testnet E2E (needs ADMIN_SECRET_KEY)
```

## HTTP surface

| Method | Path                   | Notes |
|--------|------------------------|-------|
| GET    | `/health`              | status + queues + rooms + cursor lag + service flags |
| GET    | `/docs`                | Scalar UI |
| GET    | `/openapi.json`        | OpenAPI 3.1 spec |
| POST   | `/deckmaster/generate` | `{ asset?, sender? }` → `{ cards[], hash, seed }` — picks 5 nearest BTC oracles >10 min out, derives strikes via seeded PRG (`sha256(sender + asset + ts + nonce)`), commits via sha2-256 |
| GET    | `/deckmaster/reveal`   | `?hash=0x…` → `{ cards[], hash, seed }` — anyone can recompute `sha2_256(BCS(cards)) == hash` to audit |
| GET    | `/oracle/list`         | `?asset=BTC&minHeadroomMs=…` → eligible OracleSVI objects sorted by expiry |
| GET    | `/oracle/{id}`         | single oracle snapshot (spot, forward, expiry, active, settled) |
| GET    | `/duels/recent`        | `?limit=20&status=PENDING\|ACTIVE\|COMPLETE` — read from indexer mirror, no RPC |
| GET    | `/duels/{id}`          | single duel from mirror |
| GET    | `/leaderboard`         | `?limit=20` — top players by MMR rating |
| POST   | `/sponsor`             | Enoki two-step (`create` + `execute`). Allowlist gates which MoveCalls a sponsored PTB can include — see `src/sponsor.ts` |

Rate-limited routes: `/deckmaster/generate` (3 burst, 1/5s), `/sponsor` (5 burst, 5/60s). Headers respect `x-forwarded-for`.

## WebSocket surface (`/ws`)

Single JSON channel. Server is authoritative for matchmaking, rooms, chat history, match clock, oracle ticks.

**Client → server**

| type | fields | notes |
|---|---|---|
| `hello` | `address` | bind socket to address; replies with `chat_history` |
| `queue_join` | `tier` | tier ∈ `starter` / `casual` / `standard` / `high_roller` — `practice` rejected (use `practice_start`). Gated by PredictManager balance ≥ 5 dUSDC |
| `queue_leave` | — | |
| `practice_start` | — | solo-vs-bot deck, no chain commit |
| `room_subscribe` | `duelId` | |
| `room_unsubscribe` | `duelId` | |
| `chat_send` | `text` (≤256) | global, rate-limited |
| `chat_react` | `duelId, emoji` (≤16) | room-scoped, rate-limited |
| `oracle_subscribe` | `oracleIds[]` | |
| `oracle_unsubscribe` | `oracleIds[]` | |
| `ping` | — | |

**Server → client**

| type | fields |
|---|---|
| `hello` | `address` (ack) |
| `queue_status` | `tier, size, waitMs` |
| `queue_left` | — |
| `match_found` | `tier, role: creator\|challenger, opponent` (MMR-paired) |
| `room_state` | indexer-fed: `status, cardsRevealed, cardCount, settledCount, p0Payout, p0Premium, p1Payout, p1Premium, startedAtMs, creator, challenger, stakeCoinType, cardOutcomes[]` |
| `room_settled` | `winner, payoutTo` |
| `peer_left` / `peer_rejoined` / `peer_forfeit` | `duelId, address, gracePeriodMs?` |
| `practice_session` | `cards[], botSwipes[]` |
| `chat_history` | last `CHAT_HISTORY_LIMIT` messages |
| `chat_message` | `id, from, text, timestampMs` (global broadcast) |
| `chat_reaction` | `duelId, from, emoji, timestampMs` (sent only to creator + challenger sockets) |
| `oracle_tick` | `oracleId, spot, forward, expiry, settled, svi?, timestampMs` |
| `match_tick` | `duelId, serverNowMs, status` (every 1 s for active rooms) |
| `pong` | — |
| `error` | `code, message, detail?` |

`cardOutcomes[]` entries (per settled card) carry: `{cardIdx, settlementPrice, strike, upWon, p0Pnl, p1Pnl, p0Swipe, p1Swipe}` — server pre-computes `upWon = settlementPrice > strike` and signed per-card real PnL `(won ? quantity : 0) - premium` so the UI doesn't have to.

See `src/ws/protocol.ts` for exact TypeScript types.

## Background services

- **Indexer** — polls 6 kickpact event types ascending from per-tracker cursors stored in `event_cursor` (Postgres). Refreshes touched duels → mirrors to `duel` table → broadcasts `room_state` to subscribers. Also applies MMR ELO update on `DuelFinalized`. Restart-safe; first boot seeds cursors to latest event so we don't replay history.
- **Keeper** — sweeps recent duels and runs `reveal_deck` (when plaintext is in the store) → `settle_card × pending` → `redeem_permissionless × N` (dUSDC only) → `finalize` in a single PTB. Permissionless on chain.
- **Match clock** — every 1 s, pushes `match_tick { serverNowMs, status }` to subscribers of every non-`COMPLETE` room. PRD: "match timing is authoritative from the server."
- **Oracle stream** — every 2 s, batch-reads every currently-subscribed `OracleSVI` and pushes `oracle_tick` to each oracle's subscribers. Powers the lockup-phase live-mark UI.
- **Chat prune** — hourly sweep keeps the newest `CHAT_RETAIN_COUNT` rows in `chat_message`.
- **Rate-limit GC** — drops fully-refilled token buckets every 60 s.

Toggle: `INDEXER_ENABLED=false` / `KEEPER_ENABLED=false` (background services other than these two always run; they're cheap and need no chain credentials).

## Postgres (Bun.sql)

All persistence is Postgres, reached through Bun's built-in `Bun.sql` (zero extra deps) over a connection pool built from `DATABASE_URL`. The schema is created on first use (`CREATE TABLE IF NOT EXISTS`, idempotent), so a fresh database needs no migration step. Because the backend is now stateless, it runs as a normal container (no volume) and can fan out across replicas.

| Table | Owner | Purpose |
|---|---|---|
| `event_cursor` | indexer | per-tracker `(tx_digest, event_seq)` cursor for restart safety |
| `duel` | indexer | mirror of recent duel state for `/duels/*` reads |
| `chat_message` | chat | global chat backlog, auto-pruned |
| `player_rating` | mmr | ELO ratings + W/L/T counters |
| `deck` | deckmaster | commit-reveal plaintext keyed by hash (was `.data/decks.json`) |

`DATABASE_URL` is required. On Railway the deployed service references the Postgres plugin's private URL; locally use the public proxy URL or a local Postgres. See `.env.example`.

## Commands

```bash
bun --filter server dev                # bun --watch src/index.ts (default :3001)
bun --filter server start              # production-style run
bun --filter server test               # unit tests — DB suites skip unless TEST_DATABASE_URL is set
bun --filter server test:e2e           # live testnet E2E (requires ADMIN_SECRET_KEY)
bun --filter server typecheck          # tsc --noEmit
bun --filter server deepbook:discover  # list active DeepBook OracleSVI on testnet
bun --filter server demo:duel          # end-to-end DeepBook-backed duel demo
```

## Env

Copy `.env.example` → `.env` and fill what your local run needs. **`DATABASE_URL` is required** for any DB-backed feature (duel mirror, chat, MMR, deck store). The HTTP/WS layer still boots without it — `/health` answers and reports the DB as unreachable — but the indexer/keeper/chat will error until it's set. For the keeper to settle: `KEEPER_SECRET_KEY` (falls back to `BOT_SECRET_KEY`). For sponsored gas: `ENOKI_PRIVATE_KEY`. Default network is `testnet`; DeepBook + dUSDC ids are baked into `env.ts` defaults so `.env` only carries overrides. To serve mainnet sponsored gas you must also set `KICKPACT_PACKAGE_MAINNET` + `DEEPBOOK_PREDICT_PACKAGE_MAINNET` — sponsor throws a clear error rather than approve `0x0` placeholders.

## Deploy (Railway)

The server + its Postgres both live in one Railway project (workspace **Le Quoc Uy's Projects**). State is in Postgres, so the container is stateless — no volume.

- `railway.json` (repo root) pins the **Dockerfile** builder at `apps/server/Dockerfile` and the `/health` healthcheck.
- `.railwayignore` / `.dockerignore` keep `node_modules` + **`.env` secrets** out of the build context — env is injected at runtime via Railway service variables.
- The `kickpact-server` service reads `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network). Add `KEEPER_SECRET_KEY`, `ENOKI_PRIVATE_KEY`, `ALLOWED_ORIGIN` as service variables to light up the keeper / sponsor / CORS.

```bash
railway up --service kickpact-server --ci    # build + deploy current dir
railway domain --service kickpact-server      # mint a public URL
railway logs --service kickpact-server        # tail runtime logs
```

The same image runs locally for a smoke test (point `DATABASE_URL` at a reachable Postgres):

```bash
docker build -f apps/server/Dockerfile -t kickpact-server .   # from repo root
docker run --rm -p 3001:3001 -e DATABASE_URL=postgres://… kickpact-server
```
