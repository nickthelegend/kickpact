# Kickpact — Telegram Mini App

Kickpact as a **Telegram Mini App**: the exact pixel UI of the native app,
built on the [Telegram Mini Apps Next.js template](https://github.com/Telegram-Mini-Apps/nextjs-template),
hitting the **same live Sepolia contracts**. A third client alongside the
Android app and the Pears desktop app.

- Self-custodial WDK-style wallet — a real BIP-39 seed, **AES-GCM encrypted and
  stored in Telegram CloudStorage** (synced to the user's Telegram account,
  off-device) behind a passcode. On a plain browser it falls back to
  localStorage so it still runs.
- Home (live USD₮ balance + World Cup fixtures from ESPN), **group pools**
  (`KickpactPools` on Sepolia), match predictions, Polymarket markets, profile.
- Same design tokens + pixel fonts as `apps/mobile` — one look across every
  client.

> **What's not here (honestly):** the peer-to-peer watch party (Hyperswarm /
> Bare) can't run in a browser sandbox, so it stays the native app's feature.
> The Mini App is the wallet + betting surface.

## Run locally

```bash
cd apps/miniapp
npm install
npm run dev          # http://localhost:3050 (works in a normal browser too)
```

Create a wallet with a passcode, mint testnet USD₮ (needs a drop of Sepolia ETH
for gas — the app links you to a faucet), and open a match → **group pool**.

## Deploy (HTTPS is required by Telegram)

```bash
npm run build
# deploy to Vercel (recommended): `vercel` → get https://kickpact-mini.vercel.app
```

Any HTTPS host works (Vercel, Netlify, Cloudflare Pages). Telegram will only
load a Mini App over HTTPS.

---

## Create the Telegram bot + attach the Mini App

1. **Open [@BotFather](https://t.me/BotFather)** in Telegram → `/newbot`.
   - Give it a name (e.g. `Kickpact`) and a username ending in `bot`
     (e.g. `KickpactBot`). BotFather returns a **bot token** — keep it safe.
2. **Register the Mini App** → send `/newapp` to BotFather → pick your bot, then
   provide:
   - **Title**: Kickpact
   - **Description**: Bet on the World Cup with a wallet that's yours.
   - **Photo / icon** (640×360 / 512×512)
   - **Web App URL**: your deployed HTTPS URL (e.g. `https://kickpact-mini.vercel.app`)
   - a short name → gives you a direct link `https://t.me/KickpactBot/<shortname>`
3. **Add a Menu Button** (opens the app from the chat) → `/setmenubutton` →
   pick the bot → paste the same Web App URL → set the button label (e.g. "⚽ Play").
4. Open the bot in Telegram, tap the menu button → Kickpact launches inside
   Telegram.

That's it — no server needed for the app itself; the Mini App is a static site,
and all state lives on-chain + in the user's Telegram CloudStorage.

### Optional: launch button in a message

Use the [inline keyboard `web_app` button](https://core.telegram.org/bots/webapps#inline-mode-mini-apps)
from any bot backend to drop a "Play Kickpact" button into a chat that opens the
Mini App.

## On-chain

Same contracts as the native app (Sepolia) — see `src/kickpact/chain.ts`:
`KickpactPools`, `KickpactPacts`, `KickpactDuel`, `MockUSDT`. The Mini App reads
and writes them directly with the user's self-custodial wallet.

## Structure

```
src/
├── app/                  # Next.js app router (layout, page → App)
├── components/Root/      # TMA SDK init + WalletProvider
└── kickpact/
    ├── App.tsx           # all screens + bottom nav
    ├── wallet.tsx        # self-custodial wallet context (WDK analogue)
    ├── vault.ts          # AES-GCM seed encryption → Telegram CloudStorage
    ├── ui.tsx            # pixel UI primitives (Px / Panel / PixelButton)
    ├── kickpact.css      # design tokens ported from apps/mobile/src/theme.ts
    ├── chain.ts pool.ts pact.ts clob.ts football.ts polymarket.ts  # ported logic
    └── public/fonts      # KickpactPixel / KickpactDisplay
```
