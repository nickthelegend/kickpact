"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const FEATURES = [
  {
    tag: "WDK",
    title: "A wallet that never leaves your phone",
    body: "Kickpact is built on Tether's Wallet Development Kit. Your seed is generated on-device and sealed in the OS keychain (Secure Enclave / StrongBox) behind biometrics — or, in the Telegram Mini App, AES-encrypted into Telegram Cloud Storage behind a passcode. The wallet is the identity: it holds your USD₮, signs every bet, and signs your chat.",
    shot: "shot-01-onboarding",
  },
  {
    tag: "PACTS · SEPOLIA",
    title: "Trustless friend bets",
    body: "Escrow a bet with a friend or an open room. Both sides stake equal USD₮; the winner claims the pot and the loser's escrow auto-releases. Resolve by mutual agreement or a neutral keeper that settles from the official result. No custodian, no KYC.",
    shot: "shot-05-pacts",
  },
  {
    tag: "GROUP POOLS · LIVE",
    title: "The watch-party pot",
    body: "Start a pool in the match room: everyone stakes the same USD₮ into the KickpactPools contract and picks an outcome. After the match the keeper posts the official result and everyone who called it splits the pot equally. Nobody right? Everyone refunds. The contract — not a friend — holds the money.",
    shot: "shot-13-group-pool",
  },
  {
    tag: "DUELS · SEPOLIA",
    title: "Swipe the market, 1v1",
    body: "A Tinder-style duel: both players swipe UP/DOWN through a commit-revealed deck of live-price cards. The contract escrows both stakes and pays the better market-reader — a correct contrarian call scores more than following the crowd. Free practice-vs-bot mode too.",
    shot: "shot-07-duel-game",
  },
  {
    tag: "POLYMARKET · POLYGON",
    title: "Real-money markets, in-app",
    body: "Trade live World Cup markets with real order-book odds. Your wallet EIP-712-signs a Fill-or-Kill order and posts it straight to Polymarket's CLOB — byte-identical to the official SDK. The in-app swap and bridge move USD₮ onto Polygon to fund it.",
    shot: "shot-09-swap",
  },
  {
    tag: "PEARS · NO SERVER",
    title: "Peer-to-peer watch party",
    body: "Fans of the same match meet in a serverless Hyperswarm room — signed chat, live peer count, and bets proposed in the room. Runs on the phone (Bare worklet), the desktop app (Electron + pear-runtime), and a terminal peer. Every message is wallet-signed and verified.",
    shot: "shot-10-p2p-room-live",
  },
]

export default function FeaturesPage() {
  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-6 text-center">
        <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">WHAT KICKPACT DOES</div>
        <h1 className="font-display text-4xl md:text-5xl text-white">Features</h1>
        <p className="text-white/55 mt-4 max-w-xl mx-auto">Self-custodial money, peer-to-peer crowds. Every stake enforced by contract.</p>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {FEATURES.map((f, i) => (
          <motion.div key={f.title} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
            className={`kp-panel p-6 md:p-8 grid md:grid-cols-2 gap-6 items-center ${i % 2 ? "md:[direction:rtl]" : ""}`}>
            <div className="[direction:ltr]">
              <div className="font-pixel text-[9px] tracking-widest text-[#e8b84b] mb-3">{f.tag}</div>
              <h2 className="font-display text-2xl md:text-3xl text-white leading-tight">{f.title}</h2>
              <p className="text-white/60 mt-4 leading-relaxed">{f.body}</p>
            </div>
            <div className="[direction:ltr] flex justify-center">
              <div className="kp-panel overflow-hidden" style={{ width: 220 }}>
                <Image src={`/mockups/${f.shot}.png`} alt={f.title} width={1080} height={2400} className="w-full h-auto block" />
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-3xl text-white">Ready to play?</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/download"><Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-8 py-6">⬇ DOWNLOAD</Button></Link>
          <Link href="/docs"><Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-8 py-6">HOW IT WORKS</Button></Link>
        </div>
      </section>
    </main>
  )
}
