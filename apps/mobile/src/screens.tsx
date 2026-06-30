/**
 * Flicky mobile screens (RN StyleSheet). Real on-chain flow:
 *  - SignIn  : create / import a self-custodial wallet (real BIP-39 seed)
 *  - Home    : live USD₮ + ETH balances, USD₮ faucet, enter PvP
 *  - Pvp     : create a duel (stake escrow) or join one by code — real txs
 *  - Duel    : reveal deck (creator) + swipe YES/NO on each card — real txs
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from "react-native"

import { C } from "./theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./ui"
import { useWallet } from "./wallet"
import { CHAIN, DUEL_STATUS, shortAddr } from "./chain"
import {
  approveUsdt,
  createDuel,
  createDuelFree,
  deckCommitment,
  demoDeck,
  fetchDuel,
  joinDuel,
  mintUsdt,
  randomSalt,
  recordSwipe,
  revealDeck,
  type Card,
  type DuelState,
} from "./duel"
import { loadSecret, saveSecret } from "./storage"
import {
  acceptPact,
  agreePact,
  cancelPact,
  createPact,
  fetchPact,
  getTermsText,
  listMyPacts,
  resolvePactByArbiter,
  ZERO,
  type PactState,
} from "./pact"
import { PACT_STATUS } from "./chain"
import { leaderboard, myHistory, type HistoryItem, type RankRow } from "./stats"
import {
  fetchGame,
  fetchGames,
  filterGames,
  kickoffLabel,
  type Filter as GameFilter,
  type Game,
} from "./football"
import {
  executeSwap,
  quoteSwap,
  SWAP_NETWORKS,
  type Quote,
  type SwapNetwork,
  type Token,
} from "./swap"
import { ethers } from "ethers"

const USDT_ICON = require("../assets/tokens/usdc-icon.png")
const MANAGER_ICON = require("../assets/tokens/manager-usdc.png")

// ───────────────────────── Sign in ─────────────────────────
export function SignInScreen() {
  const { createWallet, confirmBackup, importWallet } = useWallet()
  const [view, setView] = useState<"choose" | "backup" | "import">("choose")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [phrase, setPhrase] = useState("")
  const [importText, setImportText] = useState("")

  const onCreate = async () => {
    setBusy(true)
    setErr(null)
    try {
      setPhrase(await createWallet())
      setView("backup")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create wallet")
    } finally {
      setBusy(false)
    }
  }
  const onImport = async () => {
    setBusy(true)
    setErr(null)
    try {
      await importWallet(importText)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid phrase")
      setBusy(false)
    }
  }

  return (
    <View style={st.center}>
      <Image source={require("../assets/game/sign-in-hero.png")} style={st.hero} resizeMode="contain" />
      <PixelText size={28} tracking={3}>
        {view === "import" ? "import wallet" : "ready to duel?"}
      </PixelText>
      <PixelText size={12} upper={false} color={C.white45} tracking={1} style={st.sub}>
        self-custodial · powered by WDK
      </PixelText>

      {err && (
        <View style={st.errBox}>
          <PixelText size={11} color="#ff9b9b" upper={false}>
            {err}
          </PixelText>
        </View>
      )}

      {view === "choose" && (
        <>
          <PixelButton label={busy ? "creating…" : "⟠   create ethereum wallet"} color={C.eth} onPress={onCreate} style={st.full} />
          <View style={st.divider}>
            <View style={st.dline} />
            <PixelText size={11} color={C.white35} tracking={3}>or</PixelText>
            <View style={st.dline} />
          </View>
          <PixelButton label="import recovery phrase" color={C.importBlue} onPress={() => setView("import")} style={st.full} />
        </>
      )}

      {view === "backup" && (
        <>
          <PixelText size={11} color={C.amber} upper={false} style={st.warn}>
            write down these 12 words. they are the only way to recover your wallet.
          </PixelText>
          <View style={st.grid}>
            {phrase.split(" ").map((w, i) => (
              <View key={i} style={st.word}>
                <PixelText size={11} color={C.white35} upper={false}>{i + 1} </PixelText>
                <PixelText size={11} upper={false}>{w}</PixelText>
              </View>
            ))}
          </View>
          <PixelButton label="i've saved it — enter" color={C.eth} onPress={confirmBackup} style={st.full} />
        </>
      )}

      {view === "import" && (
        <>
          <TextInput
            value={importText}
            onChangeText={setImportText}
            placeholder="enter your 12-word recovery phrase"
            placeholderTextColor={C.white35}
            multiline
            style={st.input}
          />
          <PixelButton label={busy ? "importing…" : "import & sign in"} color={C.eth} onPress={onImport} style={st.full} />
          <PixelButton label="← back" color={C.importBlue} onPress={() => { setErr(null); setView("choose") }} style={[st.full, { marginTop: 10 }]} size={12} />
        </>
      )}
    </View>
  )
}

// ───────────────────────── Home ─────────────────────────
export function WalletHeader({ onAvatar }: { onAvatar?: () => void }) {
  const { usdt, signer, address, refresh } = useWallet()
  const faucet = async () => {
    if (!signer || !address) return
    try {
      await mintUsdt(signer, address, 100n * CHAIN.ONE_USDT)
      await refresh()
    } catch {
      /* ignore */
    }
  }
  return (
    <View style={st.header}>
      <View style={st.headerLeft}>
        <Pressable onPress={onAvatar} hitSlop={6}>
          <View style={st.avatar} />
        </Pressable>
        <BalanceChip icon={USDT_ICON} amount={usdt.toFixed(2)} onPressAdd={faucet} />
      </View>
      <Pressable style={st.gear} onPress={onAvatar}>
        <Image source={require("../assets/icons/gear.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />
      </Pressable>
    </View>
  )
}

function TeamRow({ team, score }: { team: Game["home"]; score: string | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {team.logo ? (
        <Image source={{ uri: team.logo }} style={{ width: 26, height: 26, marginRight: 10 }} resizeMode="contain" />
      ) : (
        <View style={{ width: 26, height: 26, marginRight: 10, borderRadius: 4, backgroundColor: C.panel }} />
      )}
      <PixelText size={13} upper={false} style={{ flex: 1 }}>
        {team.name}
      </PixelText>
      {score != null && score !== "" && (
        <PixelText size={17} color={team.winner ? C.greenLight : C.white}>
          {score}
        </PixelText>
      )}
    </View>
  )
}

function GameCard({ g, onPress }: { g: Game; onPress: () => void }) {
  const live = g.state === "in"
  const done = g.state === "post"
  const showScore = live || done
  return (
    <Pressable onPress={onPress}>
      <Panel style={[st.pad, live ? { borderColor: "#c0392b" } : null]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <PixelText size={9} color={C.white45} tracking={1}>
            {g.leagueName}
          </PixelText>
          <View style={[st.statusPill, live ? { backgroundColor: "#c0392b" } : null]}>
            <PixelText size={9} color={live ? C.white : C.white60} tracking={1}>
              {live ? `● ${g.status || "LIVE"}` : done ? "FT" : kickoffLabel(g)}
            </PixelText>
          </View>
        </View>
        <TeamRow team={g.home} score={showScore ? g.home.score : null} />
        <View style={{ height: 8 }} />
        <TeamRow team={g.away} score={showScore ? g.away.score : null} />
        <View style={st.cardCta}>
          <PixelText size={9} upper color={C.eth} tracking={1}>
            tap to predict →
          </PixelText>
        </View>
      </Panel>
    </Pressable>
  )
}

export function HomeScreen({ onProfile, onGame }: { onProfile?: () => void; onGame: (id: string) => void }) {
  const [games, setGames] = useState<Game[]>([])
  const [filter, setFilter] = useState<GameFilter>("upcoming")
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const PAGE = 8

  const load = useCallback(async () => {
    try {
      setGames(await fetchGames())
    } catch {
      /* keep prior */
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => setPage(1), [filter])

  const filtered = filterGames(games, filter)
  const shown = filtered.slice(0, page * PAGE)
  const liveCount = filterGames(games, "live").length

  return (
    <View style={{ flex: 1 }}>
      <WalletHeader onAvatar={onProfile} />
      <View style={st.titleRow}>
        <PixelText size={20} tracking={3}>world cup</PixelText>
        <PixelText size={9} upper={false} color={C.white45}>p2p prediction market</PixelText>
      </View>
      <View style={st.filterRow}>
        {(["live", "upcoming", "completed"] as GameFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[st.filterTab, filter === f ? st.filterTabActive : null]}
          >
            <PixelText size={11} color={filter === f ? C.white : C.white45} tracking={1}>
              {f}
              {f === "live" && liveCount > 0 ? ` ${liveCount}` : ""}
            </PixelText>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        {loading && <ActivityIndicator color={C.eth} style={{ marginTop: 24 }} />}
        {!loading && shown.length === 0 && (
          <PixelText size={11} upper={false} color={C.white35} style={{ textAlign: "center", marginTop: 24 }}>
            no {filter} matches right now.
          </PixelText>
        )}
        {shown.map((g) => (
          <GameCard key={g.id} g={g} onPress={() => onGame(g.id)} />
        ))}
        {filtered.length > shown.length && (
          <PixelButton label="load more" color={C.importBlue} size={12} onPress={() => setPage((p) => p + 1)} />
        )}
      </ScrollView>
    </View>
  )
}

// ───────────────────────── PvP lobby ─────────────────────────
export function PvpScreen({ onBack, onEnterDuel }: { onBack: () => void; onEnterDuel: (id: string) => void }) {
  const { signer, address, usdt } = useWallet()
  const [tier, setTier] = useState(2) // index into stakeTiers (5 USD₮)
  const [joinId, setJoinId] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const stake = CHAIN.stakeTiers[tier]
  const stakeHuman = Number(stake) / Number(CHAIN.ONE_USDT)

  const onCreate = async () => {
    if (!signer) return
    setBusy("create")
    setStatus("approving USD₮…")
    try {
      await approveUsdt(signer, stake)
      setStatus("creating duel on-chain…")
      const cards = demoDeck(3)
      const salt = randomSalt()
      const commitment = deckCommitment(cards, salt)
      const { duelId } = await createDuel(signer, stake, commitment)
      // persist the deck so the creator can reveal it after the challenger joins
      await saveSecret(
        `deck.${duelId}`,
        JSON.stringify({ cards: cards.map((c) => [c.strike.toString(), c.probUp.toString()]), salt }),
      )
      setCreatedId(duelId.toString())
      setStatus(`duel #${duelId} created — share the code`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 90) : "create failed")
    } finally {
      setBusy(null)
    }
  }

  const onJoin = async () => {
    if (!signer || !joinId) return
    setBusy("join")
    setStatus("approving USD₮…")
    try {
      await approveUsdt(signer, stake)
      setStatus("joining duel…")
      await joinDuel(signer, BigInt(joinId))
      onEnterDuel(joinId)
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 90) : "join failed")
    } finally {
      setBusy(null)
    }
  }

  const onPractice = async () => {
    if (!signer) return
    setBusy("practice")
    setStatus("creating free practice duel… (a bot will join)")
    try {
      const cards = demoDeck(3)
      const salt = randomSalt()
      const { duelId } = await createDuelFree(signer, deckCommitment(cards, salt))
      await saveSecret(
        `deck.${duelId}`,
        JSON.stringify({ cards: cards.map((c) => [c.strike.toString(), c.probUp.toString()]), salt }),
      )
      onEnterDuel(duelId.toString())
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={18} tracking={3}>pvp duel</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        <Panel style={[st.pad, { borderColor: C.green }]}>
          <PixelText size={13} tracking={2}>practice vs bot</PixelText>
          <PixelText size={11} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 16 }}>
            free solo match — reveal the deck, swipe YES/NO, see if you read the
            market better than the bot. no stake.
          </PixelText>
          <PixelButton
            label={busy === "practice" ? "…" : "▶ practice (solo)"}
            color={C.green}
            onPress={onPractice}
            style={{ marginTop: 10 }}
          />
        </Panel>
        <Panel style={st.pad}>
          <PixelText size={13} tracking={2}>stake tier</PixelText>
          <View style={st.tiers}>
            {CHAIN.stakeTiers.map((t, i) => (
              <PixelButton
                key={i}
                label={`${Number(t) / Number(CHAIN.ONE_USDT)}`}
                color={i === tier ? C.eth : C.importBlue}
                onPress={() => setTier(i)}
                style={st.tier}
                size={14}
              />
            ))}
          </View>
          <PixelText size={11} upper={false} color={C.white45} style={{ marginTop: 8 }}>
            balance: {usdt.toFixed(2)} USD₮ · stake {stakeHuman} USD₮ per player
          </PixelText>
        </Panel>

        <Panel style={st.pad}>
          <PixelText size={13} tracking={2}>create a duel</PixelText>
          <PixelText size={11} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 18 }}>
            escrow your stake and get a code to share with your opponent.
          </PixelText>
          <PixelButton label={busy === "create" ? "…" : "create duel"} color={C.green} onPress={onCreate} style={{ marginTop: 12 }} />
          {createdId && (
            <View style={st.codeBox}>
              <PixelText size={11} color={C.white45}>duel code</PixelText>
              <PixelText size={26} tracking={2}>#{createdId}</PixelText>
              <PixelButton label="enter duel →" color={C.eth} onPress={() => onEnterDuel(createdId)} style={{ marginTop: 8 }} size={13} />
            </View>
          )}
        </Panel>

        <Panel style={st.pad}>
          <PixelText size={13} tracking={2}>join by code</PixelText>
          <TextInput
            value={joinId}
            onChangeText={setJoinId}
            placeholder="duel #"
            placeholderTextColor={C.white35}
            keyboardType="number-pad"
            style={st.input}
          />
          <PixelButton label={busy === "join" ? "…" : "join duel"} color={C.eth} onPress={onJoin} style={{ marginTop: 4 }} />
        </Panel>

        {status && (
          <Panel style={st.pad}>
            <PixelText size={11} upper={false} color={C.white70}>{status}</PixelText>
          </Panel>
        )}
        <PixelText size={10} upper={false} color={C.white35} style={{ textAlign: "center", marginTop: 4 }}>
          you are {address ? shortAddr(address) : ""}
        </PixelText>
      </ScrollView>
    </View>
  )
}

