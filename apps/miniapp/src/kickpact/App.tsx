"use client"
/* Kickpact Telegram Mini App — the native app's screens, rebuilt for the web,
   hitting the same live Sepolia contracts. */
import { ethers } from "ethers"
import { useCallback, useEffect, useState } from "react"

import { CHAIN, USDT_ABI, explorerTx, shortAddr } from "./chain"
import {
  fetchGames,
  filterGames,
  kickoffLabel,
  predictionTerms,
  type Filter,
  type Game,
  type Outcome,
} from "./football"
import * as pool from "./pool"
import { Panel, PixelButton, Px, TabPill } from "./ui"
import { useWallet } from "./wallet"

const err = (e: any) => String(e?.shortMessage || e?.message || e)

// ══════════════════════════════ SIGN IN / UNLOCK ══════════════════════════════

function SignIn() {
  const { status, createWallet, importWallet, unlock, storage } = useWallet()
  const [mode, setMode] = useState<"home" | "import">("home")
  const [phrase, setPhrase] = useState("")
  const [pass, setPass] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [seed, setSeed] = useState<string | null>(null)

  const doCreate = async () => {
    if (pass.length < 4) return setNote("passcode must be at least 4 characters")
    setBusy("creating"); setNote(null)
    try {
      setSeed(await createWallet(pass))
    } catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }
  const doImport = async () => {
    if (pass.length < 4) return setNote("set a passcode (4+ chars)")
    setBusy("importing"); setNote(null)
    try { await importWallet(phrase, pass) } catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }
  const doUnlock = async () => {
    setBusy("unlocking"); setNote(null)
    try { await unlock(pass) } catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }

  if (seed) {
    return (
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <Px size={22} tracking={2}>ready to duel?</Px>
        <Px size={10} color="var(--white45)" style={{ marginTop: 6 }}>write down these 12 words — they are the only way to recover your wallet</Px>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "18px 0" }}>
          {seed.split(" ").map((w, i) => (
            <div key={i} style={{ background: "var(--panel)", borderRadius: 8, padding: "8px 6px" }}>
              <Px size={11} upper={false}><span style={{ color: "var(--white35)" }}>{i + 1}</span> {w}</Px>
            </div>
          ))}
        </div>
        <PixelButton full label={busy === "entering" ? "entering…" : "i've saved it — enter"} color="var(--eth)"
          disabled={busy === "entering"}
          onClick={async () => { setBusy("entering"); try { await unlock(pass) } catch (e) { setNote(err(e)); setBusy(null) } }} />
        {note && <Px size={10} color="var(--amber)" upper={false} style={{ marginTop: 12 }}>{note}</Px>}
      </div>
    )
  }

  if (status === "locked") {
    return (
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 52 }}>🔒</div>
        <Px size={22} tracking={2} style={{ marginTop: 10 }}>welcome back</Px>
        <Px size={10} color="var(--white45)" style={{ marginTop: 6 }}>
          your seed is encrypted in {storage === "cloud" ? "telegram cloud storage" : "this browser"} — enter your passcode
        </Px>
        <input className="kp-input" type="password" placeholder="passcode" value={pass}
          onChange={(e) => setPass(e.target.value)} style={{ margin: "18px 0" }} />
        <PixelButton full label={busy ? "unlocking…" : "unlock"} color="var(--eth)" disabled={!!busy} onClick={doUnlock} />
        {note && <Px size={10} color="var(--amber)" upper={false} style={{ marginTop: 12 }}>{note}</Px>}
      </div>
    )
  }

  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 46 }}>⚽️🔒</div>
      <Px size={24} tracking={2} style={{ marginTop: 12 }}>ready to duel?</Px>
      <Px size={10} color="var(--white45)" style={{ marginTop: 6 }}>self-custodial · powered by WDK</Px>

      {mode === "home" ? (
        <>
          <input className="kp-input" type="password" placeholder="set a passcode (encrypts your seed)"
            value={pass} onChange={(e) => setPass(e.target.value)} style={{ margin: "20px 0 12px" }} />
          <PixelButton full label={busy === "creating" ? "creating…" : "◆ create ethereum wallet"} color="var(--eth)" disabled={!!busy} onClick={doCreate} />
          <Px size={9} color="var(--white35)" style={{ margin: "14px 0" }}>— or —</Px>
          <PixelButton full label="import recovery phrase" color="var(--import-blue)" onClick={() => { setMode("import"); setNote(null) }} />
        </>
      ) : (
        <>
          <textarea className="kp-input" placeholder="your 12-word recovery phrase" value={phrase}
            onChange={(e) => setPhrase(e.target.value)} rows={3} style={{ margin: "20px 0 12px", resize: "none" }} />
          <input className="kp-input" type="password" placeholder="set a passcode" value={pass}
            onChange={(e) => setPass(e.target.value)} style={{ marginBottom: 12 }} />
          <PixelButton full label={busy === "importing" ? "importing…" : "import + unlock"} color="var(--green)" disabled={!!busy} onClick={doImport} />
          <Px size={9} color="var(--white35)" style={{ marginTop: 12, cursor: "pointer" }}><span onClick={() => setMode("home")}>← back</span></Px>
        </>
      )}
      {note && <Px size={10} color="var(--amber)" upper={false} style={{ marginTop: 14 }}>{note}</Px>}
    </div>
  )
}

