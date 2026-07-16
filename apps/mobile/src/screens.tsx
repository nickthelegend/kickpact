/**
 * Kickpact screens — Solana era. Same pixel cabinet, new engine:
 *   • TxLINE real-time World Cup data (fixtures / live scores / StablePrice odds)
 *   • kUSD prediction pools escrowed by the Kickpact program on devnet
 *   • settlement receipts backed by TxLINE Merkle proofs — verifiable from
 *     the phone with a live read-only call into the oracle program
 */
import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View,
} from "react-native"

import { C } from "./theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./ui"
import { QRCode } from "./qr"
import { useWallet } from "./wallet"
import {
  fetchGames, fetchScore, fetchOdds, fetchProof, filterGames, kickoffLabel,
  PHASE_ENDED,
  type Filter, type Game, type LiveScore, type OddsLine,
} from "./txline"
import {
  EXPLORER, EXPLORER_ACCT, OUTCOMES, buildClaimTx, buildCreatePoolTx, buildFaucetTx,
  buildJoinPoolTx, dailyRootsPda, latestPoolTx, allPools, poolsForFixture,
  myPick, pickName, shortAddr, verifyProofOnChain, KICKPACT_ID, TXORACLE_ID,
  type PoolOutcome, type PoolState,
} from "./solana"

const USDT_ICON = require("../assets/tokens/usdc-icon.png")