// ───────────────────────── Duel / swipe ─────────────────────────
export function DuelScreen({ duelId, onExit }: { duelId: string; onExit: () => void }) {
  const { signer, address, provider } = useWallet()
  const [duel, setDuel] = useState<DuelState | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const id = BigInt(duelId)

  const load = useCallback(async () => {
    try {
      setDuel(await fetchDuel(provider, id))
    } catch (e) {
      setStatus("load failed")
    }
  }, [provider, duelId])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const isCreator = !!duel && !!address && duel.creator.toLowerCase() === address.toLowerCase()
  const myNext = duel ? (isCreator ? duel.p0Next : duel.p1Next) : 0
  const revealingRef = useRef(false)

  const reveal = useCallback(async () => {
    if (!signer || revealingRef.current) return
    revealingRef.current = true
    setBusy(true)
    setStatus("revealing deck…")
    try {
      const raw = await loadSecret(`deck.${duelId}`)
      if (!raw) throw new Error("deck not found on this device (creator only)")
      const { cards, salt } = JSON.parse(raw) as { cards: [string, string][]; salt: string }
      await revealDeck(signer, id, cards.map(([s, p]) => ({ strike: BigInt(s), probUp: BigInt(p) })), salt)
      setStatus("deck revealed — start swiping")
      await load()
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 90) : "reveal failed")
    } finally {
      setBusy(false)
      revealingRef.current = false
    }
  }, [signer, duelId, id, load])

  // Auto-reveal once the opponent (bot) has joined — creator holds the deck.
  useEffect(() => {
    if (duel?.status === DUEL_STATUS.ACTIVE && duel.deckSize === 0 && isCreator && !revealingRef.current) {
      reveal()
    }
  }, [duel?.status, duel?.deckSize, isCreator, reveal])

  const swipe = async (isUp: boolean) => {
    if (!signer || !duel) return
    setBusy(true)
    setStatus(`recording ${isUp ? "YES" : "NO"} on card ${myNext}…`)
    try {
      await recordSwipe(signer, id, myNext, isUp)
      setStatus(`swiped ${isUp ? "YES" : "NO"} on card ${myNext}`)
      await load()
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 90) : "swipe failed")
    } finally {
      setBusy(false)
    }
  }

  const statusLabel =
    duel?.status === DUEL_STATUS.PENDING ? "waiting for opponent to join…"
    : duel?.status === DUEL_STATUS.ACTIVE ? (duel.deckSize === 0 ? "deck not revealed" : "active")
    : duel?.status === DUEL_STATUS.COMPLETE ? "settled" : "…"

  const done = duel && duel.deckSize > 0 && myNext >= duel.deckSize
  const complete = duel?.status === DUEL_STATUS.COMPLETE
  let resultLabel = ""
  let resultColor: string = C.white
  if (complete && duel) {
    const val0 = duel.p0Payout + duel.p1Premium
    const val1 = duel.p1Payout + duel.p0Premium
    const myVal = isCreator ? val0 : val1
    const oppVal = isCreator ? val1 : val0
    if (myVal > oppVal) {
      resultLabel = "YOU WON 🏆"
      resultColor = C.greenLight
    } else if (myVal < oppVal) {
      resultLabel = "you lost"
      resultColor = "#e08a8a"
    } else {
      resultLabel = "tie"
      resultColor = C.white60
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onExit} size={14} />
        <PixelText size={18} tracking={3}>duel #{duelId}</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        <Panel style={st.pad}>
          <PixelText size={12} tracking={1} color={C.white60}>{statusLabel}</PixelText>
          {duel && (
            <PixelText size={11} upper={false} color={C.white45} style={{ marginTop: 8, lineHeight: 18 }}>
              cards {duel.deckSize || "?"} · your progress {myNext}/{duel.deckSize || "?"}{"\n"}
              creator {shortAddr(duel.creator)} · challenger {duel.challenger === "0x0000000000000000000000000000000000000000" ? "—" : shortAddr(duel.challenger)}
            </PixelText>
          )}
        </Panel>

        {duel?.status === DUEL_STATUS.ACTIVE && duel.deckSize === 0 && isCreator && (
          <PixelButton label={busy ? "…" : "reveal deck & start"} color={C.green} onPress={reveal} />
        )}

        {duel && duel.deckSize > 0 && !done && (
          <Panel style={[st.pad, { alignItems: "center" }]}>
            <PixelText size={13} tracking={1}>card {myNext + 1} of {duel.deckSize}</PixelText>
            <PixelText size={11} upper={false} color={C.white45} style={{ marginVertical: 10 }}>
              will it settle above the strike?
            </PixelText>
            <View style={st.swipeRow}>
              <PixelButton label="NO" color="#b3434f" onPress={() => swipe(false)} style={st.swipeBtn} size={18} />
              <PixelButton label="YES" color={C.green} onPress={() => swipe(true)} style={st.swipeBtn} size={18} />
            </View>
          </Panel>
        )}

        {complete && (
          <Panel style={[st.pad, { alignItems: "center", borderColor: resultColor }]}>
            <PixelText size={22} tracking={2} color={resultColor}>
              {resultLabel}
            </PixelText>
            <PixelText size={11} upper={false} color={C.white45} style={{ textAlign: "center", marginTop: 8, lineHeight: 18 }}>
              settled on-chain ·{" "}
              {duel!.tier === 2 ? "practice (no stake)" : `pot ${fmtU(duel!.p0Stake + duel!.p1Stake)} USD₮`}
            </PixelText>
            <PixelButton label="back to lobby" color={C.importBlue} size={13} style={{ marginTop: 12 }} onPress={onExit} />
          </Panel>
        )}

        {done && !complete && (
          <Panel style={[st.pad, { alignItems: "center" }]}>
            <PixelText size={14} tracking={1}>all cards swiped</PixelText>
            <PixelText size={11} upper={false} color={C.white45} style={{ textAlign: "center", marginTop: 8, lineHeight: 18 }}>
              settling on-chain…{"\n"}the keeper resolves each card, then the higher PnL wins.
            </PixelText>
            <ActivityIndicator color={C.eth} style={{ marginTop: 10 }} />
          </Panel>
        )}

        {busy && <ActivityIndicator color={C.eth} style={{ marginTop: 8 }} />}
        {status && (
          <Panel style={st.pad}>
            <PixelText size={11} upper={false} color={C.white70}>{status}</PixelText>
          </Panel>
        )}
      </ScrollView>
    </View>
  )
}