// ══════════════════════════════ HEADER + WALLET ══════════════════════════════

function BalanceHeader() {
  const { usdt } = useWallet()
  return (
    <div className="row spread" style={{ marginBottom: 12 }}>
      <div className="row gap8">
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--eth-light)" }} />
        <div className="chip row gap6" style={{ background: "var(--panel)" }}>
          <span style={{ color: "var(--eth)" }}>$</span>
          <Px size={12}>{usdt.toFixed(2)}</Px>
        </div>
      </div>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green)", display: "grid", placeItems: "center" }}>⚙️</div>
    </div>
  )
}

const MINT_ABI = ["function mint(address to, uint256 amount)"]

// ══════════════════════════════ HOME ══════════════════════════════

function Home({ onMatch, onMarkets }: { onMatch: (g: Game) => void; onMarkets: () => void }) {
  const { address, signer, usdt, eth, refresh } = useWallet()
  const [games, setGames] = useState<Game[]>([])
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchGames().then(setGames).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const mint = async () => {
    if (!signer || !address) return
    setBusy(true); setNote("minting test USD₮…")
    try {
      const c = new ethers.Contract(CHAIN.usdtAddress, MINT_ABI, signer)
      const tx = await c.mint(address, 100n * CHAIN.ONE_USDT)
      await tx.wait(); await refresh()
      setNote("+100 USD₮ minted ✓")
    } catch (e) {
      const m = err(e)
      if (/insufficient funds/i.test(m)) {
        setNote("needs a drop of Sepolia ETH for gas — grab some free, then mint again")
        window.open("https://cloud.google.com/application/web3/faucet/ethereum/sepolia", "_blank")
      } else setNote(m)
    } finally { setBusy(false) }
  }

  const shown = filterGames(games, filter)
  const actions: [string, string, (() => void) | null][] = [
    ["＋", "mint", mint],
    ["⇄", "swap", null],
    ["↝", "bridge", null],
    ["↑", "withdraw", null],
    ["$", "offramp", null],
  ]

  return (
    <div>
      <BalanceHeader />
      <TabPill items={[{ key: "testnet", label: "testnet" }, { key: "mainnet", label: "mainnet" }]} active="testnet" onPick={() => {}} />

      <Panel style={{ margin: "12px 0", background: "var(--frame-deep)", borderColor: "var(--highlight)" }}>
        <div className="row spread">
          <div>
            <Px size={10} color="var(--white45)">total balance</Px>
            <Px size={40} style={{ marginTop: 4 }}>${usdt.toFixed(2)}</Px>
            <Px size={10} color="var(--white45)" upper={false} style={{ marginTop: 6 }}>{usdt.toFixed(2)} USD₮ · Sepolia testnet · {eth.toFixed(4)} ETH gas</Px>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "#fff", display: "grid", placeItems: "center", fontSize: 26 }}>◆</div>
        </div>
      </Panel>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {actions.map(([ico, label, fn]) => (
          <button key={label} disabled={!fn || busy} onClick={fn || undefined}
            style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--panel-border)", borderRadius: 12, padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: fn ? "pointer" : "default", opacity: fn ? 1 : 0.5 }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, background: "var(--import-blue)", display: "grid", placeItems: "center", fontSize: 16 }}>{ico}</div>
            <Px size={9} color="var(--white60)">{label}</Px>
          </button>
        ))}
      </div>
      {note && <Px size={10} color="var(--amber)" upper={false} style={{ marginBottom: 12 }}>{note}</Px>}

      <Panel glow="var(--eth)" style={{ marginBottom: 16, cursor: "pointer" }}>
        <div className="row spread" onClick={onMarkets}>
          <div className="row gap10">
            <div style={{ width: 44, height: 44, borderRadius: 22, background: "var(--import-blue)", display: "grid", placeItems: "center" }}>◎</div>
            <div>
              <Px size={14}>polymarket</Px>
              <Px size={9} color="var(--white45)" upper={false}>trade real World Cup markets · mainnet</Px>
            </div>
          </div>
          <Px size={18} color="var(--eth)">→</Px>
        </div>
      </Panel>

      <div className="row spread" style={{ marginBottom: 10 }}>
        <Px size={20} tracking={3}>world cup</Px>
        <Px size={9} color="var(--white45)" upper={false}>on-chain prediction market</Px>
      </div>
      <div style={{ marginBottom: 10 }}>
        <TabPill
          items={[{ key: "live", label: "live" }, { key: "upcoming", label: "upcoming" }, { key: "completed", label: "completed" }]}
          active={filter} onPick={(k) => setFilter(k as Filter)} />
      </div>

      {loading && <Px size={11} color="var(--white35)" style={{ textAlign: "center", marginTop: 20 }}>loading fixtures…</Px>}
      {!loading && shown.length === 0 && <Px size={11} color="var(--white35)" style={{ textAlign: "center", marginTop: 20 }}>no {filter} matches.</Px>}
      {shown.map((g) => <MatchRow key={g.id} g={g} onClick={() => onMatch(g)} />)}
    </div>
  )
}

