"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const REPO = "https://github.com/nickthelegend/kickpact"
const SCAN = "https://sepolia.etherscan.io/address"

const STEPS = [
  { n: "01", t: "Create a wallet", d: "On first launch Kickpact generates a real 12-word seed on-device and seals it via WDK (keychain + biometrics on native, Telegram Cloud Storage on the Mini App). No email, no custodian." },
  { n: "02", t: "Fund with USD₮", d: "Mint testnet USD₮ from the in-app faucet on Sepolia (needs a drop of Sepolia ETH for gas). On mainnet: buy via MoonPay, or swap / bridge onto Polygon." },
  { n: "03", t: "Pick a match & bet", d: "Home shows live World Cup fixtures from ESPN. Lock a Pact vs a friend, start a group pool, jump into a Duel, or open a real Polymarket market." },
  { n: "04", t: "Watch together", d: "Join the match's peer-to-peer room over Hyperswarm — signed chat, live reactions, and bets proposed right in the room. No server anywhere." },
  { n: "05", t: "Settle & split", d: "Duels finalize on-chain from settlement prices; match pacts and pools settle automatically when the keeper matches the official result; winners are paid — or split the pot — in USD₮." },
]

const CONTRACTS = [
  ["KickpactPools", "group watch-party pots", "0xEd37D097BBA4C7FA514733C62F62787b9Ba6f445"],
  ["KickpactDuel", "PvP swipe duels", "0x045Ad96EB24CE29f02C4E41542507DE26FE13895"],
  ["KickpactPacts", "friend-bet escrow", "0xc84a624109e6406d1a5Aa8413B19a1CFFCFe7f5A"],
  ["MockUSDT", "USD₮ (6dp, faucet)", "0x4802B35fFE360CAcF7bc22702544DDA207b950A3"],
]

export default function DocsPage() {
  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-6 text-center">
        <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">HOW IT WORKS</div>
        <h1 className="font-display text-4xl md:text-5xl text-white">From tap to payout</h1>
        <p className="text-white/55 mt-4 max-w-xl mx-auto">Self-custodial the whole way — you sign every transaction, no server holds your keys or funds.</p>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-10 space-y-4">
        {STEPS.map((s, i) => (
          <motion.div key={s.n} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
            className="kp-panel p-6 flex gap-5 items-start">
            <div className="font-display text-3xl text-[#627eea] shrink-0">{s.n}</div>
            <div>
              <div className="font-pixel text-sm tracking-wide text-white mb-2">{s.t}</div>
              <p className="text-white/55 leading-relaxed">{s.d}</p>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="font-display text-3xl text-white text-center mb-2">What&apos;s on-chain</h2>
        <p className="text-center text-white/50 mb-8">Solidity + Foundry, live on Ethereum Sepolia. Read them yourself.</p>
        <div className="kp-panel divide-y divide-white/10">
          {CONTRACTS.map(([name, desc, addr]) => (
            <Link key={addr} href={`${SCAN}/${addr}`} target="_blank" className="flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors">
              <div>
                <div className="font-pixel text-sm text-white">{name}</div>
                <div className="text-white/45 text-xs mt-1">{desc}</div>
              </div>
              <div className="font-mono text-[11px] text-[#627eea] truncate max-w-[46%]">{addr.slice(0, 10)}…{addr.slice(-6)} ↗</div>
            </Link>
          ))}
        </div>
        <p className="text-center text-white/40 text-sm mt-6">
          Stakes and payouts are in USD₮ (6dp); gas is Sepolia ETH. Settlement is serverless — the keeper recomputes a deterministic hash from the official result and pays matching bets.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={REPO} target="_blank"><Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-8 py-6">★ READ THE CODE</Button></Link>
          <Link href="/download"><Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-8 py-6">⬇ DOWNLOAD</Button></Link>
        </div>
      </section>
    </main>
  )
}