// ───────────────────────── Pacts (friend bets) ─────────────────────────
const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim())
const errMsg = (e: unknown) => (e instanceof Error ? e.message.slice(0, 90) : "failed")

export function PactsScreen() {
  const { signer, address, provider, usdt } = useWallet()
  const [counterparty, setCounterparty] = useState("")
  const [terms, setTerms] = useState("")
  const [tier, setTier] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [ids, setIds] = useState<bigint[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const stake = CHAIN.stakeTiers[tier]

  const load = useCallback(async () => {
    if (!address) return
    try {
      setIds(await listMyPacts(provider, address))
    } catch {
      /* ignore */
    }
  }, [provider, address])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const onCreate = async () => {
    if (!signer || !address) return
    if (!isAddr(counterparty)) return setStatus("enter a valid friend address (0x…)")
    if (!terms.trim()) return setStatus("describe the bet")
    setBusy(true)
    setStatus("approving USD₮ + creating pact…")
    try {
      await approveUsdt(signer, stake)
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
      const { pactId } = await createPact(signer, {
        counterparty: counterparty.trim(),
        stake,
        termsText: terms.trim(),
        deadline,
      })
      setStatus(`pact #${pactId} created — share the code so your friend can accept`)
      setTerms("")
      setCounterparty("")
      setShowCreate(false)
      await load()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <PixelText size={22} tracking={4}>
          pacts
        </PixelText>
        <BalanceChip icon={USDT_ICON} amount={usdt.toFixed(2)} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        {/* stats + create toggle */}
        <Panel style={st.pad}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <PixelText size={32} tracking={1}>{ids.length}</PixelText>
              <PixelText size={10} upper color={C.white45} tracking={1}>
                pact{ids.length === 1 ? "" : "s"} with friends
              </PixelText>
            </View>
            <PixelButton
              label={showCreate ? "✕ cancel" : "+ create pact"}
              color={showCreate ? C.importBlue : C.green}
              size={12}
              onPress={() => setShowCreate((v) => !v)}
            />
          </View>
          <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 10, lineHeight: 15 }}>
            lock a bet with a friend — both stake, winner claims the pot, loser's
            escrow auto-releases. no custodian, no KYC.
          </PixelText>
        </Panel>

        {/* create form (toggled) */}
        {showCreate && (
        <Panel style={[st.pad, { borderColor: C.green }]}>
          <PixelText size={13} tracking={2}>
            new pact
          </PixelText>
          <TextInput
            value={terms}
            onChangeText={setTerms}
            placeholder="if Brazil scores first, you owe me 2 USD₮"
            placeholderTextColor={C.white35}
            multiline
            style={st.input}
          />
          <TextInput
            value={counterparty}
            onChangeText={setCounterparty}
            placeholder="friend's wallet address (0x…)"
            placeholderTextColor={C.white35}
            autoCapitalize="none"
            style={st.input}
          />
          <View style={st.tiers}>
            {CHAIN.stakeTiers.map((t, i) => (
              <PixelButton
                key={i}
                label={`${Number(t) / Number(CHAIN.ONE_USDT)}`}
                color={i === tier ? C.eth : C.importBlue}
                onPress={() => setTier(i)}
                style={st.tier}
                size={13}
              />
            ))}
          </View>
          <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6 }}>
            each side stakes {Number(stake) / Number(CHAIN.ONE_USDT)} USD₮ · winner takes {(2 * Number(stake)) / Number(CHAIN.ONE_USDT)}
          </PixelText>
          <PixelButton label={busy ? "…" : "lock the pact"} color={C.green} onPress={onCreate} style={{ marginTop: 12 }} />
        </Panel>
        )}

        {status && (
          <Panel style={st.pad}>
            <PixelText size={11} upper={false} color={C.white70}>
              {status}
            </PixelText>
          </Panel>
        )}

        <PixelText size={12} tracking={2} color={C.white45} style={{ marginTop: 4 }}>
          your pacts
        </PixelText>
        {ids.length === 0 && (
          <PixelText size={11} upper={false} color={C.white35}>
            no pacts yet. lock one above, or ask a friend for their pact code.
          </PixelText>
        )}
        {ids.map((id) => (
          <PactRow key={id.toString()} id={id} onChanged={load} setStatus={setStatus} />
        ))}

        {/* accept by code */}
        <AcceptByCode onAccepted={load} setStatus={setStatus} />
      </ScrollView>
    </View>
  )
}