function Flag({ team }: { team: Game["home"] }) {
  return team.logo
    ? <img src={team.logo} alt={team.abbrev} style={{ width: 30, height: 20, objectFit: "contain" }} />
    : <div style={{ width: 30, height: 20, background: "var(--panel)", borderRadius: 3 }} />
}

function MatchRow({ g, onClick }: { g: Game; onClick: () => void }) {
  return (
    <Panel style={{ marginBottom: 10, cursor: "pointer" }}>
      <div onClick={onClick}>
        <div className="row spread" style={{ marginBottom: 10 }}>
          <Px size={9} color="var(--white45)">{g.leagueName}</Px>
          <Px size={9} color="var(--white45)">{kickoffLabel(g)}</Px>
        </div>
        <div className="row gap10" style={{ marginBottom: 6 }}><Flag team={g.home} /><Px size={14} upper={false}>{g.home.shortName}</Px>{g.home.score != null && <Px size={14} color="var(--white45)">{g.home.score}</Px>}</div>
        <div className="row gap10"><Flag team={g.away} /><Px size={14} upper={false}>{g.away.shortName}</Px>{g.away.score != null && <Px size={14} color="var(--white45)">{g.away.score}</Px>}</div>
        <div style={{ textAlign: "right", marginTop: 8 }}><Px size={9} color="var(--eth)">tap to predict →</Px></div>
      </div>
    </Panel>
  )
}

// ══════════════════════════════ MATCH (pact + group pool) ══════════════════════════════

