"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const REPO = "https://github.com/nickthelegend/kickpact"

const TIERS = [
  { icon: "🤝", name: "Pacts", desc: "Escrow a bet with a friend. Both stake equal USD₮; the winner claims the pot, the loser's escrow auto-releases. No custodian, no KYC." },
  { icon: "⚔️", name: "Duels", desc: "A Tinder-style 1v1 — swipe UP/DOWN through a live-price deck. The contract escrows both stakes and pays the better market-reader." },
  { icon: "🏆", name: "Group Pools", desc: "The watch-party pot: friends stake the same, pick an outcome, winners split it. Nobody right? Everyone refunds. The contract holds the money." },
  { icon: "📈", name: "Polymarket", desc: "Trade real-money World Cup markets in-app — your wallet EIP-712-signs orders straight to the CLOB on Polygon." },
]

const CLIENTS = [
  { icon: "📱", name: "Android app", desc: "The full experience — wallet, all bet tiers, and the P2P watch party.", cta: "Get the APK" },
  { icon: "✈️", name: "Telegram Mini App", desc: "Wallet + betting inside Telegram. Fastest way to start.", cta: "Open in Telegram" },
  { icon: "🖥️", name: "Desktop Watch Party", desc: "Mac / Windows / Linux — join the same P2P rooms from your laptop.", cta: "Download" },
]

function Mock({ src, w = 250, className = "" }: { src: string; w?: number; className?: string }) {
  return (
    <div className={`kp-panel overflow-hidden ${className}`} style={{ width: w }}>
      <Image src={src} alt="Kickpact screen" width={1080} height={2400} className="w-full h-auto block" />
    </div>
  )
}

export default function HomePageContent() {
  return (
    <main className="pt-16">
      {/* ── HERO ── */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 md:pt-28">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 * 0.08, duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#627eea]/40 bg-[#627eea]/10 px-3 py-1 mb-6">
              <span className="font-pixel text-[10px] tracking-widest text-[#8aa0f5]">TETHER DEVELOPERS CUP · WDK + PEARS</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 * 0.08, duration: 0.5 }}
              className="font-display text-5xl md:text-6xl leading-[1.05] text-white">
              Back your team.<br /><span className="text-[#627eea]">Own</span> the bet.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 * 0.08, duration: 0.5 }}
              className="mt-5 text-white/60 text-lg max-w-md leading-relaxed">
              Self-custodial World Cup betting. Your WDK wallet holds <span className="text-white">USD₮</span> and never leaves your phone — bet three ways, split friendly pots, and watch matches peer-to-peer.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3 * 0.08, duration: 0.5 }} className="mt-8 flex flex-wrap gap-3">
              <Link href="/download">
                <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-6 py-6 transition-all hover:shadow-[0_0_22px_rgba(98,126,234,0.55)]">
                  ⬇ DOWNLOAD KICKPACT
                </Button>
              </Link>
              <Link href={REPO} target="_blank">
                <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-6 py-6">
                  ★ VIEW ON GITHUB
                </Button>
              </Link>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4 * 0.08, duration: 0.5 }} className="mt-8 flex gap-6">
              {[["3", "bet tiers"], ["3", "clients"], ["94", "tests · CI green"]].map(([n, l]) => (
                <div key={l}>
                  <div className="font-display text-3xl text-white">{n}</div>
                  <div className="font-pixel text-[9px] tracking-widest text-white/45 uppercase">{l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="relative flex justify-center">
            <Mock src="/mockups/shot-03-home.png" w={260} className="kp-glow rotate-[-4deg] z-10" />
            <Mock src="/mockups/shot-13-group-pool.png" w={220} className="absolute -right-2 top-16 rotate-[6deg] opacity-90 hidden sm:block" />
          </motion.div>
        </div>
      </section>

      {/* ── THREE WAYS TO BET ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl md:text-4xl text-white text-center">Four ways to bet — one wallet</h2>
        <p className="text-center text-white/50 mt-3 max-w-xl mx-auto">Every stake sits in on-chain escrow only the outcome can release. One USD₮ balance across all of them.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {TIERS.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i) * 0.08, duration: 0.5 }}
              className="kp-panel p-5">
              <div className="text-3xl mb-3">{t.icon}</div>
              <div className="font-pixel text-sm tracking-wide text-white mb-2">{t.name}</div>
              <p className="text-white/55 text-sm leading-relaxed">{t.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── PEARS / CHAT CTA ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="kp-panel p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center border-[#e8b84b]/30">
          <div>
            <div className="font-pixel text-[10px] tracking-widest text-[#e8b84b] mb-3">PEERS · NO SERVER</div>
            <h2 className="font-display text-3xl md:text-4xl text-white leading-tight">Watch together, peer-to-peer.</h2>
            <p className="mt-4 text-white/60 leading-relaxed">
              Fans of the same match meet in a serverless Hyperswarm room — signed chat, live reactions, and bets proposed right in the room. Every message is signed by your wallet.
            </p>
            <p className="mt-4 text-white/80">
              Want to chat or start a watch party? <Link href="/download" className="text-[#627eea] underline underline-offset-4">Download the app</Link> — the P2P rooms run natively.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Mock src="/mockups/shot-10-p2p-room-live.png" w={200} className="rotate-[-3deg]" />
            <Mock src="/mockups/shot-11-p2p-signed.png" w={200} className="rotate-[3deg] mt-8 hidden sm:block" />
          </div>
        </div>
      </section>

      {/* ── CLIENTS ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl md:text-4xl text-white text-center">Three clients, one on-chain backend</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {CLIENTS.map((c, i) => (
            <motion.div key={c.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i) * 0.08, duration: 0.5 }}
              className="kp-panel p-6 flex flex-col">
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className="font-pixel text-sm tracking-wide text-white mb-2">{c.name}</div>
              <p className="text-white/55 text-sm leading-relaxed flex-1">{c.desc}</p>
              <Link href="/download" className="mt-4">
                <Button variant="ghost" className="font-pixel text-[11px] tracking-wider text-[#627eea] hover:bg-[#627eea]/10 px-0">{c.cta} →</Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── SCREEN STRIP ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl md:text-4xl text-white text-center mb-10">Every screen, self-custodial</h2>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
          {["shot-01-onboarding", "shot-03-home", "shot-04-match", "shot-05-pacts", "shot-06-pvp", "shot-07-duel-game", "shot-08-profile", "shot-09-swap"].map((s) => (
            <Mock key={s} src={`/mockups/${s}.png`} w={190} className="shrink-0" />
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="font-display text-4xl md:text-5xl text-white">Your keys. Your USD₮.<br />Your call on the match.</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/download"><Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-8 py-6">⬇ DOWNLOAD</Button></Link>
          <Link href="/features"><Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-8 py-6">SEE FEATURES</Button></Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-10 mt-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽️</span>
            <span className="font-pixel text-sm tracking-widest text-white">KICKPACT</span>
          </div>
          <div className="font-pixel text-[10px] tracking-widest text-white/40">BUILT FOR THE TETHER DEVELOPERS CUP · WDK + PEARS</div>
          <Link href={REPO} target="_blank" className="font-pixel text-[10px] tracking-widest text-[#627eea]">GITHUB ↗</Link>
        </div>
      </footer>
    </main>
  )
}