function AcceptByCode({ onAccepted, setStatus }: { onAccepted: () => void; setStatus: (s: string) => void }) {
  const { signer, provider } = useWallet()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const onAccept = async () => {
    if (!signer || !code) return
    setBusy(true)
    setStatus("approving + accepting pact…")
    try {
      const p = await fetchPact(provider, BigInt(code))
      await approveUsdt(signer, p.stake)
      await acceptPact(signer, BigInt(code))
      setStatus(`accepted pact #${code} — stake locked`)
      setCode("")
      onAccepted()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel style={st.pad}>
      <PixelText size={13} tracking={2}>
        accept by code
      </PixelText>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="pact #"
        placeholderTextColor={C.white35}
        keyboardType="number-pad"
        style={st.input}
      />
      <PixelButton label={busy ? "…" : "accept pact"} color={C.eth} onPress={onAccept} />
    </Panel>
  )
}

function PactRow({ id, onChanged, setStatus }: { id: bigint; onChanged: () => void; setStatus: (s: string) => void }) {
  const { signer, address, provider } = useWallet()
  const [p, setP] = useState<PactState | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setP(await fetchPact(provider, id))
      setText(await getTermsText(id))
    } catch {
      /* ignore */
    }
  }, [provider, id])
  useEffect(() => {
    load()
  }, [load])

  if (!p || !address) return null
  const me = address.toLowerCase()
  const amProposer = p.proposer.toLowerCase() === me
  const amCounter = p.counterparty.toLowerCase() === me
  const amArbiter = p.arbiter.toLowerCase() === me && p.arbiter !== ZERO
  const other = amProposer ? p.counterparty : p.proposer
  const statusName =
    p.status === PACT_STATUS.PROPOSED ? "proposed"
    : p.status === PACT_STATUS.ACTIVE ? "active — locked"
    : p.status === PACT_STATUS.RESOLVED ? "resolved"
    : "refunded"

  const act = async (fn: () => Promise<string>, msg: string) => {
    setBusy(true)
    setStatus(msg)
    try {
      await fn()
      setStatus("done")
      await load()
      onChanged()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel style={st.pad}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <PixelText size={12} tracking={1}>
          pact #{id.toString()}
        </PixelText>
        <PixelText size={10} color={C.white45}>
          {statusName}
        </PixelText>
      </View>
      <PixelText size={12} upper={false} color={C.white} style={{ marginTop: 8, lineHeight: 18 }}>
        {text ?? "(terms hash on-chain — ask the proposer for the wording)"}
      </PixelText>
      <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6 }}>
        stake {Number(p.stake) / Number(CHAIN.ONE_USDT)} USD₮ · vs {shortAddr(other)}
        {p.status === PACT_STATUS.RESOLVED && p.winner !== ZERO ? `\nwinner: ${p.winner.toLowerCase() === me ? "you 🏆" : shortAddr(p.winner)}` : ""}
      </PixelText>

      {busy && <ActivityIndicator color={C.eth} style={{ marginTop: 8 }} />}

      {/* actions */}
      {p.status === PACT_STATUS.PROPOSED && amCounter && (
        <PixelButton label="accept & lock stake" color={C.green} style={{ marginTop: 10 }} size={13}
          onPress={() => act(async () => { await approveUsdt(signer!, p.stake); return acceptPact(signer!, id) }, "accepting…")} />
      )}
      {p.status === PACT_STATUS.PROPOSED && amProposer && (
        <PixelButton label="cancel & refund" color={C.importBlue} style={{ marginTop: 10 }} size={13}
          onPress={() => act(() => cancelPact(signer!, id), "cancelling…")} />
      )}
      {p.status === PACT_STATUS.ACTIVE && amArbiter && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <PixelText size={10} color={C.white45}>you are the arbiter — declare the winner</PixelText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PixelButton label="proposer" color={C.eth} style={{ flex: 1 }} size={12}
              onPress={() => act(() => resolvePactByArbiter(signer!, id, p.proposer), "resolving…")} />
            <PixelButton label="counterparty" color={C.eth} style={{ flex: 1 }} size={12}
              onPress={() => act(() => resolvePactByArbiter(signer!, id, p.counterparty), "resolving…")} />
          </View>
        </View>
      )}
      {p.status === PACT_STATUS.ACTIVE && (amProposer || amCounter) && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <PixelText size={10} color={C.white45}>agree on the outcome (both must match)</PixelText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PixelButton label="I won" color={C.green} style={{ flex: 1 }} size={12}
              onPress={() => act(() => agreePact(signer!, id, address), "voting…")} />
            <PixelButton label="they won" color="#b3434f" style={{ flex: 1 }} size={12}
              onPress={() => act(() => agreePact(signer!, id, other), "voting…")} />
            <PixelButton label="void" color={C.importBlue} style={{ flex: 1 }} size={12}
              onPress={() => act(() => agreePact(signer!, id, ZERO), "voting…")} />
          </View>
        </View>
      )}
    </Panel>
  )
}