function Match({ game, onBack }: { game: Game; onBack: () => void }) {
  const { signer, address, provider } = useWallet()
  const [tab, setTab] = useState<"predict" | "pool">("pool")
  const [pick, setPick] = useState<Outcome>("home")
  const [tier, setTier] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pools, setPools] = useState<pool.PoolState[]>([])
  const [myPicks, setMyPicks] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    if (!POOLS_LIVE || !address) return
    try {
      const ps = await pool.poolsForGame(provider, game.id)
      setPools(ps)
      const mp: Record<string, number> = {}
      for (const p of ps) mp[p.id.toString()] = await pool.myPick(provider, p.id, address)
      setMyPicks(mp)
    } catch {}
  }, [address, game.id, provider])
  useEffect(() => { load() }, [load])

  const outcomes: [Outcome, string][] = [["home", game.home.shortName], ["draw", "draw"], ["away", game.away.shortName]]

  const startPool = async () => {
    if (!signer) return
    setBusy("pool"); setNote("opening pool + locking your stake…")
    try {
      const { poolId } = await pool.createPool(signer, game, CHAIN.stakeTiers[tier], pick)
      setNote(`pool #${poolId} open — friends can join`); await load()
    } catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }
  const joinPool = async (p: pool.PoolState, o: Outcome) => {
    if (!signer) return
    setBusy(p.id.toString()); setNote(`joining pool #${p.id} (${o})…`)
    try { await pool.joinPool(signer, p.id, o); setNote(`you're in pool #${p.id}`); await load() }
    catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }
  const claim = async (p: pool.PoolState) => {
    if (!signer) return
    setBusy(p.id.toString()); setNote(`claiming from pool #${p.id}…`)
    try { const h = await pool.claimPool(signer, p.id); setNote(`claimed 🎉 ${h.slice(0, 10)}…`); await load() }
    catch (e) { setNote(err(e)) } finally { setBusy(null) }
  }

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <PixelButton label="←" color="var(--import-blue)" size={13} onClick={onBack} />
        <Px size={16} tracking={2}>match</Px>
        <div style={{ width: 40 }} />
      </div>

      <Panel style={{ marginBottom: 12 }}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <Px size={9} color="var(--white45)">{game.leagueName}</Px>
          <Px size={9} color="var(--white45)">{kickoffLabel(game)}</Px>
        </div>
        <div className="row spread">
          <div style={{ textAlign: "center", flex: 1 }}><Flag team={game.home} /><Px size={12} upper={false} style={{ marginTop: 6 }}>{game.home.shortName}</Px></div>
          <Px size={22}>vs</Px>
          <div style={{ textAlign: "center", flex: 1 }}><Flag team={game.away} /><Px size={12} upper={false} style={{ marginTop: 6 }}>{game.away.shortName}</Px></div>
        </div>
        {game.venue && <Px size={9} color="var(--white35)" style={{ textAlign: "center", marginTop: 10 }}>{game.venue}</Px>}
      </Panel>

      <Px size={9} color="var(--white45)" upper={false} style={{ marginBottom: 12, lineHeight: 1.6 }}>
        ⚡ the peer-to-peer watch party lives in the native app. here you can lock on-chain bets.
      </Px>

      <div style={{ marginBottom: 12 }}>
        <TabPill items={[{ key: "pool", label: "🏆 group pool" }, { key: "predict", label: "⚔ vs a friend" }]} active={tab} onPick={(k) => setTab(k as any)} />
      </div>

      {tab === "pool" && (
        <Panel glow="var(--green-light)">
          {!POOLS_LIVE ? (
            <Px size={11} color="var(--white45)" upper={false}>group pools go live once the pools contract is deployed.</Px>
          ) : (
            <>
              <Px size={9} color="var(--white45)" upper={false} style={{ lineHeight: 1.7 }}>everyone stakes the same, picks an outcome — winners split the pot. nobody right? everyone refunds. the contract holds the money.</Px>
              <Px size={10} color="var(--white45)" style={{ margin: "12px 0 8px" }}>your pick</Px>
              <div className="row gap6">{outcomes.map(([o, l]) => <PixelButton key={o} label={l} size={11} color={pick === o ? "var(--green)" : "var(--import-blue)"} style={{ flex: 1 }} onClick={() => setPick(o)} />)}</div>
              <Px size={10} color="var(--white45)" style={{ margin: "12px 0 8px" }}>stake (USD₮ each)</Px>
              <div className="row gap6">{CHAIN.stakeTiers.map((t, i) => <PixelButton key={i} label={`${Number(t) / Number(CHAIN.ONE_USDT)}`} size={12} color={i === tier ? "var(--green)" : "var(--import-blue)"} style={{ flex: 1 }} onClick={() => setTier(i)} />)}</div>
              <PixelButton full label={busy === "pool" ? "opening…" : "open pool + share"} color="var(--green)" size={12} style={{ marginTop: 12 }} disabled={!!busy} onClick={startPool} />
            </>
          )}
        </Panel>
      )}

      {tab === "predict" && (
        <Panel glow="var(--gold)">
          <Px size={11} color="var(--white45)" upper={false} style={{ lineHeight: 1.6 }}>
            pick an outcome and lock USD₮ vs a friend — winner takes the pot when the match settles. (create a shareable open bet in the native app / pacts tab.)
          </Px>
        </Panel>
      )}

      {note && <Px size={10} color="var(--amber)" upper={false} style={{ margin: "12px 0" }}>{note}</Px>}

      {pools.map((p) => {
        const mine = myPicks[p.id.toString()] ?? 0
        const stakeUsd = Number(p.stake) / Number(CHAIN.ONE_USDT)
        const potUsd = Number(p.pot) / Number(CHAIN.ONE_USDT)
        const iWon = p.settled && mine > 0 && (p.winners === 0 || mine === p.result)
        return (
          <Panel key={p.id.toString()} glow="var(--green-light)" style={{ marginTop: 10 }}>
            <div className="row spread"><Px size={10} color="var(--green-light)">🏆 pool #{p.id.toString()}</Px><Px size={9} color="var(--white45)">{p.members.length} in · {potUsd} USD₮ pot</Px></div>
            <Px size={9} color="var(--white45)" upper={false} style={{ marginTop: 4 }}>
              {stakeUsd} USD₮ each · {p.settled ? (p.winners === 0 ? "settled — nobody called it, refundable" : `settled — ${pool.pickName(p.result)} won, ${p.winners} split`) : mine > 0 ? `you picked ${pool.pickName(mine)}` : "pick a side to join"}
            </Px>
            {!p.settled && mine === 0 && (
              <div className="row gap6" style={{ marginTop: 8 }}>{outcomes.map(([o, l]) => <PixelButton key={o} label={busy === p.id.toString() ? "…" : l} size={10} color="var(--green)" style={{ flex: 1 }} onClick={() => joinPool(p, o)} />)}</div>
            )}
            {iWon && <PixelButton full label={busy === p.id.toString() ? "claiming…" : "claim your share 🎉"} color="var(--gold)" textColor="#241c06" size={11} style={{ marginTop: 8 }} onClick={() => claim(p)} />}
          </Panel>
        )
      })}
    </div>
  )
}

