# Kickpact Watch Party — Pears/Bare desktop companion (Pears track)

P2P World Cup watch-party rooms over **Hyperswarm**. Fans who open the same
match land in the same room and chat **directly, peer-to-peer — no server**.
These are the *same rooms* as the Kickpact mobile app's "match room" (identical
topic derivation + wire protocol), so phones and laptops mingle in one swarm.

- **Topic**: `hash("kickpact/match/<gameId>")` — the ESPN match id of the
  fixture (e.g. `760510` = France v Morocco).
- **Wire**: newline-JSON `{type: "hello" | "msg" | "pact"}` over encrypted
  Hyperswarm sockets (full mesh).
- **Identity**: mobile peers sign every message with their WDK wallet key —
  phones verify and render ✓; desktop peers are unsigned ("⚠ unverified"),
  which is the honest split between the WDK and Pears tracks.
- **Bets**: `pact` messages are on-chain escrow proposals (KickpactPacts on
  Sepolia). Desktop shows them; taking a side happens in the mobile app.

## The desktop peer (works today — runs on Bare, the Pears runtime)

```bash
cd apps/pear
bun install                                  # local node_modules

# interactive: type a line + enter to chat; /peers · /quit
./node_modules/.bin/bare cli.js 760510 couch-fan

# headless / automation: announce, then say one thing when a peer arrives
./node_modules/.bin/bare cli.js 760510 tv-couch --say "GOAL!"
```

Two of these on any machines (or one + a phone running Kickpact) find each
other on the DHT and chat. This is the automated E2E for the Pears track —
verified live: a phone peer joined as its wallet address and its message
arrived here as `[0x287B…D4d9 ✓signed] …`.

## The GUI app (`index.html` + `app.js`) — Pear 1.x format

`index.html`/`app.js` are a Pear **v1** desktop app (`main: index.html`).
The Pear 2.x runtime no longer boots HTML entrypoints (`ERR_LEGACY`) — the
supported path is now an Electron shell embedding `pear-runtime`
(see [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron)
and <https://docs.pears.com/how-to/operate-an-app/migration/>).

The GUI is kept as reference UI for that migration; the **terminal peer above
is the supported desktop companion** and exercises the identical room stack
(Hyperswarm + hypercore-crypto on Bare).

Historic pear:// links from the v1 publish flow:

- `pear://57r918r9s67o5djs1c1ta4po5gj5wcfrxy1agxptu5k5utmd6n4y` (latest)
- `pear://0.916.57r918r9s67o5djs1c1ta4po5gj5wcfrxy1agxptu5k5utmd6n4y` (pinned v916 snapshot)

> Note: Pear 2.x also URL-encodes paths — run from a directory without spaces
> (`ERR_INVALID_PROJECT_DIR` under e.g. `/Volumes/Extreme SSD/…`).