// ───────────────────────── Profile (wallet hub) ─────────────────────────
const fmtU = (x: bigint) => (Number(x) / Number(CHAIN.ONE_USDT)).toFixed(2)

export function ProfileScreen({ onSwap }: { onSwap?: () => void }) {
  const { address, usdt, eth, signer, provider, getSeedPhrase, logout, refresh } = useWallet()
  const [phrase, setPhrase] = useState<string | null>(null)
  const [showPhrase, setShowPhrase] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!address) return
    myHistory(provider, address).then(setHistory).catch(() => {})
  }, [provider, address])

  const copyAddr = async () => {
    if (!address) return
    await Share.share({ message: address })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const reveal = async () => {
    if (showPhrase) return setShowPhrase(false)
    setPhrase(await getSeedPhrase())
    setShowPhrase(true)
  }
  const faucet = async () => {
    if (!signer || !address) return
    setBusy(true)
    setMsg("minting 100 test USD₮…")
    try {
      await mintUsdt(signer, address, 100n * CHAIN.ONE_USDT)
      await refresh()
      setMsg("minted 100 USD₮")
    } catch (e) {
      setMsg(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <PixelText size={22} tracking={4}>
          profile
        </PixelText>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        <Panel style={[st.pad, { alignItems: "center" }]}>
          <View style={[st.avatar, { width: 88, height: 88, borderRadius: 14, marginBottom: 12 }]} />
          <PixelText size={20} tracking={1}>
            {address ? shortAddr(address) : "…"}
          </PixelText>
          <Pressable onPress={copyAddr} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PixelText size={11} upper={false} color={copied ? C.greenLight : C.white60}>
              {address ? shortAddr(address) : ""}
            </PixelText>
            <PixelText size={13} color={copied ? C.greenLight : C.white45}>
              {copied ? "✓" : "⎘"}
            </PixelText>
          </Pressable>
          <PixelText size={9} tracking={2} color={C.white45} style={{ marginTop: 8 }}>
            self-custodial · via WDK
          </PixelText>
          <View style={{ height: 1, alignSelf: "stretch", backgroundColor: C.white15, marginVertical: 14 }} />
          <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
            <PixelButton label="receive" color={C.eth} size={12} style={{ flex: 1 }} onPress={copyAddr} />
            <PixelButton label={busy ? "…" : "mint USD₮"} color={C.green} size={12} style={{ flex: 1 }} onPress={faucet} />
          </View>
        </Panel>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Panel style={[st.pad, { flex: 1, alignItems: "center" }]}>
            <PixelText size={10} color={C.white45} tracking={1}>
              USD₮
            </PixelText>
            <PixelText size={20} style={{ marginTop: 4 }}>
              {usdt.toFixed(2)}
            </PixelText>
          </Panel>
          <Panel style={[st.pad, { flex: 1, alignItems: "center" }]}>
            <PixelText size={10} color={C.white45} tracking={1}>
              gas (ETH)
            </PixelText>
            <PixelText size={20} style={{ marginTop: 4 }}>
              {eth.toFixed(4)}
            </PixelText>
          </Panel>
        </View>

        <PixelButton label="⇄ swap tokens (mainnet)" color={C.importBlue} size={12} onPress={onSwap} />

        {msg && (
          <PixelText size={11} upper={false} color={C.white60} style={{ textAlign: "center" }}>
            {msg}
          </PixelText>
        )}

        {/* backup */}
        <Panel style={st.pad}>
          <PixelText size={12} tracking={2}>
            recovery phrase
          </PixelText>
          <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 16 }}>
            your keys, your funds. never share these 12 words.
          </PixelText>
          {showPhrase && phrase && (
            <View style={st.grid}>
              {phrase.split(" ").map((w, i) => (
                <View key={i} style={st.word}>
                  <PixelText size={10} color={C.white35} upper={false}>
                    {i + 1}{" "}
                  </PixelText>
                  <PixelText size={10} upper={false}>
                    {w}
                  </PixelText>
                </View>
              ))}
            </View>
          )}
          <PixelButton
            label={showPhrase ? "hide" : "reveal recovery phrase"}
            color={C.importBlue}
            size={12}
            style={{ marginTop: 10 }}
            onPress={reveal}
          />
        </Panel>

        {/* pvp history (collapsible) */}
        <Pressable
          onPress={() => setShowHistory((v) => !v)}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.eth, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 }}
        >
          <PixelText size={12} tracking={2}>pvp history ({history.length})</PixelText>
          <PixelText size={12}>{showHistory ? "▾" : "▸"}</PixelText>
        </Pressable>
        {showHistory && history.length === 0 && (
          <PixelText size={11} upper={false} color={C.white35} style={{ textAlign: "center", marginTop: 2 }}>
            no 1v1 history yet
          </PixelText>
        )}
        {showHistory && history.map((h) => (
          <Panel key={`${h.kind}-${h.id}`} style={[st.pad, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View>
              <PixelText size={12} tracking={1}>
                {h.kind} #{h.id}
              </PixelText>
              <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 4 }}>
                stake {fmtU(h.stake)} USD₮
              </PixelText>
            </View>
            <PixelText
              size={12}
              color={h.outcome === "won" ? C.greenLight : h.outcome === "lost" ? "#e08a8a" : C.white45}
            >
              {h.outcome === "won" ? "WON 🏆" : h.outcome.toUpperCase()}
            </PixelText>
          </Panel>
        ))}

        <Panel style={st.pad}>
          <PixelText size={10} upper={false} color={C.white45} style={{ lineHeight: 16 }}>
            network: Sepolia testnet · gas in ETH · stakes in USD₮{"\n"}self-custodial wallet — secured by WDK
          </PixelText>
        </Panel>

        <PixelButton label="log out" color="#7a2e2e" size={13} onPress={logout} style={{ marginTop: 4, marginBottom: 8 }} />
      </ScrollView>
    </View>
  )
}