const POOLS_LIVE = pool.POOLS_LIVE

// ══════════════════════════════ MARKETS (Polymarket CLOB) ══════════════════════════════

function Markets({ onBack }: { onBack: () => void }) {
  const [markets, setMarkets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err2, setErr2] = useState<string | null>(null)
  useEffect(() => {
    import("./polymarket").then(({ fetchMarkets }) =>
      fetchMarkets().then(setMarkets).catch((e: any) => setErr2(err(e))).finally(() => setLoading(false)),
    )
  }, [])
  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <PixelButton label="←" color="var(--import-blue)" size={13} onClick={onBack} />
        <Px size={16} tracking={2}>polymarket</Px><div style={{ width: 40 }} />
      </div>
      <Panel style={{ marginBottom: 12 }}><Px size={9} color="var(--white45)" upper={false} style={{ lineHeight: 1.7 }}>real-money prediction markets · live CLOB odds · Polygon mainnet. tapping a market signs a real order with your wallet (needs USDC.e on Polygon).</Px></Panel>
      {loading && <Px size={11} color="var(--white35)" style={{ textAlign: "center", marginTop: 20 }}>loading markets…</Px>}
      {err2 && <Px size={10} color="var(--white35)" upper={false} style={{ textAlign: "center", marginTop: 20 }}>couldn&apos;t load markets — {err2}</Px>}
      {markets.map((m) => (
        <Panel key={m.id} style={{ marginBottom: 10 }}>
          <Px size={11} upper={false} style={{ lineHeight: 1.5 }}>{m.question}</Px>
          <div className="row gap8" style={{ marginTop: 10 }}>
            {m.outcomes.slice(0, 2).map((o: string, i: number) => (
              <div key={i} className="chip" style={{ background: i === 0 ? "rgba(59,163,75,0.18)" : "rgba(179,67,79,0.18)" }}>
                <Px size={11} color={i === 0 ? "var(--green-light)" : "#ff8a80"}>{o.toLowerCase()} {Math.round((m.prices[i] || 0) * 100)}¢</Px>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <a href={`https://polymarket.com/event/${m.slug ?? ""}`} target="_blank" rel="noreferrer"><Px size={9} color="var(--eth)">open ↗</Px></a>
          </div>
        </Panel>
      ))}
    </div>
  )
}

// ══════════════════════════════ PROFILE ══════════════════════════════

function Profile() {
  const { address, usdt, eth, storage, logout, revealSeed } = useWallet()
  const [seed, setSeed] = useState<string | null>(null)
  const [pass, setPass] = useState("")
  const [note, setNote] = useState<string | null>(null)
  return (
    <div>
      <Px size={18} tracking={3} style={{ marginBottom: 12 }}>profile</Px>
      <Panel style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ width: 72, height: 72, borderRadius: 14, background: "var(--eth-light)", margin: "0 auto 12px" }} />
        <Px size={16}>{shortAddr(address || "")}</Px>
        <Px size={9} color="var(--white45)" style={{ marginTop: 6 }}>self-custodial · via WDK</Px>
        <Px size={9} color="var(--white45)" upper={false} style={{ marginTop: 4 }}>
          seed sealed in {storage === "cloud" ? "telegram cloud storage (AES-GCM)" : "this browser (AES-GCM)"}
        </Px>
        <div className="row gap8" style={{ marginTop: 14 }}>
          <Panel style={{ flex: 1, background: "var(--frame-deep)", padding: 12 }}><Px size={9} color="var(--white45)">USD₮</Px><Px size={20}>{usdt.toFixed(2)}</Px></Panel>
          <Panel style={{ flex: 1, background: "var(--frame-deep)", padding: 12 }}><Px size={9} color="var(--white45)">gas (eth)</Px><Px size={20}>{eth.toFixed(4)}</Px></Panel>
        </div>
      </Panel>
      <Panel style={{ marginBottom: 12 }}>
        <Px size={11}>recovery phrase</Px>
        <Px size={9} color="var(--white45)" upper={false} style={{ margin: "6px 0 10px" }}>your keys, your funds. never share these 12 words.</Px>
        {seed ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {seed.split(" ").map((w, i) => <div key={i} style={{ background: "var(--panel)", borderRadius: 6, padding: "6px 4px" }}><Px size={10} upper={false}>{i + 1} {w}</Px></div>)}
          </div>
        ) : (
          <>
            <input className="kp-input" type="password" placeholder="passcode to reveal" value={pass} onChange={(e) => setPass(e.target.value)} style={{ marginBottom: 8 }} />
            <PixelButton full label="reveal recovery phrase" color="var(--import-blue)" size={12} onClick={async () => { try { setSeed(await revealSeed(pass)); setNote(null) } catch (e) { setNote(err(e)) } }} />
            {note && <Px size={10} color="var(--amber)" upper={false} style={{ marginTop: 8 }}>{note}</Px>}
          </>
        )}
      </Panel>
      <PixelButton full label="log out" color="var(--red)" size={12} onClick={logout} />
      <Px size={9} color="var(--white35)" upper={false} style={{ textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>network: Sepolia testnet · gas in ETH · stakes in USD₮ · self-custodial wallet, secured by WDK-style cloud storage</Px>
    </div>
  )
}

// ══════════════════════════════ SHELL ══════════════════════════════

type Tab = "home" | "pacts" | "markets" | "profile"

export default function App() {
  const { status } = useWallet()
  const [tab, setTab] = useState<Tab>("home")
  const [match, setMatch] = useState<Game | null>(null)
  const [markets, setMarkets] = useState(false)

  if (status === "initializing")
    return <div className="kp-app"><Px size={12} color="var(--white45)" style={{ textAlign: "center", marginTop: 80 }}>starting kickpact…</Px></div>
  if (status !== "ready")
    return <div className="kp-app"><SignIn /></div>

  let body: React.ReactNode
  if (match) body = <Match game={match} onBack={() => setMatch(null)} />
  else if (markets) body = <Markets onBack={() => setMarkets(false)} />
  else if (tab === "home") body = <Home onMatch={setMatch} onMarkets={() => setMarkets(true)} />
  else if (tab === "markets") body = <Markets onBack={() => setTab("home")} />
  else if (tab === "profile") body = <Profile />
  else body = <div style={{ textAlign: "center", marginTop: 60 }}><Px size={12} color="var(--white45)" upper={false}>friend bets (pacts) — create shareable USD₮ escrows on the match screens.</Px></div>

  const nav: [Tab, string, string][] = [["home", "🏠", "home"], ["pacts", "🤝", "pacts"], ["markets", "📈", "markets"], ["profile", "👤", "profile"]]
  return (
    <>
      <div className="kp-app">{body}</div>
      <div className="kp-nav">
        {nav.map(([k, ico, label]) => (
          <button key={k} className={tab === k && !match && !markets ? "active" : ""} onClick={() => { setMatch(null); setMarkets(false); setTab(k) }}>
            <span className="ico">{ico}</span>{label}
          </button>
        ))}
      </div>
    </>
  )
}
