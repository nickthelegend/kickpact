# Flicky Watch Party — Pear desktop companion (Pears track)

P2P World Cup watch-party rooms over **Hyperswarm**. Fans who open the same
match land in the same room and chat **directly, peer-to-peer — no server**.
These are the *same rooms* as the Flicky mobile app's "match room" (identical
topic derivation + wire protocol), so phones and laptops mingle in one swarm.

- **Topic**: `hash("flicky/match/<gameId>")` — the ESPN match id shown on the
  Flicky game page.
- **Wire**: newline-JSON `{type: "hello" | "msg" | "pact"}` over encrypted
  Hyperswarm sockets (full mesh).
- **Identity**: mobile peers sign every message with their WDK wallet key —
  phones verify and render ✓; desktop peers are unsigned ("⚠ unverified"),
  which is the honest split between the WDK and Pears tracks.
- **Bets**: `pact` messages are on-chain escrow proposals (FlickyPacts on
  Sepolia). Desktop shows them; taking a side happens in the mobile app.

## Run (dev)

```bash
cd apps/pear
bun install          # local node_modules (excluded from the workspace)
pear run --dev .     # opens the watch-party window
```

## Ship a pear:// link

```bash
pear stage main      # bundle into a local Hypercore
pear seed main       # announce it — prints pear://<key>
pear run pear://<key>   # anyone runs it straight from the swarm
```

## Headless / terminal peer

```bash
./node_modules/.bin/bare cli.js <gameId> <nick> --say "GOAL!"
```

Two of these on any machines (or one + a phone) will find each other on the
DHT and chat. Used as the automated E2E for this app.