// ───────────────────────── Rank (leaderboard) ─────────────────────────
export function RankScreen() {
  const { address, provider } = useWallet()
  const [rows, setRows] = useState<RankRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    leaderboard(provider)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [provider])
  useEffect(() => {
    load()
  }, [load])

  const me = address?.toLowerCase()
  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <PixelText size={22} tracking={4}>
          rank
        </PixelText>
        <PixelButton label="↻" color={C.importBlue} size={13} onPress={load} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        <PixelText size={11} upper={false} color={C.white45} style={{ lineHeight: 16 }}>
          live leaderboard — total USD₮ won across duels + pacts (on-chain).
        </PixelText>
        {loading && <ActivityIndicator color={C.eth} style={{ marginTop: 10 }} />}
        {!loading && rows.length === 0 && (
          <PixelText size={11} upper={false} color={C.white35}>
            no finished matches yet. be the first to win a pot.
          </PixelText>
        )}
        {rows.map((r, i) => {
          const mine = r.address.toLowerCase() === me
          return (
            <Panel key={r.address} style={[st.pad, { flexDirection: "row", alignItems: "center", borderColor: mine ? C.eth : C.panelBorder }]}>
              <PixelText size={16} color={i === 0 ? C.gold : C.white} style={{ width: 36 }}>
                {i + 1}
              </PixelText>
              <View style={{ flex: 1 }}>
                <PixelText size={12} tracking={1} color={mine ? C.eth : C.white}>
                  {shortAddr(r.address)} {mine ? "(you)" : ""}
                </PixelText>
                <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 4 }}>
                  {r.wins} win{r.wins === 1 ? "" : "s"}
                </PixelText>
              </View>
              <PixelText size={13} color={C.greenLight}>
                {fmtU(r.wonUsdt)} USD₮
              </PixelText>
            </Panel>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ───────────────────────── Game detail + predict ─────────────────────────
export function GameScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { signer, usdt } = useWallet()
  const [game, setGame] = useState<Game | null>(null)
  const [outcome, setOutcome] = useState<"home" | "draw" | "away" | null>(null)
  const [counterparty, setCounterparty] = useState("")
  const [tier, setTier] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  useEffect(() => {
    fetchGame(gameId).then(setGame).catch(() => {})
  }, [gameId])

  const stake = CHAIN.stakeTiers[tier]
  const live = game?.state === "in"
  const done = game?.state === "post"

  const onCreate = async () => {
    if (!signer || !game || !outcome) return setStatus("pick an outcome")
    if (!isAddr(counterparty)) return setStatus("enter a friend's wallet address")
    setBusy(true)
    setStatus("approving USD₮ + creating prediction…")
    try {
      const label =
        outcome === "draw"
          ? `Draw — ${game.home.shortName} vs ${game.away.shortName}`
          : `${outcome === "home" ? game.home.shortName : game.away.shortName} to beat ${outcome === "home" ? game.away.shortName : game.home.shortName}`
      const terms = `${label} · World Cup ${kickoffLabel(game)}`
      await approveUsdt(signer, stake)
      const { pactId } = await createPact(signer, {
        counterparty: counterparty.trim(),
        stake,
        termsText: terms,
        deadline: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      })
      setCreatedId(pactId.toString())
      setStatus(`prediction #${pactId} locked — share the code with your friend`)
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={16} tracking={2}>match</PixelText>
        <View style={{ width: 44 }} />
      </View>
      {!game ? (
        <ActivityIndicator color={C.eth} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={st.scroll}>
          <Panel style={[st.pad, live ? { borderColor: "#c0392b" } : null]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <PixelText size={9} color={C.white45} tracking={1}>{game.leagueName}</PixelText>
              <PixelText size={9} color={live ? "#ff8a80" : C.white45} tracking={1}>
                {live ? `● ${game.status}` : done ? "FULL TIME" : kickoffLabel(game)}
              </PixelText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}>
              <View style={{ alignItems: "center", flex: 1 }}>
                {game.home.logo && <Image source={{ uri: game.home.logo }} style={{ width: 52, height: 52 }} resizeMode="contain" />}
                <PixelText size={11} upper={false} style={{ marginTop: 6, textAlign: "center" }}>{game.home.shortName}</PixelText>
              </View>
              <PixelText size={26} tracking={1}>
                {live || done ? `${game.home.score ?? 0}–${game.away.score ?? 0}` : "vs"}
              </PixelText>
              <View style={{ alignItems: "center", flex: 1 }}>
                {game.away.logo && <Image source={{ uri: game.away.logo }} style={{ width: 52, height: 52 }} resizeMode="contain" />}
                <PixelText size={11} upper={false} style={{ marginTop: 6, textAlign: "center" }}>{game.away.shortName}</PixelText>
              </View>
            </View>
            {game.venue && (
              <PixelText size={9} upper={false} color={C.white35} style={{ textAlign: "center", marginTop: 12 }}>{game.venue}</PixelText>
            )}
          </Panel>

          {done ? (
            <Panel style={st.pad}>
              <PixelText size={12} upper={false} color={C.white60} style={{ textAlign: "center" }}>
                this match has finished — predictions are closed.
              </PixelText>
            </Panel>
          ) : (
            <>
              <Panel style={[st.pad, { borderColor: C.green }]}>
                <PixelText size={13} tracking={2}>create a prediction</PixelText>
                <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 15 }}>
                  pick an outcome and lock USD₮ vs a friend. winner takes the pot when the match settles.
                </PixelText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  {([
                    ["home", game.home.shortName],
                    ["draw", "draw"],
                    ["away", game.away.shortName],
                  ] as const).map(([k, lbl]) => (
                    <PixelButton
                      key={k}
                      label={lbl}
                      color={outcome === k ? C.eth : C.importBlue}
                      onPress={() => setOutcome(k)}
                      style={{ flex: 1, paddingHorizontal: 0 }}
                      size={11}
                    />
                  ))}
                </View>
                <View style={st.tiers}>
                  {CHAIN.stakeTiers.map((t, i) => (
                    <PixelButton key={i} label={`${Number(t) / Number(CHAIN.ONE_USDT)}`} color={i === tier ? C.eth : C.importBlue} onPress={() => setTier(i)} style={st.tier} size={13} />
                  ))}
                </View>
                <TextInput
                  value={counterparty}
                  onChangeText={setCounterparty}
                  placeholder="friend's wallet address (0x…)"
                  placeholderTextColor={C.white35}
                  autoCapitalize="none"
                  style={st.input}
                />
                <PixelText size={10} upper={false} color={C.white45}>
                  balance {usdt.toFixed(2)} USD₮ · stake {Number(stake) / Number(CHAIN.ONE_USDT)} each
                </PixelText>
                <PixelButton label={busy ? "…" : "lock prediction"} color={C.green} onPress={onCreate} style={{ marginTop: 10 }} />
                {createdId && (
                  <View style={st.codeBox}>
                    <PixelText size={10} color={C.white45}>prediction code</PixelText>
                    <PixelText size={24} tracking={2}>#{createdId}</PixelText>
                    <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 4 }}>
                      friend accepts in the Pacts tab
                    </PixelText>
                  </View>
                )}
              </Panel>
              {status && (
                <Panel style={st.pad}>
                  <PixelText size={11} upper={false} color={C.white70}>{status}</PixelText>
                </Panel>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

// ───────────────────────── Swap router (Velora, mainnet) ─────────────────────────
export function SwapScreen({ onBack }: { onBack: () => void }) {
  const { getSeedPhrase } = useWallet()
  const [net, setNet] = useState<SwapNetwork>(SWAP_NETWORKS[0])
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(1)
  const [amount, setAmount] = useState("10")
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState<"quote" | "swap" | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const tokenIn = net.tokens[fromIdx]
  const tokenOut = net.tokens[toIdx]

  useEffect(() => {
    setFromIdx(0)
    setToIdx(1)
    setQuote(null)
    setStatus(null)
  }, [net])

  const cycle = (which: "from" | "to") => {
    setQuote(null)
    if (which === "from") setFromIdx((i) => (i + 1) % net.tokens.length === toIdx ? (i + 2) % net.tokens.length : (i + 1) % net.tokens.length)
    else setToIdx((i) => (i + 1) % net.tokens.length === fromIdx ? (i + 2) % net.tokens.length : (i + 1) % net.tokens.length)
  }
  const flip = () => {
    setQuote(null)
    setFromIdx(toIdx)
    setToIdx(fromIdx)
  }

  const getQuote = async () => {
    setBusy("quote")
    setStatus(null)
    setQuote(null)
    try {
      const amountIn = ethers.parseUnits(amount || "0", tokenIn.decimals)
      if (amountIn <= 0n) throw new Error("enter an amount")
      setQuote(await quoteSwap({ network: net, tokenIn, tokenOut, amountIn }))
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const doSwap = async () => {
    if (!quote) return
    setBusy("swap")
    setStatus("building swap on " + net.name + "…")
    try {
      const seed = await getSeedPhrase()
      if (!seed) throw new Error("no wallet")
      const provider = new ethers.JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true })
      const signer = ethers.Wallet.fromPhrase(seed).connect(provider)
      const amountIn = ethers.parseUnits(amount, tokenIn.decimals)
      const { hash } = await executeSwap({ signer, network: net, tokenIn, tokenOut, amountIn, quote })
      setStatus(`swapped! ${hash.slice(0, 12)}…`)
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const out = quote ? ethers.formatUnits(quote.destAmount, tokenOut.decimals) : ""

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={16} tracking={2}>swap</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        <View style={st.filterRow}>
          {SWAP_NETWORKS.map((n) => (
            <Pressable key={n.key} onPress={() => setNet(n)} style={[st.filterTab, net.key === n.key ? st.filterTabActive : null]}>
              <PixelText size={11} color={net.key === n.key ? C.white : C.white45} tracking={1}>{n.name}</PixelText>
            </Pressable>
          ))}
        </View>

        <Panel style={st.pad}>
          <PixelText size={10} color={C.white45} tracking={1}>you pay</PixelText>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <TextInput
              value={amount}
              onChangeText={(t) => { setAmount(t); setQuote(null) }}
              keyboardType="decimal-pad"
              style={[st.input, { flex: 1, marginVertical: 0 }]}
              placeholder="0.0"
              placeholderTextColor={C.white35}
            />
            <PixelButton label={tokenIn.symbol} color={C.importBlue} size={13} onPress={() => cycle("from")} style={{ marginLeft: 8, paddingHorizontal: 14 }} />
          </View>
        </Panel>

        <Pressable onPress={flip} style={{ alignSelf: "center" }}>
          <PixelText size={18} color={C.eth}>⇅</PixelText>
        </Pressable>

        <Panel style={st.pad}>
          <PixelText size={10} color={C.white45} tracking={1}>you receive</PixelText>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <PixelText size={20}>{out ? Number(out).toFixed(4) : "—"}</PixelText>
            <PixelButton label={tokenOut.symbol} color={C.importBlue} size={13} onPress={() => cycle("to")} style={{ paddingHorizontal: 14 }} />
          </View>
          {quote && (
            <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 8 }}>
              ≈ ${Number(quote.destUSD).toFixed(2)} · gas ~${Number(quote.gasCostUSD).toFixed(3)}
            </PixelText>
          )}
        </Panel>

        <PixelButton label={busy === "quote" ? "quoting…" : "get quote"} color={C.eth} onPress={getQuote} />
        {quote && (
          <PixelButton label={busy === "swap" ? "swapping…" : `swap on ${net.name}`} color={C.green} onPress={doSwap} />
        )}

        <Panel style={st.pad}>
          <PixelText size={9} upper={false} color={C.white45} style={{ lineHeight: 14 }}>
            real swaps via Velora (ParaSwap) aggregator. {net.name} mainnet — needs
            funds + gas on {net.name}. this is the rail that funds the Polymarket
            tier; testnet Pacts/Duels stay on Sepolia.
          </PixelText>
        </Panel>

        {status && (
          <Panel style={st.pad}>
            <PixelText size={11} upper={false} color={C.white70}>{status}</PixelText>
          </Panel>
        )}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  hero: { width: 240, height: 150, marginBottom: 4 },
  sub: { textAlign: "center", marginTop: 6, marginBottom: 20 },
  full: { alignSelf: "stretch" },
  errBox: { backgroundColor: "rgba(255,0,0,0.12)", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, alignSelf: "stretch" },
  warn: { textAlign: "center", marginBottom: 12, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, justifyContent: "center" },
  word: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, width: "30%" },
  input: { alignSelf: "stretch", borderWidth: 1, borderColor: C.white15, borderRadius: 8, color: C.white, padding: 12, marginVertical: 10, fontFamily: "FlickyPixel", fontSize: 13 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", marginVertical: 12 },
  dline: { flex: 1, height: 1, backgroundColor: C.white15 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  ethChip: { borderRadius: 10, backgroundColor: C.panel, paddingHorizontal: 8, paddingVertical: 6 },
  avatar: { width: 46, height: 46, borderRadius: 10, backgroundColor: C.ethLight },
  gear: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.green },
  title: { textAlign: "center", marginVertical: 10 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 8 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 6 },
  filterTab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, backgroundColor: C.panel },
  filterTabActive: { backgroundColor: C.eth },
  statusPill: { backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  cardCta: { marginTop: 10, alignItems: "flex-end" },
  scroll: { gap: 14, paddingHorizontal: 12, paddingBottom: 28, paddingTop: 4 },
  pad: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  badge: { borderWidth: 1, borderColor: C.white35, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  stats: { flexDirection: "row", marginTop: 16 },
  stat: { flex: 1, alignItems: "center" },
  matchBody: { alignItems: "center", paddingVertical: 22 },

  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  tiers: { flexDirection: "row", gap: 8, marginTop: 10 },
  tier: { flex: 1, paddingHorizontal: 0 },
  codeBox: { alignItems: "center", marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.25)" },
  swipeRow: { flexDirection: "row", gap: 12, alignSelf: "stretch" },
  swipeBtn: { flex: 1, paddingVertical: 22 },
})