// ─────────────────────────────────────────────────────────────── sign in ──
export function SignInScreen() {
  const { createWallet, importWallet, connectMwa, confirmBackup, status } = useWallet()
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [phrase, setPhrase] = useState("")
  const [err, setErr] = useState<string | null>(null)

  const doCreate = async () => {
    setBusy(true)
    setErr(null)
    try {
      setSecret(await createWallet())
    } catch (e: any) {
      setErr(String(e.message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const doImport = async () => {
    setBusy(true)
    setErr(null)
    try {
      await importWallet(phrase)
    } catch {
      setErr("invalid secret key")
    } finally {
      setBusy(false)
    }
  }
  const doMwa = async () => {
    setBusy(true)
    setErr(null)
    try {
      await connectMwa()
    } catch {
      setErr("no MWA wallet found — install Phantom/Solflare or use a burner")
    } finally {
      setBusy(false)
    }
  }

  if (status === "BACKUP_PENDING" && secret) {
    return (
      <ScrollView contentContainerStyle={s.signWrap}>
        <PixelText size={26} style={{ textAlign: "center" }}>Back up your key</PixelText>
        <PixelText size={11} color={C.white60} style={{ textAlign: "center", marginTop: 8 }} upper={false}>
          This base58 secret IS your wallet. Store it somewhere safe.
        </PixelText>
        <Panel style={{ padding: 14, marginTop: 18 }}>
          <PixelText size={12} upper={false} style={{ lineHeight: 20 }}>{secret}</PixelText>
        </Panel>
        <PixelButton label="I'VE SAVED IT — ENTER" onPress={confirmBackup} style={{ marginTop: 18 }} />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={s.signWrap}>
      <PixelText size={40} style={{ textAlign: "center" }} upper={false}>⚽️🔒</PixelText>
      <PixelText size={26} style={{ textAlign: "center", marginTop: 10 }}>Ready for the final?</PixelText>
      <PixelText size={10} color={C.ethLight} style={{ textAlign: "center", marginTop: 8 }} tracking={2}>
        SELF-CUSTODIAL · TXLINE DATA · SOLANA DEVNET
      </PixelText>

      {importing ? (
        <>
          <Panel style={{ padding: 12, marginTop: 22 }}>
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              placeholder="base58 secret key"
              placeholderTextColor={C.white35}
              multiline
              style={s.input}
            />
          </Panel>
          <PixelButton label={busy ? "…" : "IMPORT"} onPress={doImport} style={{ marginTop: 14 }} />
          <PixelButton label="BACK" color={C.importBlue} onPress={() => setImporting(false)} style={{ marginTop: 10 }} />
        </>
      ) : (
        <>
          <PixelButton label={busy ? "…" : "◆ CREATE SOLANA WALLET"} onPress={doCreate} color={C.eth} style={{ marginTop: 26 }} />
          <PixelButton label="CONNECT WALLET (MWA)" onPress={doMwa} color={C.green} style={{ marginTop: 12 }} />
          <PixelButton label="IMPORT SECRET KEY" onPress={() => setImporting(true)} color={C.importBlue} style={{ marginTop: 12 }} />
        </>
      )}
      {err && (
        <PixelText size={10} color={C.amber} style={{ textAlign: "center", marginTop: 14 }} upper={false}>{err}</PixelText>
      )}
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────────── header ──
export function WalletHeader({ onAvatar, onFaucet }: { onAvatar?: () => void; onFaucet?: () => void }) {
  const { kusd, sol, address } = useWallet()
  return (
    <View style={s.header}>
      <Pressable onPress={onAvatar} style={s.avatar}>
        <PixelText size={13} upper={false}>{address ? address.slice(0, 2) : "?"}</PixelText>
      </Pressable>
      <BalanceChip icon={USDT_ICON} amount={`$ ${kusd.toFixed(2)}`} onPressAdd={onFaucet} />
      <View style={{ flex: 1 }} />
      <Panel style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
        <PixelText size={10} upper={false} color={C.white60}>◎ {sol.toFixed(3)}</PixelText>
      </Panel>
    </View>
  )
}

// ─────────────────────────────────────────────────────────── game cards ──
function TeamRow({ flag, name, score, winner }: { flag: string; name: string; score: string | null; winner: boolean }) {
  return (
    <View style={s.teamRow}>
      <PixelText size={16} upper={false}>{flag}</PixelText>
      <PixelText size={13} style={{ flex: 1, marginLeft: 8 }} color={winner ? C.gold : C.white} upper={false}>
        {name}
      </PixelText>
      <PixelText size={14} color={winner ? C.gold : C.white70}>{score ?? ""}</PixelText>
    </View>
  )
}

function GameCard({ g, onPress }: { g: Game; onPress: () => void }) {
  const live = g.state === "in"
  return (
    <Pressable onPress={onPress}>
      <Panel style={{ padding: 12, marginBottom: 10, borderColor: live ? C.green : C.panelBorder }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <PixelText size={9} color={C.white45} tracking={2}>WORLD CUP</PixelText>
          <PixelText size={9} color={live ? C.greenLight : C.white45} tracking={2} upper={false}>
            {live ? `● ${g.status}` : g.state === "post" ? "FT" : kickoffLabel(g)}
          </PixelText>
        </View>
        <TeamRow flag={g.home.flag} name={g.home.name} score={g.home.score} winner={g.home.winner} />
        <TeamRow flag={g.away.flag} name={g.away.name} score={g.away.score} winner={g.away.winner} />
      </Panel>
    </Pressable>
  )
}

// ───────────────────────────────────────────────────────────────── home ──
export function HomeScreen({ onProfile, onGame }: { onProfile?: () => void; onGame: (id: string) => void }) {
  const { kusd, signAndSend, publicKey, connection, refresh } = useWallet()
  const [games, setGames] = useState<Game[]>([])
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [loading, setLoading] = useState(true)
  const [minting, setMinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setGames(await fetchGames())
      setNote(null)
    } catch (e: any) {
      setNote(`txline: ${String(e.message ?? e).slice(0, 60)}`)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  const doFaucet = async () => {
    if (!publicKey || minting) return
    setMinting(true)
    setNote(null)
    try {
      const tx = await buildFaucetTx(connection, publicKey, 100)
      const sig = await signAndSend(tx)
      setNote(`minted 100 kUSD · ${sig.slice(0, 8)}…`)
      refresh()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 80))
    } finally {
      setMinting(false)
    }
  }

  const shown = filterGames(games, filter)
  return (
    <View style={{ flex: 1 }}>
      <WalletHeader onAvatar={onProfile} onFaucet={doFaucet} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
        <Panel style={{ padding: 14, marginBottom: 14 }}>
          <PixelText size={9} color={C.white45} tracking={2}>TOTAL BALANCE</PixelText>
          <PixelText size={30} style={{ marginTop: 6 }} upper={false}>$ {kusd.toFixed(2)}</PixelText>
          <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
            kUSD · Solana devnet · pools escrowed on-chain
          </PixelText>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <PixelButton label={minting ? "…" : "+ MINT"} onPress={doFaucet} size={12} style={{ flex: 1, paddingVertical: 9 }} />
          </View>
          {note && (
            <PixelText size={9} color={C.amber} style={{ marginTop: 8 }} upper={false}>{note}</PixelText>
          )}
        </Panel>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <PixelText size={20}>World Cup</PixelText>
          <PixelText size={8} color={C.white45} tracking={2}>TXLINE · PROOFS ON SOLANA</PixelText>
        </View>

        <View style={s.filters}>
          {(["live", "upcoming", "completed"] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[s.filter, filter === f && s.filterOn]}>
              <PixelText size={10} color={filter === f ? C.white : C.white45}>{f}</PixelText>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={C.eth} style={{ marginTop: 30 }} />
        ) : shown.length === 0 ? (
          <PixelText size={11} color={C.white45} style={{ textAlign: "center", marginTop: 26 }}>
            no {filter} matches
          </PixelText>
        ) : (
          shown.map((g) => <GameCard key={g.id} g={g} onPress={() => onGame(g.id)} />)
        )}
      </ScrollView>
    </View>
  )
}

// ──────────────────────────────────────────────────────── match + pools ──
function OddsPanel({ odds }: { odds: OddsLine | null }) {
  if (!odds) return null
  const cells: { k: string; price: number | null; pct: number | null }[] = [
    { k: "1", price: odds.home, pct: odds.pct?.[0] ?? null },
    { k: "X", price: odds.draw, pct: odds.pct?.[1] ?? null },
    { k: "2", price: odds.away, pct: odds.pct?.[2] ?? null },
  ]
  return (
    <Panel style={{ padding: 12, marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <PixelText size={9} color={C.white45} tracking={2}>STABLEPRICE ODDS · TXLINE</PixelText>
        <PixelText size={8} color={C.white35} upper={false}>{odds.ts ? new Date(odds.ts).toLocaleTimeString() : ""}</PixelText>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {cells.map((c) => (
          <View key={c.k} style={s.oddsCell}>
            <PixelText size={9} color={C.white45}>{c.k}</PixelText>
            <PixelText size={16} style={{ marginTop: 2 }} upper={false}>
              {c.price ? c.price.toFixed(2) : "—"}
            </PixelText>
            {c.pct != null && (
              <>
                <View style={s.pctTrack}>
                  <View style={[s.pctFill, { width: `${Math.min(100, c.pct)}%` }]} />
                </View>
                <PixelText size={8} color={C.ethLight} upper={false}>{c.pct.toFixed(1)}%</PixelText>
              </>
            )}
          </View>
        ))}
      </View>
    </Panel>
  )
}

function PickSelector({ g, pick, setPick }: { g: Game; pick: PoolOutcome; setPick: (p: PoolOutcome) => void }) {
  const labels: Record<PoolOutcome, string> = {
    home: `${g.home.flag} ${g.home.abbrev}`,
    draw: "DRAW",
    away: `${g.away.flag} ${g.away.abbrev}`,
  }
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {OUTCOMES.map((o) => (
        <Pressable key={o} onPress={() => setPick(o)} style={[s.pickBtn, pick === o && s.pickOn]}>
          <PixelText size={10} color={pick === o ? C.white : C.white60} upper={false}>{labels[o]}</PixelText>
        </Pressable>
      ))}
    </View>
  )
}

function PoolCard({
  g, p, onChanged, onReceipt,
}: { g: Game; p: PoolState; onChanged: () => void; onReceipt: (p: PoolState) => void }) {
  const { publicKey, connection, signAndSend } = useWallet()
  const [mine, setMine] = useState<{ pick: number; claimed: boolean } | null>(null)
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (publicKey) myPick(connection, p.id, publicKey).then(setMine).catch(() => {})
  }, [publicKey, connection, p.id, p.settled, p.memberCount])

  const joinOpen = !p.settled && Date.now() < p.deadlineMs
  const iWon = p.settled && mine && (p.winners === 0 || mine.pick === p.result)

  const doJoin = async () => {
    if (!publicKey || busy) return
    setBusy(true)
    setNote(null)
    try {
      const tx = await buildJoinPoolTx(connection, publicKey, p.id, pick)
      await signAndSend(tx)
      onChanged()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }
  const doClaim = async () => {
    if (!publicKey || busy) return
    setBusy(true)
    setNote(null)
    try {
      const tx = await buildClaimTx(connection, publicKey, p.id)
      await signAndSend(tx)
      onChanged()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel style={{ padding: 12, marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <PixelText size={11} color={C.gold}>POOL #{String(p.id)}</PixelText>
        <PixelText size={10} color={C.white60} upper={false}>
          {p.memberCount} in · {p.pot.toFixed(0)} kUSD pot
        </PixelText>
      </View>
      <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
        stake {p.stake.toFixed(0)} kUSD · picks {g.home.abbrev} {p.pickCounts[0]} / X {p.pickCounts[1]} / {g.away.abbrev} {p.pickCounts[2]}
      </PixelText>

      {p.settled ? (
        <>
          <PixelText size={10} color={C.greenLight} style={{ marginTop: 8 }}>
            SETTLED · {pickName(p.result)?.toUpperCase()} · {p.winners} WINNER{p.winners === 1 ? "" : "S"}
          </PixelText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {iWon && !mine?.claimed && (
              <PixelButton label={busy ? "…" : "CLAIM"} onPress={doClaim} size={11} style={{ flex: 1, paddingVertical: 8 }} />
            )}
            {mine?.claimed && (
              <Panel style={{ flex: 1, padding: 8, alignItems: "center" }}>
                <PixelText size={10} color={C.white45}>CLAIMED ✓</PixelText>
              </Panel>
            )}
            <PixelButton label="RECEIPT" color={C.importBlue} onPress={() => onReceipt(p)} size={11} style={{ flex: 1, paddingVertical: 8 }} />
          </View>
        </>
      ) : mine ? (
        <PixelText size={10} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
          you're in — picked {pickName(mine.pick)?.toUpperCase()}
        </PixelText>
      ) : joinOpen ? (
        <>
          <View style={{ marginTop: 10 }}>
            <PickSelector g={g} pick={pick} setPick={setPick} />
          </View>
          <PixelButton label={busy ? "…" : `JOIN · ${p.stake.toFixed(0)} KUSD`} onPress={doJoin} size={11} style={{ marginTop: 8, paddingVertical: 9 }} />
        </>
      ) : (
        <PixelText size={10} color={C.white45} style={{ marginTop: 8 }}>LOCKED — AWAITING RESULT</PixelText>
      )}
      {note && <PixelText size={9} color={C.amber} style={{ marginTop: 6 }} upper={false}>{note}</PixelText>}
    </Panel>
  )
}

export function GameScreen({ gameId, onBack, onReceipt }: { gameId: string; onBack: () => void; onReceipt: (p: PoolState) => void }) {
  const { publicKey, connection, signAndSend, refresh } = useWallet()
  const [g, setG] = useState<Game | null>(null)
  const [score, setScore] = useState<LiveScore | null>(null)
  const [odds, setOdds] = useState<OddsLine | null>(null)
  const [pools, setPools] = useState<PoolState[]>([])
  const [stake, setStake] = useState("10")
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const loadPools = useCallback(() => {
    poolsForFixture(connection, Number(gameId)).then(setPools).catch(() => {})
  }, [connection, gameId])

  useEffect(() => {
    fetchGames().then((all) => setG(all.find((x) => x.id === gameId) ?? null))
    fetchOdds(Number(gameId)).then(setOdds).catch(() => {})
    loadPools()
  }, [gameId, loadPools])

  // live score poll
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const sc = await fetchScore(Number(gameId))
        if (!stop) setScore(sc)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [gameId])

  if (!g) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  const h = score?.home ?? (g.home.score != null ? Number(g.home.score) : null)
  const a = score?.away ?? (g.away.score != null ? Number(g.away.score) : null)
  const phase = score?.phase ?? g.phase
  const live = phase >= 2 && phase !== PHASE_ENDED && phase !== 19

  const doCreate = async () => {
    if (!publicKey || busy) return
    const stakeN = Number(stake)
    if (!stakeN || stakeN <= 0) {
      setNote("enter a stake")
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const deadline = Math.max(g.kickoffMs, Date.now() + 60_000)
      const { tx } = await buildCreatePoolTx(connection, publicKey, g.fixtureId, stakeN, deadline, g.kickoffMs, pick)
      const sig = await signAndSend(tx)
      setNote(`pool opened · ${sig.slice(0, 8)}…`)
      refresh()
      loadPools()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <Pressable onPress={onBack}>
        <PixelText size={11} color={C.white60}>‹ BACK</PixelText>
      </Pressable>

      <Panel style={{ padding: 16, marginTop: 12 }}>
        <PixelText size={9} color={live ? C.greenLight : C.white45} tracking={2} style={{ textAlign: "center" }} upper={false}>
          {live ? `● LIVE · ${score ? phaseL(score) : g.status}` : phase === PHASE_ENDED ? "FULL TIME" : kickoffLabel(g)}
        </PixelText>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <PixelText size={30} upper={false}>{g.home.flag}</PixelText>
            <PixelText size={11} style={{ marginTop: 6, textAlign: "center" }} upper={false}>{g.home.name}</PixelText>
          </View>
          <PixelText size={30} upper={false}>{h != null ? h : "–"} : {a != null ? a : "–"}</PixelText>
          <View style={{ flex: 1, alignItems: "center" }}>
            <PixelText size={30} upper={false}>{g.away.flag}</PixelText>
            <PixelText size={11} style={{ marginTop: 6, textAlign: "center" }} upper={false}>{g.away.name}</PixelText>
          </View>
        </View>
        {score?.action && live && (
          <PixelText size={9} color={C.amber} style={{ textAlign: "center", marginTop: 8 }} upper={false}>
            {score.action.replace(/_/g, " ")}
          </PixelText>
        )}
      </Panel>

      <OddsPanel odds={odds} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
        <PixelText size={15}>Group pools</PixelText>
        <PixelText size={8} color={C.white45} tracking={1}>SETTLED BY TXLINE PROOF</PixelText>
      </View>
      {pools.length === 0 && (
        <PixelText size={10} color={C.white45} style={{ marginTop: 8 }} upper={false}>
          no pools yet — open the first one
        </PixelText>
      )}
      {pools.map((p) => (
        <PoolCard key={String(p.id)} g={g} p={p} onChanged={() => { loadPools(); refresh() }} onReceipt={onReceipt} />
      ))}

      {phase !== PHASE_ENDED && (
        <Panel style={{ padding: 12, marginTop: 14 }}>
          <PixelText size={11} color={C.gold}>OPEN A POOL</PixelText>
          <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
            friends stake the same, winners split the pot — the contract holds the money
          </PixelText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
            <Panel style={{ flex: 1, paddingHorizontal: 10 }}>
              <TextInput
                value={stake}
                onChangeText={setStake}
                keyboardType="numeric"
                placeholder="stake"
                placeholderTextColor={C.white35}
                style={[s.input, { paddingVertical: 8 }]}
              />
            </Panel>
            <PixelText size={10} color={C.white45}>KUSD</PixelText>
          </View>
          <View style={{ marginTop: 10 }}>
            <PickSelector g={g} pick={pick} setPick={setPick} />
          </View>
          <PixelButton label={busy ? "…" : "CREATE POOL"} onPress={doCreate} style={{ marginTop: 10 }} size={12} />
          {note && <PixelText size={9} color={C.amber} style={{ marginTop: 8 }} upper={false}>{note}</PixelText>}
        </Panel>
      )}
    </ScrollView>
  )
}

function phaseL(sc: LiveScore): string {
  if (sc.clockSec != null) return `${Math.floor(sc.clockSec / 60)}'`
  return "LIVE"
}

// ───────────────────────────────────────────────────────────── receipts ──
export function ReceiptsScreen({ onOpen }: { onOpen: (p: PoolState) => void }) {
  const { connection } = useWallet()
  const [pools, setPools] = useState<PoolState[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([allPools(connection), fetchGames()])
      .then(([ps, gs]) => {
        setPools(ps)
        setGames(gs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [connection])

  const gameFor = (p: PoolState) => games.find((g) => g.fixtureId === Number(p.fixtureId))
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <PixelText size={20}>Receipts</PixelText>
      <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
        every settlement traces to a TxLINE Merkle proof anchored on Solana
      </PixelText>
      {loading ? (
        <ActivityIndicator color={C.eth} style={{ marginTop: 30 }} />
      ) : pools.length === 0 ? (
        <PixelText size={11} color={C.white45} style={{ textAlign: "center", marginTop: 30 }}>
          no pools yet
        </PixelText>
      ) : (
        pools.map((p) => {
          const g = gameFor(p)
          return (
            <Pressable key={String(p.id)} onPress={() => onOpen(p)}>
              <Panel style={{ padding: 12, marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PixelText size={11} color={p.settled ? C.greenLight : C.gold}>
                    {p.settled ? "SETTLED ✓" : "OPEN"}
                  </PixelText>
                  <PixelText size={10} color={C.white45}>POOL #{String(p.id)}</PixelText>
                </View>
                <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
                  {g ? `${g.home.flag} ${g.home.name} v ${g.away.name} ${g.away.flag}` : `fixture ${p.fixtureId}`}
                </PixelText>
                <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
                  {p.memberCount} members · pot {p.pot.toFixed(0)} kUSD
                  {p.settled ? ` · result ${pickName(p.result)?.toUpperCase()}` : ""}
                </PixelText>
              </Panel>
            </Pressable>
          )
        })
      )}
    </ScrollView>
  )
}

export function ReceiptScreen({ pool, onBack }: { pool: PoolState; onBack: () => void }) {
  const { connection } = useWallet()
  const [g, setG] = useState<Game | null>(null)
  const [proof, setProof] = useState<any>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const [verify, setVerify] = useState<"idle" | "running" | "true" | "false" | "error">("idle")

  useEffect(() => {
    fetchGames().then((all) => setG(all.find((x) => x.fixtureId === Number(pool.fixtureId)) ?? null)).catch(() => {})
    latestPoolTx(connection, pool.id).then(setTxSig).catch(() => {})
  }, [connection, pool])

  useEffect(() => {
    // pull the same proof the settlement used (latest seq)
    ;(async () => {
      try {
        const sc = await fetchScore(Number(pool.fixtureId))
        if (sc?.seq) setProof(await fetchProof(Number(pool.fixtureId), sc.seq))
      } catch {}
    })()
  }, [pool])

  const doVerify = async () => {
    if (!proof || !pool.settled) return
    setVerify("running")
    try {
      const outcome = pickName(pool.result)
      if (!outcome) throw new Error("no result")
      const ok = await verifyProofOnChain(connection, proof, outcome)
      setVerify(ok ? "true" : "false")
    } catch {
      setVerify("error")
    }
  }

  const rootHex = (arr: any) =>
    Array.isArray(arr) ? arr.slice(0, 8).map((b: number) => b.toString(16).padStart(2, "0")).join("") + "…" : "—"

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <Pressable onPress={onBack}>
        <PixelText size={11} color={C.white60}>‹ BACK</PixelText>
      </Pressable>

      <PixelText size={20} style={{ marginTop: 12 }}>Receipt · Pool #{String(pool.id)}</PixelText>
      {g && (
        <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
          {g.home.flag} {g.home.name} {g.home.score ?? ""} : {g.away.score ?? ""} {g.away.name} {g.away.flag}
        </PixelText>
      )}

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>SETTLEMENT</PixelText>
        <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
          {pool.settled
            ? `result: ${pickName(pool.result)?.toUpperCase()} · ${pool.winners} winner${pool.winners === 1 ? "" : "s"} split ${pool.pot.toFixed(0)} kUSD`
            : "not settled yet"}
        </PixelText>
        {txSig && (
          <Pressable onPress={() => Linking.openURL(EXPLORER(txSig))}>
            <PixelText size={9} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
              ↗ last pool tx: {txSig.slice(0, 16)}… (explorer)
            </PixelText>
          </Pressable>
        )}
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>TXLINE MERKLE PROOF</PixelText>
        {proof ? (
          <>
            <PixelText size={9} color={C.white60} style={{ marginTop: 8 }} upper={false}>
              fixture {String(proof.summary?.fixtureId)} · updates {proof.summary?.updateStats?.updateCount} · window{" "}
              {new Date(proof.summary?.updateStats?.minTimestamp).toLocaleTimeString()}–
              {new Date(proof.summary?.updateStats?.maxTimestamp).toLocaleTimeString()}
            </PixelText>
            <PixelText size={9} color={C.white60} style={{ marginTop: 6 }} upper={false}>
              stats proven: {(proof.statsToProve ?? []).map((st: any) => `key${st.key}=${st.value}`).join(" · ")}
            </PixelText>
            <PixelText size={9} color={C.white45} style={{ marginTop: 6 }} upper={false}>
              eventStatRoot {rootHex(proof.eventStatRoot)} · subTree {proof.subTreeProof?.length} nodes · mainTree{" "}
              {proof.mainTreeProof?.length} node(s)
            </PixelText>
            <Pressable
              onPress={() =>
                Linking.openURL(EXPLORER_ACCT(dailyRootsPda(proof.summary.updateStats.minTimestamp).toBase58()))
              }
            >
              <PixelText size={9} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
                ↗ daily roots PDA (epoch day {Math.floor(proof.summary.updateStats.minTimestamp / 86400000)})
              </PixelText>
            </Pressable>

            {pool.settled && (
              <PixelButton
                label={
                  verify === "running" ? "VERIFYING…"
                    : verify === "true" ? "ORACLE CONFIRMS ✓"
                    : verify === "false" ? "ORACLE REFUTES ✗"
                    : verify === "error" ? "RETRY VERIFY"
                    : "VERIFY ON-CHAIN NOW"
                }
                color={verify === "true" ? C.green : verify === "false" ? "#a33b3b" : C.eth}
                onPress={doVerify}
                size={12}
                style={{ marginTop: 12 }}
              />
            )}
          </>
        ) : (
          <PixelText size={9} color={C.white45} style={{ marginTop: 8 }} upper={false}>
            fetching proof from TxLINE…
          </PixelText>
        )}
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>PROGRAMS</PixelText>
        <Pressable onPress={() => Linking.openURL(EXPLORER_ACCT(KICKPACT_ID.toBase58()))}>
          <PixelText size={9} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
            ↗ kickpact {shortAddr(KICKPACT_ID.toBase58())}
          </PixelText>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(EXPLORER_ACCT(TXORACLE_ID.toBase58()))}>
          <PixelText size={9} color={C.ethLight} style={{ marginTop: 6 }} upper={false}>
            ↗ txoracle {shortAddr(TXORACLE_ID.toBase58())} (TxLINE)
          </PixelText>
        </Pressable>
      </Panel>
    </ScrollView>
  )
}

// ────────────────────────────────────────────────────────────── profile ──
export function ProfileScreen() {
  const { address, sol, kusd, mode, logout, getSecret } = useWallet()
  const [secret, setSecret] = useState<string | null>(null)

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <PixelText size={20}>Profile</PixelText>

      <Panel style={{ padding: 16, marginTop: 12, alignItems: "center" }}>
        {address && <QRCode value={address} size={140} />}
        <PixelText size={10} style={{ marginTop: 10 }} upper={false}>{address}</PixelText>
        <PixelText size={9} color={C.white45} style={{ marginTop: 4 }}>
          {mode === "mwa" ? "CONNECTED VIA MOBILE WALLET ADAPTER" : "BURNER · KEY IN DEVICE KEYCHAIN"}
        </PixelText>
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <PixelText size={11} upper={false}>kUSD</PixelText>
          <PixelText size={11} upper={false}>$ {kusd.toFixed(2)}</PixelText>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <PixelText size={11} upper={false}>SOL (devnet gas)</PixelText>
          <PixelText size={11} upper={false}>◎ {sol.toFixed(4)}</PixelText>
        </View>
        <PixelText size={8} color={C.white45} style={{ marginTop: 8 }} upper={false}>
          need gas? solana airdrop 1 {shortAddr(address)} -u devnet
        </PixelText>
      </Panel>

      {mode === "burner" && (
        <Panel style={{ padding: 14, marginTop: 12 }}>
          <PixelText size={9} color={C.white45} tracking={2}>RECOVERY</PixelText>
          {secret ? (
            <PixelText size={10} style={{ marginTop: 8, lineHeight: 18 }} upper={false}>{secret}</PixelText>
          ) : (
            <PixelButton
              label="REVEAL SECRET KEY"
              color={C.importBlue}
              size={11}
              style={{ marginTop: 10 }}
              onPress={async () => setSecret(await getSecret())}
            />
          )}
        </Panel>
      )}

      <PixelButton label="LOG OUT" color="#a33b3b" style={{ marginTop: 16 }} onPress={logout} />
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────────── styles ──
const s = StyleSheet.create({
  signWrap: { flexGrow: 1, justifyContent: "center", padding: 22 },
  input: { color: C.white, fontSize: 14, paddingVertical: 10, minHeight: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  avatar: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: C.eth,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#000",
  },
  teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  filters: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 12 },
  filter: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.panel },
  filterOn: { backgroundColor: C.eth },
  oddsCell: {
    flex: 1, alignItems: "center", padding: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.white15, backgroundColor: C.panel,
  },
  pctTrack: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.white15, marginTop: 5 },
  pctFill: { height: 4, borderRadius: 2, backgroundColor: C.eth },
  pickBtn: {
    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.white15,
  },
  pickOn: { backgroundColor: C.eth, borderColor: C.eth },
})
