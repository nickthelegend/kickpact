"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const REL = "https://github.com/nickthelegend/kickpact/releases/download/v1.0.0"
const REPO = "https://github.com/nickthelegend/kickpact"

// Download targets are resolved at runtime from a raw pointer file in the repo,
// so the APK / DMG URL can be re-pointed (new release, mirror) by editing one
// file on `main` — no landing redeploy needed. The hardcoded URLs below are the
// fallback if the pointer can't be fetched.
const POINTER = "https://raw.githubusercontent.com/nickthelegend/kickpact/main/download.json"

const CLIENTS = [
  {
    icon: "📱",
    name: "Android",
    tag: "the full app",
    pkey: "android",
    desc: "Self-custodial wallet, all bet tiers, group pools, and the peer-to-peer watch party. Sideload the APK (Sepolia testnet).",
    primary: { label: "⬇ Download APK", href: `${REL}/kickpact-android-arm64.apk` },
    note: "arm64 · io.kickpact.app",
  },
  {
    icon: "✈️",
    name: "Telegram Mini App",
    tag: "fastest start",
    pkey: "telegram",
    desc: "Wallet + betting right inside Telegram. Your seed is encrypted into Telegram Cloud Storage. Open the bot and play.",
    primary: { label: "Open in Telegram", href: "https://t.me/KickPactBot" },
    note: "@KickPactBot · runs in Telegram",
  },
  {
    icon: "🖥️",
    name: "Desktop Watch Party",
    tag: "Mac / Win / Linux",
    pkey: "macos",
    desc: "Join the same Hyperswarm P2P rooms from your laptop — Electron + the Pears runtime. Same pixel UI, same swarm.",
    primary: { label: "⬇ Download for macOS", href: `${REL}/Kickpact-Watch-Party-macOS-arm64.dmg` },
    note: "Windows/Linux: build from source",
  },
]

const SHOTS = [
  ["shot-01-onboarding", "Self-custodial onboarding"],
  ["shot-03-home", "Home — wallet + fixtures"],
  ["shot-04-match", "Match — predict + P2P room"],
  ["shot-13-group-pool", "Group pool — the watch-party pot"],
  ["shot-06-pvp", "PvP arena"],
  ["shot-07-duel-game", "Duel — swipe the market"],
  ["shot-09-swap", "Swap — the Polygon rail"],
  ["shot-08-profile", "Profile — keys stay yours"],
  ["shot-12-desktop-app", "Desktop watch party"],
]

export default function DownloadPage() {
  // resolved download URLs from the raw pointer file (falls back to the baked-in
  // release URLs on each client until/if the pointer loads)
  const [links, setLinks] = useState<Record<string, string | undefined>>({})
  useEffect(() => {
    let alive = true
    fetch(POINTER, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return
        setLinks({ android: d?.android?.url, macos: d?.macos?.url, telegram: d?.telegram?.url })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">GET KICKPACT</div>
          <h1 className="font-display text-4xl md:text-5xl text-white">Pick your client</h1>
          <p className="text-white/55 mt-4 max-w-xl mx-auto">
            Three clients, one on-chain backend on Sepolia. Want to chat or run a peer-to-peer watch party? That lives in the native + desktop apps.
          </p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-4">
          {CLIENTS.map((c, i) => (
            <motion.div key={c.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="kp-panel p-6 flex flex-col">
              <div className="text-4xl mb-3">{c.icon}</div>
              <div className="flex items-baseline gap-2">
                <div className="font-pixel text-base tracking-wide text-white">{c.name}</div>
                <span className="font-pixel text-[9px] tracking-widest text-[#e8b84b] uppercase">{c.tag}</span>
              </div>
              <p className="text-white/55 text-sm leading-relaxed mt-3 flex-1">{c.desc}</p>
              <Link href={links[c.pkey] || c.primary.href} target="_blank" className="mt-5">
                <Button className="w-full font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl py-6 transition-all hover:shadow-[0_0_18px_rgba(98,126,234,0.5)]">
                  {c.primary.label}
                </Button>
              </Link>
              <div className="font-pixel text-[9px] tracking-widest text-white/35 text-center mt-3 uppercase">{c.note}</div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href={REPO} target="_blank">
            <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-6 py-5">
              ★ BUILD FROM SOURCE — GITHUB
            </Button>
          </Link>
        </div>
      </section>

      {/* mockup gallery */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <h2 className="font-display text-3xl text-white text-center mb-3">See it in motion</h2>
        <p className="text-center text-white/50 mb-10">Real screens from the release build.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {SHOTS.map(([s, label]) => (
            <div key={s} className="text-center">
              <div className="kp-panel overflow-hidden inline-block">
                <Image src={`/mockups/${s}.png`} alt={label} width={1080} height={2400} className="w-full h-auto block max-w-[240px]" />
              </div>
              <div className="font-pixel text-[10px] tracking-wider text-white/50 mt-3 uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
