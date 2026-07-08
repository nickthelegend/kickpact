# DoraHacks submission — copy-paste answers

> BUIDL body: paste [`SUBMISSION.md`](../SUBMISSION.md). Everything below fills the extra form fields.

## 📝 Project description (≤200 chars)

> Kickpact — a self-custodial World Cup prediction app. Your WDK wallet holds USD₮; bet 3 ways — trustless P2P Pacts, on-chain PvP Duels, real-money Polymarket — plus a serverless Hyperswarm watch party.

*(190 chars. Shorter 178-char variant: "Self-custodial World Cup betting. Your WDK wallet holds USD₮; bet 3 ways — P2P escrow Pacts, on-chain PvP Duels, real-money Polymarket — over a serverless Hyperswarm watch party.")*

## 👨‍💻 Which Tether platform does your project use, and how does it use it?

> **Two: WDK and Pears — Kickpact is built on both.**
>
> **WDK (Wallet Development Kit)** — the self-custodial core. The seed is generated on-device and sealed in the OS keychain (Secure Enclave / StrongBox) behind biometrics via `@tetherto/wdk-react-native-secure-storage`. That one WDK wallet holds the user's USD₮, signs every on-chain bet (Pacts escrow + PvP Duels on Sepolia), and its swap / bridge (USD₮0 · LayerZero) / fiat (MoonPay) flows are built against the WDK protocol-module surface — the bridge registry is even pinned by a CI parity test to the real `@tetherto/wdk-protocol-bridge-usdt0-evm` package. No server ever holds keys or funds.
>
> **Pears (Holepunch)** — the peer-to-peer layer. Each match opens a serverless watch-party room on **Hyperswarm**: fans of the same game find each other over the DHT with zero infrastructure. On mobile it runs inside a **Bare** worklet (`react-native-bare-kit`); on desktop it's an Electron app whose P2P layer runs in a Bare worker via `pear-runtime`, plus an interactive Bare terminal peer. Every phone message is signed by the WDK wallet key and verified by peers — your P2P identity IS your wallet.
>
> **Where they meet:** propose a bet inside a Pears room and it opens a real WDK-signed on-chain USD₮ escrow — Pears carries the social layer, WDK carries the money, one key powers both.

## 🏆 In one line, what problem does your project solve?

> Betting on football with friends is either custodial (bookies hold your money and KYC you) or pure trust ("you never paid me") — Kickpact makes it self-custodial: stakes sit in on-chain escrow only the match result can release.

## 🌎 Country or region your team represents

> United Arab Emirates (UAE)

## 👀 What was your biggest blocker

> Running true peer-to-peer inside React Native. First, passing the Bare worklet bundle across JSI as a string segfaulted the app — fixed by packing it to base64 and rehydrating as a `Uint8Array`. Then `react-native-bare-kit@0.15.0`'s prebuilt native library crashed with a SIGSEGV in `bare_kit__on_thread_enter` the moment the Hyperswarm worklet started on Android API 35 — we bisected to the prebuilt binary and pinned 0.14.5, after which the same release build joined P2P rooms flawlessly. Debugging native crashes through logcat stack traces inside a React Native + Bare + Hyperswarm sandwich was the hardest part of the project.

## 🎥 Demo video link (YouTube, unlisted, 3 minutes max)

**The video is ready**: [`docs/media/kickpact-demo.mp4`](media/kickpact-demo.mp4) (2:17, 1080p) — also on the [GitHub release](https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-demo.mp4).

**To finish this field:** upload that MP4 to YouTube as *Unlisted* → paste the link.
Suggested title: `Kickpact — self-custodial World Cup betting (Tether Developers Cup demo)`

Contents: 60s launch film → live app walkthrough (WDK wallet, USD₮ escrow pacts, PvP duel on live prices) → the 3-platform P2P room recorded live (phone + desktop + terminal, wallet-signed chat) → outro.

## 🐦 A Twitter/X post about your project (link)

**To finish this field:** post the draft below from your account → paste the tweet URL.

> Introducing **Kickpact** ⚽️🔒
>
> Bet on the World Cup with a wallet that's actually yours. Your @Tether_to WDK wallet holds USD₮ — bet 3 ways: P2P escrow Pacts, on-chain PvP Duels, and real Polymarket markets. Plus a serverless Hyperswarm watch party where every message is signed by your wallet.
>
> No custodian. No KYC. Just you, your keys, and the match.
>
> Built for the Tether Developers Cup 🏆
> 🔗 github.com/nickthelegend/kickpact
>
> #Tether #USDT #WDK #Pears

## Quick links (for any other fields)

| | |
| --- | --- |
| Repo | https://github.com/nickthelegend/kickpact |
| Demo video (MP4) | https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-demo.mp4 |
| Android APK | https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-android-arm64.apk |
| macOS desktop app | https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/Kickpact-Watch-Party-macOS-arm64.dmg |
| Launch film (60s) | https://github.com/nickthelegend/kickpact/releases/download/v1.0.0/kickpact-launch.mp4 |
| Contracts (Sepolia) | KickpactDuel `0x045Ad96EB24CE29f02C4E41542507DE26FE13895` · KickpactPacts `0xc84a624109e6406d1a5Aa8413B19a1CFFCFe7f5A` |
| Tests / CI | 60 tests green (17+2+3 mobile, 7+4 desktop, 27 contracts) — Actions tab |
