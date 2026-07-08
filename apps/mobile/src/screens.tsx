/**
 * Kickpact mobile screens (RN StyleSheet). Real on-chain flow:
 *  - SignIn  : create / import a self-custodial wallet (real BIP-39 seed)
 *  - Home    : live USD₮ + ETH balances, USD₮ faucet, enter PvP
 *  - Pvp     : create a duel (stake escrow) or join one by code — real txs
 *  - Duel    : reveal deck (creator) + swipe YES/NO on each card — real txs
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from "react-native"

import { C } from "./theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./ui"
import { useWallet } from "./wallet"
import { CHAIN, DUEL_STATUS, shortAddr } from "./chain"
import {
  approveUsdt,
  createDuel,
  createDuelFree,
  cryptoDeck,
  deckCommitment,
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
  addMatchPact,
  agreePact,
  approvePacts,
  cancelPact,
  createOpenPact,
  createPact,
  fetchPact,
  getTermsText,
  listMatchPacts,
  listMyPacts,
  listOpenRooms,
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
  finalOutcome,
  kickoffLabel,
  predictionTerms,
  type Filter as GameFilter,
  type Game,
  type Outcome,
} from "./football"
import {
  executeSwap,
  quoteSwap,
  SWAP_NETWORKS,
  type Quote,
  type SwapNetwork,
  type Token,
} from "./swap"
import { ChainLogo, ChainSwitcherModal, chainByKey, type EvmChain } from "./chains"
import { BRIDGE_CHAINS, bridge, quoteBridge, type BridgeChain } from "./bridge"
import { offRamp, onRamp } from "./fiat"
import { assetForStrike, fetchTickers, fromStrike, priceLabel, type Ticker } from "./prices"
import { fetchMarkets, fmtVolume, marketUrl, toCents, type PolyMarket } from "./polymarket"
import * as clob from "./clob"
import { QRModal, QRScanner } from "./qr"
import { MatchRoom, type RoomMsg } from "./room"
import { ethers } from "ethers"

const BRIDGE_CHAIN_LOGOS = BRIDGE_CHAINS.map((c) => chainByKey(c.key)).filter(Boolean) as EvmChain[]
const nativeSym = (key: string) => (key === "polygon" ? "POL" : "ETH")

// Deep-link join targets encoded in shareable QR codes.
export const joinLink = (type: "duel" | "pact", id: string) => `kickpact://join?type=${type}&id=${id}`

/** Pull a numeric id out of a scanned Kickpact QR (join link, #code, or raw #). */
export function parseJoinId(value: string): string | null {
  const m = value.trim().match(/[?&]id=(\d+)/)
  if (m) return m[1]
  const n = value.replace(/[^0-9]/g, "")
  return n || null
}

// USD₮ address per chain (for the dashboard balance + withdraw).
const USDT_BY_CHAIN: Record<string, string> = {
  sepolia: CHAIN.usdtAddress,
  polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
}
const ERC20_MIN = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
]

const SWAP_CHAINS = SWAP_NETWORKS.map((n) => chainByKey(n.key)).filter(Boolean) as EvmChain[]

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

// ───────────────────────── Home dashboard (balance + actions) ─────────────────────────
function ActionBtn({ icon, label, onPress, disabled }: { icon: string; label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[st.actionBtn, disabled ? { opacity: 0.4 } : null]}>
      <View style={st.actionIcon}>
        <PixelText size={17} color={C.white}>{icon}</PixelText>
      </View>
      <PixelText size={9} color={C.white70} tracking={1}>{label}</PixelText>
    </Pressable>
  )
}

function WithdrawModal({
  visible,
  chain,
  usdtAddress,
  onClose,
  onDone,
}: {
  visible: boolean
  chain: EvmChain
  usdtAddress?: string
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { getSeedPhrase } = useWallet()
  const [to, setTo] = useState("")
  const [amt, setAmt] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const send = async () => {
    setErr(null)
    if (!usdtAddress) return setErr("USD₮ not available on " + chain.name)
    if (!ethers.isAddress(to)) return setErr("invalid address")
    setBusy(true)
    try {
      const seed = await getSeedPhrase()
      if (!seed) throw new Error("no wallet")
      const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true })
      const signer = ethers.Wallet.fromPhrase(seed).connect(provider)
      const usdt = new ethers.Contract(usdtAddress, ERC20_MIN, signer)
      const tx = await usdt.transfer(to, ethers.parseUnits(amt || "0", 6))
      await tx.wait()
      onDone(`sent ${amt} USD₮ · ${tx.hash.slice(0, 10)}…`)
      onClose()
      setTo("")
      setAmt("")
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={st.modalOverlay}>
        <Pressable onPress={() => {}} style={st.modalSheet}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <PixelText size={14} tracking={2}>withdraw USD₮</PixelText>
            <Pressable onPress={onClose} hitSlop={10}>
              <PixelText size={16} color={C.white45}>✕</PixelText>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ChainLogo chain={chain} size={20} />
            <PixelText size={10} upper={false} color={C.white45}>
              on {chain.name}
              {chain.testnet ? " testnet" : " mainnet"}
            </PixelText>
          </View>
          <TextInput value={to} onChangeText={setTo} placeholder="0x recipient address" placeholderTextColor={C.white35} autoCapitalize="none" style={st.input} />
          <TextInput value={amt} onChangeText={setAmt} placeholder="amount (USD₮)" placeholderTextColor={C.white35} keyboardType="decimal-pad" style={st.input} />
          {err && <PixelText size={10} upper={false} color="#e57373" style={{ marginBottom: 8 }}>{err}</PixelText>}
          <PixelButton label={busy ? "sending…" : "send"} color={C.green} onPress={send} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function HomeDashboard({ onSwap, onBridge, onMarkets }: { onSwap: () => void; onBridge: () => void; onMarkets: () => void }) {
  const { usdt, signer, address, refresh } = useWallet()
  const [mode, setMode] = useState<"testnet" | "mainnet">("testnet")
  const [mainBal, setMainBal] = useState<number | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const chain = mode === "testnet" ? chainByKey("sepolia")! : chainByKey("polygon")!
  const usdtAddress = USDT_BY_CHAIN[chain.key]
  const displayBal = mode === "testnet" ? usdt : mainBal ?? 0

  useEffect(() => {
    if (mode !== "mainnet" || !address) return
    let alive = true
    ;(async () => {
      try {
        const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true })
        const usdtC = new ethers.Contract(usdtAddress, ERC20_MIN, provider)
        const bal: bigint = await usdtC.balanceOf(address)
        if (alive) setMainBal(Number(ethers.formatUnits(bal, 6)))
      } catch {
        if (alive) setMainBal(0)
      }
    })()
    return () => {
      alive = false
    }
  }, [mode, address])

  const addBalance = async () => {
    setNote(null)
    if (mode === "testnet") {
      if (!signer || !address) return
      setBusy(true)
      setNote("minting test USD₮…")
      try {
        await mintUsdt(signer, address, 100n * CHAIN.ONE_USDT)
        await refresh()
        setNote("+100 USD₮ minted to your wallet")
      } catch (e) {
        const msg = errMsg(e)
        if (/insufficient funds/i.test(msg)) {
          // first-run trap: minting needs a drop of Sepolia ETH for gas
          setNote("needs a drop of Sepolia ETH for gas — grab some free from a faucet (opening one), then mint again")
          Linking.openURL("https://cloud.google.com/application/web3/faucet/ethereum/sepolia").catch(() => {})
        } else {
          setNote(msg)
        }
      } finally {
        setBusy(false)
      }
    } else {
      if (!address) return
      setNote("opening MoonPay on-ramp…")
      try {
        await onRamp({ walletAddress: address, asset: "usdt", fiat: "usd", amount: 100 })
      } catch (e) {
        setNote(errMsg(e))
      }
    }
  }

  const doOfframp = async () => {
    if (!address) return
    setNote("opening MoonPay off-ramp…")
    try {
      await offRamp({ refundAddress: address, asset: "usdt", fiat: "usd" })
    } catch (e) {
      setNote(errMsg(e))
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={st.modeRow}>
        {(["testnet", "mainnet"] as const).map((m) => (
          <Pressable key={m} onPress={() => { setMode(m); setNote(null) }} style={[st.modePill, mode === m ? st.modePillActive : null]}>
            <PixelText size={10} color={mode === m ? C.white : C.white45} tracking={1}>{m}</PixelText>
          </Pressable>
        ))}
      </View>

      <Panel style={st.balCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <PixelText size={10} color={C.white45} tracking={1}>total balance</PixelText>
            <PixelText size={32} style={{ marginTop: 6 }}>${displayBal.toFixed(2)}</PixelText>
            <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 4 }}>
              {displayBal.toFixed(2)} USD₮ · {chain.name}
              {chain.testnet ? " testnet" : " mainnet"}
            </PixelText>
          </View>
          <ChainLogo chain={chain} size={34} />
        </View>
      </Panel>

      <View style={st.actionRow}>
        <ActionBtn icon="＋" label={mode === "testnet" ? "mint" : "add"} onPress={addBalance} disabled={busy} />
        <ActionBtn icon="⇄" label="swap" onPress={onSwap} />
        <ActionBtn icon="⤳" label="bridge" onPress={onBridge} />
        <ActionBtn icon="↑" label="withdraw" onPress={() => setWithdrawing(true)} />
        <ActionBtn icon="＄" label="offramp" onPress={doOfframp} />
      </View>

      {note && <PixelText size={10} upper={false} color={C.white60}>{note}</PixelText>}

      <Pressable onPress={onMarkets} style={st.polyBanner}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.eth, alignItems: "center", justifyContent: "center" }}>
          <PixelText size={16} color={C.white}>◎</PixelText>
        </View>
        <View style={{ flex: 1 }}>
          <PixelText size={12} tracking={1}>Polymarket</PixelText>
          <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 2 }}>
            trade real World Cup markets · mainnet
          </PixelText>
        </View>
        <PixelText size={14} color={C.eth}>→</PixelText>
      </Pressable>

      <WithdrawModal
        visible={withdrawing}
        chain={chain}
        usdtAddress={usdtAddress}
        onClose={() => setWithdrawing(false)}
        onDone={(m) => { setNote(m); refresh() }}
      />
    </View>
  )
}

export function HomeScreen({ onProfile, onGame, onSwap, onBridge, onMarkets }: { onProfile?: () => void; onGame: (id: string) => void; onSwap: () => void; onBridge: () => void; onMarkets: () => void }) {
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        <HomeDashboard onSwap={onSwap} onBridge={onBridge} onMarkets={onMarkets} />
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 2 }}>
          <PixelText size={20} tracking={3}>world cup</PixelText>
          <PixelText size={9} upper={false} color={C.white45}>p2p prediction market</PixelText>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
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
export function PvpScreen({ onBack, onEnterDuel, onSolo }: { onBack: () => void; onEnterDuel: (id: string) => void; onSolo: () => void }) {
  const { signer, address, usdt } = useWallet()
  const [tier, setTier] = useState(2) // index into stakeTiers (5 USD₮)
  const [joinId, setJoinId] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const stake = CHAIN.stakeTiers[tier]
  const stakeHuman = Number(stake) / Number(CHAIN.ONE_USDT)

  const onCreate = async () => {
    if (!signer) return
    setBusy("create")
    setStatus("approving USD₮…")
    try {
      await approveUsdt(signer, stake)
      setStatus("creating duel on-chain…")
      const cards = await cryptoDeck(3)
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

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={18} tracking={3}>pvp arena</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        {/* SOLO — local, instant, no stake */}
        <PixelText size={11} tracking={2} color={C.white45}>solo</PixelText>
        <Pressable onPress={onSolo}>
          <Panel style={[st.pad, { borderColor: C.green, paddingVertical: 18 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <PixelText size={15} tracking={1}>practice vs bot</PixelText>
                <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 15 }}>
                  read the live crypto market against a bot. free, instant, no
                  stake — a perfect warm-up.
                </PixelText>
              </View>
              <PixelText size={30}>🤖</PixelText>
            </View>
            <PixelButton label="▶ play solo" color={C.green} onPress={onSolo} style={{ marginTop: 12 }} />
          </Panel>
        </Pressable>

        {/* divider */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.white15 }} />
          <PixelText size={9} color={C.white35} tracking={1}>or stake vs a friend</PixelText>
          <View style={{ flex: 1, height: 1, backgroundColor: C.white15 }} />
        </View>

        {/* PVP — on-chain, staked, vs a real player */}
        <PixelText size={11} tracking={2} color={C.white45}>pvp · real player</PixelText>
        <Panel style={[st.pad, { borderColor: C.eth }]}>
          <PixelText size={13} tracking={1}>1. pick your stake</PixelText>
          <View style={st.tiers}>
            {CHAIN.stakeTiers.map((t, i) => (
              <PixelButton key={i} label={`${Number(t) / Number(CHAIN.ONE_USDT)}`} color={i === tier ? C.eth : C.importBlue} onPress={() => setTier(i)} style={st.tier} size={14} />
            ))}
          </View>
          <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 8, lineHeight: 15 }}>
            balance {usdt.toFixed(2)} USD₮ · {stakeHuman} each · winner takes {stakeHuman * 2}. settled on real prices.
          </PixelText>
          <PixelText size={13} tracking={1} style={{ marginTop: 16 }}>2. create + share the code</PixelText>
          <PixelButton label={busy === "create" ? "creating…" : "create duel"} color={C.green} onPress={onCreate} style={{ marginTop: 8 }} />
          {createdId && (
            <View style={st.codeBox}>
              <PixelText size={11} color={C.white45}>duel code</PixelText>
              <PixelText size={26} tracking={2}>#{createdId}</PixelText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <PixelButton label="▦ QR" color={C.importBlue} onPress={() => setQrOpen(true)} size={13} style={{ flex: 1 }} />
                <PixelButton label="enter duel →" color={C.eth} onPress={() => onEnterDuel(createdId)} size={13} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </Panel>

        <Panel style={st.pad}>
          <PixelText size={13} tracking={1}>join a friend's duel</PixelText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput value={joinId} onChangeText={setJoinId} placeholder="duel #" placeholderTextColor={C.white35} keyboardType="number-pad" style={[st.input, { flex: 1, marginVertical: 0 }]} />
            <PixelButton label={busy === "join" ? "…" : "join"} color={C.eth} onPress={onJoin} style={{ paddingHorizontal: 18 }} />
          </View>
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
      {createdId && (
        <QRModal
          visible={qrOpen}
          title={`duel #${createdId}`}
          value={joinLink("duel", createdId)}
          code={`#${createdId}`}
          hint="your opponent scans this (or enters the code) to join and stake."
          onClose={() => setQrOpen(false)}
        />
      )}
    </View>
  )
}

// ───────────────────────── Solo practice (local, instant) ─────────────────────────
// A fully client-side duel vs a bot — real crypto cards, real-price settlement,
// no chain / gas / daemon, so it always works. On-chain staking is PvP only.
interface PracticeRow { asset: string; strike: number; live: number; actualUp: boolean; mine: boolean; bot: boolean }

export function PracticeScreen({ onExit }: { onExit: () => void }) {
  const [deck, setDeck] = useState<{ strike: bigint; probUp: bigint }[]>([])
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map())
  const [idx, setIdx] = useState(0)
  const [swipes, setSwipes] = useState<boolean[]>([])
  const [phase, setPhase] = useState<"loading" | "play" | "watching" | "result">("loading")
  const [rows, setRows] = useState<PracticeRow[]>([])
  const [outcome, setOutcome] = useState<"win" | "lose" | "tie">("tie")

  const start = useCallback(async () => {
    setPhase("loading")
    setIdx(0)
    setSwipes([])
    setRows([])
    try {
      const t = await fetchTickers()
      const d = await cryptoDeck(3)
      setTickers(t)
      setDeck(d)
      setPhase("play")
    } catch {
      setPhase("play")
    }
  }, [])
  useEffect(() => { start() }, [start])

  // live prices while playing / watching
  useEffect(() => {
    if (phase !== "play" && phase !== "watching") return
    const iv = setInterval(() => fetchTickers().then(setTickers).catch(() => {}), 4000)
    return () => clearInterval(iv)
  }, [phase])

  const settle = async (mine: boolean[]) => {
    setPhase("watching")
    await new Promise((r) => setTimeout(r, 5000)) // watch the market settle
    const fresh = await fetchTickers().catch(() => tickers)
    const SCALE = 1e9
    let myScore = 0, botScore = 0
    const out: PracticeRow[] = deck.map((card, i) => {
      const asset = assetForStrike(card.strike, fresh)
      const sym = asset?.symbol ?? "?"
      const strike = fromStrike(card.strike)
      const live = asset ? fresh.get(sym)?.price ?? strike : strike
      const actualUp = live > strike
      const probUp = Number(card.probUp) / SCALE
      const bot = Math.random() < probUp // bot leans on the implied prob
      const myPay = mine[i] === actualUp ? 1 : 0
      const botPay = bot === actualUp ? 1 : 0
      const myPrem = mine[i] ? probUp : 1 - probUp
      const botPrem = bot ? probUp : 1 - probUp
      // subtraction-less PnL (mirrors KickpactDuel.finalize)
      myScore += myPay + botPrem
      botScore += botPay + myPrem
      return { asset: sym, strike, live, actualUp, mine: mine[i], bot }
    })
    setRows(out)
    setOutcome(myScore > botScore ? "win" : myScore < botScore ? "lose" : "tie")
    setPhase("result")
  }

  const onSwipe = (isUp: boolean) => {
    const next = [...swipes, isUp]
    setSwipes(next)
    if (next.length >= deck.length) settle(next)
    else setIdx((i) => i + 1)
  }

  const card = deck[idx]
  const asset = card ? assetForStrike(card.strike, tickers) : null
  const strikePrice = card ? fromStrike(card.strike) : 0
  const live = asset ? tickers.get(asset.symbol)?.price : undefined
  const delta = live != null && strikePrice > 0 ? ((live - strikePrice) / strikePrice) * 100 : null

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onExit} size={14} />
        <PixelText size={16} tracking={2}>solo · vs bot</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        {phase === "loading" && (
          <Panel style={[st.pad, { alignItems: "center" }]}>
            <ActivityIndicator color={C.eth} />
            <PixelText size={11} upper={false} color={C.white45} style={{ marginTop: 10 }}>dealing live crypto cards…</PixelText>
          </Panel>
        )}

        {phase === "play" && card && (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <PixelText size={10} color={C.white45} tracking={1}>card {idx + 1} / {deck.length}</PixelText>
              <PixelText size={10} color={C.white45} tracking={1}>free · no stake</PixelText>
            </View>
            <Panel style={[st.pad, { alignItems: "center", paddingVertical: 22 }]}>
              <PixelText size={40}>{asset?.symbol ?? "—"}</PixelText>
              <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 2 }}>{asset?.name ?? "market"}</PixelText>
              <PixelText size={11} upper={false} color={C.white60} style={{ marginTop: 16 }}>strike {priceLabel(strikePrice)}</PixelText>
              {live != null && (
                <PixelText size={17} color={delta != null && delta >= 0 ? C.greenLight : "#e08a8a"} style={{ marginTop: 4 }}>
                  live {priceLabel(live)} {delta != null ? `(${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%)` : ""}
                </PixelText>
              )}
              <PixelText size={10} upper={false} color={C.white45} style={{ marginVertical: 16, textAlign: "center", lineHeight: 15 }}>
                will {asset?.symbol ?? "it"} be UP from the strike when it settles?
              </PixelText>
              <View style={st.swipeRow}>
                <PixelButton label="↓ DOWN" color="#b3434f" onPress={() => onSwipe(false)} style={st.swipeBtn} size={15} />
                <PixelButton label="↑ UP" color={C.green} onPress={() => onSwipe(true)} style={st.swipeBtn} size={15} />
              </View>
            </Panel>
          </>
        )}

        {phase === "watching" && (
          <Panel style={[st.pad, { alignItems: "center", paddingVertical: 28 }]}>
            <PixelText size={14} tracking={1}>watching the market…</PixelText>
            <ActivityIndicator color={C.eth} style={{ marginVertical: 14 }} />
            <PixelText size={10} upper={false} color={C.white45} style={{ textAlign: "center" }}>
              settling every card on the real live price.
            </PixelText>
          </Panel>
        )}

        {phase === "result" && (
          <>
            <Panel style={[st.pad, { alignItems: "center", borderColor: outcome === "win" ? C.greenLight : outcome === "lose" ? "#e08a8a" : C.white45 }]}>
              <PixelText size={24} color={outcome === "win" ? C.greenLight : outcome === "lose" ? "#e08a8a" : C.white60}>
                {outcome === "win" ? "YOU WON 🏆" : outcome === "lose" ? "bot won" : "tie"}
              </PixelText>
              <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6 }}>
                you read {rows.filter((r) => r.mine === r.actualUp).length}/{rows.length} moves right
              </PixelText>
            </Panel>
            {rows.map((r, i) => {
              const iWon = r.mine === r.actualUp
              return (
                <Panel key={i} style={st.pad}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View>
                      <PixelText size={13}>{r.asset}</PixelText>
                      <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 2 }}>
                        {priceLabel(r.strike)} → {priceLabel(r.live)} · {r.actualUp ? "UP" : "DOWN"}
                      </PixelText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <PixelText size={11} color={iWon ? C.greenLight : "#e08a8a"}>
                        you {r.mine ? "UP" : "DOWN"} {iWon ? "✓" : "✗"}
                      </PixelText>
                      <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 2 }}>bot {r.bot ? "UP" : "DOWN"}</PixelText>
                    </View>
                  </View>
                </Panel>
              )
            })}
            <PixelButton label="▶ play again" color={C.green} onPress={start} />
            <PixelButton label="back to arena" color={C.importBlue} onPress={onExit} size={12} />
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ───────────────────────── Duel / swipe (on-chain PvP) ─────────────────────────
export function DuelScreen({ duelId, onExit }: { duelId: string; onExit: () => void }) {
  const { signer, address, provider } = useWallet()
  const [duel, setDuel] = useState<DuelState | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map())
  const id = BigInt(duelId)

  // live crypto prices — map each card's strike back to its asset + show the
  // price moving vs the strike in real time.
  useEffect(() => {
    let alive = true
    const tick = () => fetchTickers().then((t) => alive && setTickers(t)).catch(() => {})
    tick()
    const iv = setInterval(tick, 8000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

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

        {duel && duel.deckSize > 0 && !done && (() => {
          const card = duel.cards[myNext]
          const asset = card ? assetForStrike(card.strike, tickers) : null
          const strikePrice = card ? fromStrike(card.strike) : 0
          const live = asset ? tickers.get(asset.symbol)?.price : undefined
          const delta = live != null && strikePrice > 0 ? ((live - strikePrice) / strikePrice) * 100 : null
          return (
            <Panel style={[st.pad, { alignItems: "center" }]}>
              <PixelText size={10} color={C.white45} tracking={1}>card {myNext + 1} of {duel.deckSize}</PixelText>
              <PixelText size={34} style={{ marginTop: 10 }}>{asset?.symbol ?? "—"}</PixelText>
              <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 2 }}>{asset?.name ?? "market"}</PixelText>
              <PixelText size={11} upper={false} color={C.white60} style={{ marginTop: 14 }}>
                strike {priceLabel(strikePrice)}
              </PixelText>
              {live != null && (
                <PixelText size={15} color={delta != null && delta >= 0 ? C.greenLight : "#e08a8a"} style={{ marginTop: 4 }}>
                  live {priceLabel(live)} {delta != null ? `(${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%)` : ""}
                </PixelText>
              )}
              <PixelText size={10} upper={false} color={C.white45} style={{ marginVertical: 14, textAlign: "center", lineHeight: 15 }}>
                will {asset?.symbol ?? "it"} be UP from the strike when the oracle settles?
              </PixelText>
              <View style={st.swipeRow}>
                <PixelButton label="↓ DOWN" color="#b3434f" onPress={() => swipe(false)} style={st.swipeBtn} size={15} />
                <PixelButton label="↑ UP" color={C.green} onPress={() => swipe(true)} style={st.swipeBtn} size={15} />
              </View>
            </Panel>
          )
        })()}

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
  const [roomMode, setRoomMode] = useState<"friend" | "open">("friend")

  const stake = CHAIN.stakeTiers[tier]

  const [openRooms, setOpenRooms] = useState<{ id: bigint; pact: PactState }[]>([])
  const load = useCallback(async () => {
    if (!address) return
    try {
      setIds(await listMyPacts(provider, address))
    } catch {
      /* ignore */
    }
    if (CHAIN.openRoomsLive) {
      try {
        setOpenRooms(await listOpenRooms(provider, address))
      } catch {
        /* ignore */
      }
    }
  }, [provider, address])

  const joinRoom = async (room: { id: bigint; pact: PactState }) => {
    if (!signer) return
    setBusy(true)
    setStatus(`joining room #${room.id}…`)
    try {
      await approvePacts(signer, room.pact.stake)
      await acceptPact(signer, room.id)
      setStatus(`joined room #${room.id} — it's now active`)
      await load()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const onCreate = async () => {
    if (!signer || !address) return
    const open = roomMode === "open"
    if (!open && !isAddr(counterparty)) return setStatus("enter a valid friend address (0x…)")
    if (!terms.trim()) return setStatus("describe the bet")
    setBusy(true)
    setStatus(open ? "approving USD₮ + opening room…" : "approving USD₮ + creating pact…")
    try {
      await approvePacts(signer, stake)
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
      const { pactId } = open
        ? await createOpenPact(signer, { stake, termsText: terms.trim(), deadline })
        : await createPact(signer, { counterparty: counterparty.trim(), stake, termsText: terms.trim(), deadline })
      setStatus(open ? `open room #${pactId} created — anyone can join` : `pact #${pactId} created — share the code so your friend can accept`)
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
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            <PixelButton label="a friend" color={roomMode === "friend" ? C.eth : C.importBlue} size={11} style={{ flex: 1 }} onPress={() => setRoomMode("friend")} />
            <PixelButton
              label="open to anyone"
              color={roomMode === "open" ? C.eth : C.importBlue}
              size={11}
              style={{ flex: 1 }}
              onPress={() => (CHAIN.openRoomsLive ? setRoomMode("open") : setStatus("open rooms go live after the v2 redeploy"))}
            />
          </View>
          {roomMode === "friend" ? (
            <TextInput
              value={counterparty}
              onChangeText={setCounterparty}
              placeholder="friend's wallet address (0x…)"
              placeholderTextColor={C.white35}
              autoCapitalize="none"
              style={st.input}
            />
          ) : (
            <PixelText size={10} upper={false} color={C.white45} style={{ marginVertical: 8, lineHeight: 15 }}>
              open room — anyone can browse + join (no named friend). winner settles from the result.
            </PixelText>
          )}
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

        {/* open rooms — anyone can join */}
        <PixelText size={12} tracking={2} color={C.white45} style={{ marginTop: 8 }}>
          open rooms
        </PixelText>
        {!CHAIN.openRoomsLive ? (
          <PixelText size={10} upper={false} color={C.white35} style={{ lineHeight: 15 }}>
            open rooms (anyone joins — no named friend) go live after the v2
            contract redeploy. the contract + UI are ready.
          </PixelText>
        ) : openRooms.length === 0 ? (
          <PixelText size={11} upper={false} color={C.white35}>
            no open rooms right now — create one above (open to anyone).
          </PixelText>
        ) : (
          openRooms.map((r) => (
            <Panel key={r.id.toString()} style={st.pad}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <PixelText size={11} upper={false}>room #{r.id.toString()}</PixelText>
                  <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 3 }}>
                    {(Number(r.pact.stake) / Number(CHAIN.ONE_USDT)).toFixed(0)} USD₮ each · by {shortAddr(r.pact.proposer)}
                  </PixelText>
                </View>
                <PixelButton label={busy ? "…" : "join"} color={C.green} size={11} onPress={() => joinRoom(r)} style={{ paddingHorizontal: 16 }} />
              </View>
            </Panel>
          ))
        )}

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
  const [scanOpen, setScanOpen] = useState(false)

  const acceptById = async (id: string) => {
    if (!signer || !id) return
    setBusy(true)
    setStatus(`joining pact #${id}…`)
    try {
      const p = await fetchPact(provider, BigInt(id))
      await approvePacts(signer, p.stake)
      await acceptPact(signer, BigInt(id))
      setStatus(`joined pact #${id} — your stake is locked in escrow, winner takes the pot`)
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
      <PixelText size={13} tracking={2}>join a friend's pact</PixelText>
      <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 14 }}>
        scan their QR (or enter the code) to take the other side — your stake locks
        in the same escrow, released to whoever wins.
      </PixelText>
      <PixelButton label={busy ? "…" : "⛶ scan friend's QR"} color={C.green} onPress={() => setScanOpen(true)} style={{ marginTop: 12 }} />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="or enter pact #"
          placeholderTextColor={C.white35}
          keyboardType="number-pad"
          style={[st.input, { flex: 1, marginVertical: 0 }]}
        />
        <PixelButton label={busy ? "…" : "join"} color={C.eth} onPress={() => acceptById(code)} style={{ paddingHorizontal: 18 }} />
      </View>
      <QRScanner
        visible={scanOpen}
        title="scan pact QR"
        hint="point at your friend's pact QR to join their escrow"
        onScan={(v) => {
          setScanOpen(false)
          const id = parseJoinId(v)
          if (id) acceptById(id)
          else setStatus("that QR isn't a Kickpact pact code")
        }}
        onClose={() => setScanOpen(false)}
      />
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
  const [receiveOpen, setReceiveOpen] = useState(false)

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
            <PixelButton label="receive" color={C.eth} size={12} style={{ flex: 1 }} onPress={() => setReceiveOpen(true)} />
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
      <QRModal
        visible={receiveOpen}
        title="receive"
        value={address || ""}
        code={address ? shortAddr(address) : ""}
        hint="scan to send USD₮ or ETH to this self-custodial wallet."
        onClose={() => setReceiveOpen(false)}
      />
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
interface MatchBet { id: string; pact: PactState; label: string; outcome: Outcome | null }

// ───────────────────────── Match Room (P2P watch party · Pears track) ─────────────────────────
function MatchRoomPanel({ gameId, game, onBetsChanged }: { gameId: string; game: Game | null; onBetsChanged?: () => void }) {
  const { signer, address, provider } = useWallet()
  const [joined, setJoined] = useState(false)
  const [peers, setPeers] = useState(0)
  const [msgs, setMsgs] = useState<RoomMsg[]>([])
  const [input, setInput] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [propOutcome, setPropOutcome] = useState<Outcome>("home")
  const [propTier, setPropTier] = useState(0)
  const [busyPact, setBusyPact] = useState<string | null>(null)
  const roomRef = useRef<MatchRoom | null>(null)

  const push = useCallback((m: RoomMsg) => {
    setMsgs((prev) => [...prev.slice(-59), m])
  }, [])

  const join = async () => {
    if (!signer || !address || roomRef.current) return
    setNote("joining the swarm…")
    try {
      const room = new MatchRoom(
        gameId,
        { address, nick: shortAddr(address) },
        signer,
        {
          onReady: () => setNote("live on the DHT — waiting for fans…"),
          onPeers: (n) => setPeers(n),
          onJoined: (nick) => push({ type: "msg", from: "", nick: "", text: `${nick} joined the room`, ts: Date.now(), sig: "", verified: true }),
          onMsg: (m) => push(m),
        },
      )
      roomRef.current = room
      await room.start()
      setJoined(true)
    } catch (e) {
      setNote(errMsg(e))
      roomRef.current = null
    }
  }

  const leave = useCallback(() => {
    roomRef.current?.stop()
    roomRef.current = null
    setJoined(false)
    setPeers(0)
    setMsgs([])
    setNote(null)
  }, [])
  useEffect(() => leave, [leave]) // teardown on unmount

  const send = async () => {
    const text = input.trim()
    if (!text || !roomRef.current) return
    setInput("")
    try {
      push(await roomRef.current.send(text))
    } catch (e) {
      setNote(errMsg(e))
    }
  }

  // Propose a bet to the room: lock your stake in the KickpactPacts escrow as an
  // OPEN pact (keeper auto-settles from the result), then broadcast it P2P.
  const proposeBet = async () => {
    if (!signer || !game || !roomRef.current) return
    const stake = CHAIN.stakeTiers[propTier]
    setBusyPact("propose")
    setNote("locking your stake in escrow…")
    try {
      const terms = predictionTerms(game, propOutcome)
      await approvePacts(signer, stake)
      const { pactId } = await createPact(signer, {
        counterparty: ZERO, // open — anyone in the room can take it
        arbiter: CHAIN.keeperAddress,
        stake,
        termsText: terms,
        deadline: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      })
      await addMatchPact(gameId, pactId)
      const label = terms.split(" · WC#")[0]
      const stakeUsd = Number(stake) / Number(CHAIN.ONE_USDT)
      push(
        await roomRef.current.send(label, {
          type: "pact",
          pactId: pactId.toString(),
          stakeUsd,
          outcome: propOutcome,
        }),
      )
      setNote(`bet #${pactId} escrowed + broadcast to the room`)
      setProposeOpen(false)
      onBetsChanged?.()
    } catch (e) {
      setNote(errMsg(e))
    } finally {
      setBusyPact(null)
    }
  }

  // Take the other side of a bet proposed in the room (join its escrow).
  const joinBet = async (m: RoomMsg) => {
    if (!signer || !m.pactId) return
    setBusyPact(m.pactId)
    setNote(`joining bet #${m.pactId}…`)
    try {
      const p = await fetchPact(provider, BigInt(m.pactId))
      await approvePacts(signer, p.stake)
      await acceptPact(signer, BigInt(m.pactId))
      setNote(`you took the other side of #${m.pactId} — escrow live, auto-settles on the result`)
      onBetsChanged?.()
    } catch (e) {
      setNote(errMsg(e))
    } finally {
      setBusyPact(null)
    }
  }

  if (!joined) {
    return (
      <Panel style={[st.pad, { borderColor: C.gold }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <PixelText size={13} tracking={2}>match room</PixelText>
            <PixelText size={10} upper={false} color={C.white45} style={{ marginTop: 6, lineHeight: 15 }}>
              peer-to-peer watch party over Hyperswarm — fans find each other on
              the DHT, no server. messages signed by your wallet.
            </PixelText>
          </View>
          <PixelText size={26}>🏟️</PixelText>
        </View>
        <PixelButton label="⚡ join the room (p2p)" color={C.gold} textColor="#1b2548" onPress={join} style={{ marginTop: 12 }} />
        {note && <PixelText size={10} upper={false} color={C.white60} style={{ marginTop: 8 }}>{note}</PixelText>}
      </Panel>
    )
  }

  return (
    <Panel style={[st.pad, { borderColor: C.gold }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <PixelText size={13} tracking={2}>match room</PixelText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[st.statusPill, { backgroundColor: peers > 0 ? C.green : undefined }]}>
            <PixelText size={9} color={peers > 0 ? C.white : C.white60} tracking={1}>
              ● {peers} peer{peers === 1 ? "" : "s"}
            </PixelText>
          </View>
          <Pressable onPress={leave} hitSlop={8}>
            <PixelText size={11} color={C.white45}>✕ leave</PixelText>
          </Pressable>
        </View>
      </View>

      <View style={st.roomLog}>
        {msgs.length === 0 && (
          <PixelText size={10} upper={false} color={C.white35} style={{ textAlign: "center", marginVertical: 12 }}>
            {note ?? "you're in — say something to the stands"}
          </PixelText>
        )}
        {msgs.map((m, i) =>
          !m.from ? (
            <PixelText key={i} size={9} upper={false} color={C.white35} style={{ textAlign: "center", marginVertical: 4 }}>
              {m.text}
            </PixelText>
          ) : m.type === "pact" ? (
            <View key={i} style={[st.roomMsg, { borderWidth: 1, borderColor: C.gold, alignSelf: "stretch", maxWidth: "100%" }]}>
              <PixelText size={9} color={C.gold} tracking={1}>
                ⚔ bet proposal · {m.nick} {m.verified ? "✓" : "⚠"}
              </PixelText>
              <PixelText size={11} upper={false} style={{ marginTop: 4, lineHeight: 16 }}>
                {m.text}
              </PixelText>
              <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 3 }}>
                #{m.pactId} · {m.stakeUsd} USD₮ each · winner takes {(m.stakeUsd ?? 0) * 2} · auto-settles
              </PixelText>
              {!m.mine && (
                <PixelButton
                  label={busyPact === m.pactId ? "joining…" : "join bet →"}
                  color={C.green}
                  size={11}
                  onPress={() => joinBet(m)}
                  style={{ marginTop: 8 }}
                />
              )}
            </View>
          ) : (
            <View key={i} style={[st.roomMsg, m.mine ? st.roomMsgMine : null]}>
              <PixelText size={9} color={m.mine ? C.ethLight : C.amber}>
                {m.nick} {m.verified ? "✓" : "⚠ unverified"}
              </PixelText>
              <PixelText size={11} upper={false} style={{ marginTop: 3, lineHeight: 16 }}>
                {m.text}
              </PixelText>
            </View>
          ),
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={`cheer for ${game?.home.shortName ?? "your team"}…`}
          placeholderTextColor={C.white35}
          style={[st.input, { flex: 1, marginVertical: 0 }]}
          onSubmitEditing={send}
        />
        <PixelButton label="send" color={C.eth} onPress={send} style={{ paddingHorizontal: 14 }} />
      </View>

      {game && !game.completed && (
        <View style={{ marginTop: 10 }}>
          {!proposeOpen ? (
            <PixelButton label="⚔ propose a bet to the room" color={C.importBlue} size={11} onPress={() => setProposeOpen(true)} />
          ) : (
            <View style={{ backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.gold, padding: 10 }}>
              <PixelText size={10} color={C.white45} tracking={1}>your pick</PixelText>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                {([["home", game.home.shortName], ["draw", "draw"], ["away", game.away.shortName]] as [Outcome, string][]).map(([o, label]) => (
                  <PixelButton key={o} label={label} color={propOutcome === o ? C.eth : C.importBlue} size={10} style={{ flex: 1 }} onPress={() => setPropOutcome(o)} />
                ))}
              </View>
              <PixelText size={10} color={C.white45} tracking={1} style={{ marginTop: 10 }}>stake (USD₮ each)</PixelText>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                {CHAIN.stakeTiers.map((t, i) => (
                  <PixelButton key={i} label={`${Number(t) / Number(CHAIN.ONE_USDT)}`} color={i === propTier ? C.eth : C.importBlue} size={11} style={{ flex: 1 }} onPress={() => setPropTier(i)} />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <PixelButton label="✕" color={C.importBlue} size={11} onPress={() => setProposeOpen(false)} style={{ paddingHorizontal: 14 }} />
                <PixelButton
                  label={busyPact === "propose" ? "escrowing…" : "lock + broadcast"}
                  color={C.gold}
                  textColor="#1b2548"
                  size={11}
                  style={{ flex: 1 }}
                  onPress={proposeBet}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </Panel>
  )
}

export function GameScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { signer, usdt, provider, address } = useWallet()
  const [game, setGame] = useState<Game | null>(null)
  const [outcome, setOutcome] = useState<"home" | "draw" | "away" | null>(null)
  const [counterparty, setCounterparty] = useState("")
  const [tier, setTier] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [bets, setBets] = useState<MatchBet[]>([])
  const [settling, setSettling] = useState<string | null>(null)

  const loadBets = useCallback(async () => {
    const g = await fetchGame(gameId).catch(() => null)
    const ids = await listMatchPacts(gameId)
    const out: MatchBet[] = []
    for (const id of ids) {
      try {
        const pact = await fetchPact(provider, BigInt(id))
        const terms = (await getTermsText(id)) || ""
        let outcome: Outcome | null = null
        if (g) {
          for (const o of ["home", "draw", "away"] as Outcome[]) {
            if (predictionTerms(g, o) === terms) { outcome = o; break }
          }
        }
        out.push({ id, pact, label: terms.split(" · WC#")[0] || "prediction", outcome })
      } catch {}
    }
    setBets(out)
  }, [gameId, provider])

  useEffect(() => {
    fetchGame(gameId).then(setGame).catch(() => {})
    loadBets()
  }, [gameId, loadBets])

  const stake = CHAIN.stakeTiers[tier]
  const live = game?.state === "in"
  const done = game?.state === "post"

  const onCreate = async () => {
    if (!signer || !game || !outcome) return setStatus("pick an outcome")
    if (!isAddr(counterparty)) return setStatus("enter a friend's wallet address")
    setBusy(true)
    setStatus("approving USD₮ + creating prediction…")
    try {
      const terms = predictionTerms(game, outcome)
      await approvePacts(signer, stake)
      const { pactId } = await createPact(signer, {
        counterparty: counterparty.trim(),
        arbiter: CHAIN.keeperAddress, // keeper auto-settles from the official result
        stake,
        termsText: terms,
        deadline: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      })
      await addMatchPact(gameId, pactId)
      setCreatedId(pactId.toString())
      setStatus(`prediction #${pactId} locked — share the code with your friend`)
      loadBets()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // Auto-settle assist: confirm the official ESPN result on-chain (agree).
  // When both sides confirm the same winner, the contract pays out.
  const settleBet = async (b: MatchBet, winner: string) => {
    if (!signer) return
    setSettling(b.id)
    setStatus("confirming the official result on-chain…")
    try {
      await agreePact(signer, BigInt(b.id), winner)
      setStatus("result confirmed — pays out once both sides agree")
      await loadBets()
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setSettling(null)
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

          {bets.length > 0 && (
            <Panel style={st.pad}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <PixelText size={12} tracking={2}>predictions on this match</PixelText>
                <PixelText size={10} color={C.white45}>{bets.length}</PixelText>
              </View>
              {bets.map((b) => {
                const s = b.pact.status
                const meta =
                  s === PACT_STATUS.PROPOSED ? { t: "OPEN", c: C.amber }
                  : s === PACT_STATUS.ACTIVE ? { t: "LOCKED", c: C.ethLight }
                  : s === PACT_STATUS.RESOLVED ? { t: "SETTLED", c: C.greenLight }
                  : { t: "REFUNDED", c: C.white45 }
                const stk = (Number(b.pact.stake) / Number(CHAIN.ONE_USDT)).toFixed(0)
                const lc = (a: string) => a.toLowerCase()
                const me = address ? lc(address) : ""
                const mine = !!me && [b.pact.proposer, b.pact.counterparty].some((a) => lc(a) === me)
                const result = game ? finalOutcome(game) : null
                const winner = result && b.outcome ? (b.outcome === result ? b.pact.proposer : b.pact.counterparty) : null
                const voted = me === lc(b.pact.proposer) ? b.pact.p0Voted : b.pact.p1Voted
                const canSettle = s === PACT_STATUS.ACTIVE && mine && !!winner && !voted
                const winLabel = result === "draw" ? "Draw" : result === "home" ? game?.home.shortName : game?.away.shortName
                return (
                  <View key={b.id} style={st.betRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <PixelText size={11} upper={false}>{b.label}</PixelText>
                        <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 3 }}>
                          #{b.id} · {stk} USD₮ each{mine ? " · yours" : ""}
                        </PixelText>
                      </View>
                      <View style={st.statusPill}>
                        <PixelText size={9} color={meta.c} tracking={1}>{meta.t}</PixelText>
                      </View>
                    </View>
                    {canSettle && (
                      <PixelButton
                        label={settling === b.id ? "settling…" : `official: ${winLabel} won — settle ✓`}
                        color={C.green}
                        size={10}
                        onPress={() => settleBet(b, winner!)}
                        style={{ marginTop: 8 }}
                      />
                    )}
                    {s === PACT_STATUS.ACTIVE && mine && voted && (
                      <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 6 }}>
                        you confirmed the result — pays out when both sides agree
                      </PixelText>
                    )}
                  </View>
                )
              })}
            </Panel>
          )}

          <MatchRoomPanel gameId={gameId} game={game} onBetsChanged={loadBets} />

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
                    <PixelButton label="▦ show QR to share" color={C.importBlue} onPress={() => setQrOpen(true)} size={12} style={{ marginTop: 8 }} />
                    <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 6 }}>
                      friend scans the QR or accepts in the Pacts tab
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
      {createdId && (
        <QRModal
          visible={qrOpen}
          title={`prediction #${createdId}`}
          value={joinLink("pact", createdId)}
          code={`#${createdId}`}
          hint="your friend scans this (or enters the code in Pacts) to take the other side."
          onClose={() => setQrOpen(false)}
        />
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
  const [chainModal, setChainModal] = useState(false)

  const chain = chainByKey(net.key)
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
        <Pressable onPress={() => setChainModal(true)} style={st.chainBtn}>
          {chain && <ChainLogo chain={chain} size={26} />}
          <View style={{ flex: 1 }}>
            <PixelText size={9} color={C.white45} tracking={1}>network</PixelText>
            <PixelText size={13} style={{ marginTop: 2 }}>{net.name}</PixelText>
          </View>
          <PixelText size={12} color={C.white45}>switch ▾</PixelText>
        </Pressable>

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
      <ChainSwitcherModal
        visible={chainModal}
        chains={SWAP_CHAINS}
        selectedKey={net.key}
        onSelect={(c) => {
          const n = SWAP_NETWORKS.find((x) => x.key === c.key)
          if (n) setNet(n)
        }}
        onClose={() => setChainModal(false)}
      />
    </View>
  )
}

// ───────────────────────── Bridge (USD₮0 / LayerZero) ─────────────────────────
export function BridgeScreen({ onBack }: { onBack: () => void }) {
  const { getSeedPhrase, address } = useWallet()
  const [source, setSource] = useState<BridgeChain>(BRIDGE_CHAINS.find((c) => c.key === "arbitrum")!)
  const [target, setTarget] = useState<BridgeChain>(BRIDGE_CHAINS.find((c) => c.key === "polygon")!)
  const [amount, setAmount] = useState("10")
  const [recipient, setRecipient] = useState("")
  const [fee, setFee] = useState<bigint | null>(null)
  const [busy, setBusy] = useState<"quote" | "bridge" | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [picker, setPicker] = useState<"source" | "target" | null>(null)

  const srcLogo = chainByKey(source.key)
  const tgtLogo = chainByKey(target.key)
  const to = recipient.trim() || address || ""

  const getQuote = async () => {
    setBusy("quote")
    setStatus(null)
    setFee(null)
    try {
      if (source.key === target.key) throw new Error("pick two different chains")
      const amt = ethers.parseUnits(amount || "0", 6)
      if (amt <= 0n) throw new Error("enter an amount")
      const { bridgeFee } = await quoteBridge({ source, target, amount: amt, recipient: to || "0x0000000000000000000000000000000000000001" })
      setFee(bridgeFee)
    } catch (e) {
      setStatus(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const doBridge = async () => {
    setBusy("bridge")
    setStatus(`bridging ${source.name} → ${target.name}…`)
    try {
      const seed = await getSeedPhrase()
      if (!seed) throw new Error("no wallet")
      const provider = new ethers.JsonRpcProvider(source.rpc, source.chainId, { staticNetwork: true })
      const signer = ethers.Wallet.fromPhrase(seed).connect(provider)
      const amt = ethers.parseUnits(amount, 6)
      const { hash } = await bridge({ signer, source, target, amount: amt, recipient: to || (await signer.getAddress()) })
      setStatus(`bridged! ${hash.slice(0, 12)}…`)
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
        <PixelText size={16} tracking={2}>bridge</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        <Pressable onPress={() => setPicker("source")} style={st.chainBtn}>
          {srcLogo && <ChainLogo chain={srcLogo} size={26} />}
          <View style={{ flex: 1 }}>
            <PixelText size={9} color={C.white45} tracking={1}>from</PixelText>
            <PixelText size={13} style={{ marginTop: 2 }}>{source.name}</PixelText>
          </View>
          <PixelText size={12} color={C.white45}>change ▾</PixelText>
        </Pressable>

        <Pressable
          onPress={() => { setSource(target); setTarget(source); setFee(null) }}
          style={{ alignSelf: "center" }}
        >
          <PixelText size={18} color={C.eth}>↓</PixelText>
        </Pressable>

        <Pressable onPress={() => setPicker("target")} style={st.chainBtn}>
          {tgtLogo && <ChainLogo chain={tgtLogo} size={26} />}
          <View style={{ flex: 1 }}>
            <PixelText size={9} color={C.white45} tracking={1}>to</PixelText>
            <PixelText size={13} style={{ marginTop: 2 }}>{target.name}</PixelText>
          </View>
          <PixelText size={12} color={C.white45}>change ▾</PixelText>
        </Pressable>

        <Panel style={st.pad}>
          <PixelText size={10} color={C.white45} tracking={1}>amount (USD₮0)</PixelText>
          <TextInput
            value={amount}
            onChangeText={(t) => { setAmount(t); setFee(null) }}
            keyboardType="decimal-pad"
            style={[st.input, { marginBottom: 0 }]}
            placeholder="0.0"
            placeholderTextColor={C.white35}
          />
        </Panel>

        <Panel style={st.pad}>
          <PixelText size={10} color={C.white45} tracking={1}>recipient</PixelText>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            autoCapitalize="none"
            style={[st.input, { marginBottom: 0 }]}
            placeholder="default: your wallet"
            placeholderTextColor={C.white35}
          />
        </Panel>

        <PixelButton label={busy === "quote" ? "quoting…" : "get quote"} color={C.eth} onPress={getQuote} />
        {fee != null && (
          <Panel style={st.pad}>
            <PixelText size={10} color={C.white45} tracking={1}>layerzero fee</PixelText>
            <PixelText size={20} style={{ marginTop: 4 }}>
              {Number(ethers.formatEther(fee)).toFixed(5)} {nativeSym(source.key)}
            </PixelText>
            <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 4 }}>
              paid in {source.name} gas · arrives as USD₮0 on {target.name}
            </PixelText>
          </Panel>
        )}
        {fee != null && (
          <PixelButton label={busy === "bridge" ? "bridging…" : `bridge to ${target.name}`} color={C.green} onPress={doBridge} />
        )}

        <Panel style={st.pad}>
          <PixelText size={9} upper={false} color={C.white45} style={{ lineHeight: 14 }}>
            USD₮0 omnichain bridge via LayerZero (same protocol as WDK's bridge
            module). needs USD₮0 + native gas on {source.name}. this rail moves
            funds to Polygon for the Polymarket tier.
          </PixelText>
        </Panel>

        {status && (
          <Panel style={st.pad}>
            <PixelText size={11} upper={false} color={C.white70}>{status}</PixelText>
          </Panel>
        )}
      </ScrollView>

      <ChainSwitcherModal
        visible={picker !== null}
        chains={BRIDGE_CHAIN_LOGOS}
        selectedKey={picker === "source" ? source.key : target.key}
        onSelect={(c) => {
          const bc = BRIDGE_CHAINS.find((x) => x.key === c.key)
          if (!bc) return
          if (picker === "source") setSource(bc)
          else setTarget(bc)
          setFee(null)
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  )
}

// ───────────────────────── Polymarket (mainnet CLOB) ─────────────────────────
function MarketCard({ m, onTrade }: { m: PolyMarket; onTrade: () => void }) {
  const yesIdx = m.outcomes.findIndex((o) => o.toLowerCase() === "yes")
  const isYesNo = m.outcomes.length === 2 && yesIdx >= 0
  const noIdx = yesIdx === 0 ? 1 : 0
  const topIdx = m.prices.indexOf(Math.max(...m.prices))
  return (
    <Pressable onPress={onTrade}>
      <Panel style={st.pad}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {m.image ? (
            <Image source={{ uri: m.image }} style={{ width: 38, height: 38, borderRadius: 8 }} />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: C.panel }} />
          )}
          <PixelText size={11} upper={false} style={{ flex: 1, lineHeight: 16 }}>{m.question}</PixelText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          {isYesNo ? (
            <>
              <View style={[st.mktPill, { backgroundColor: "rgba(59,163,75,0.18)" }]}>
                <PixelText size={11} color={C.greenLight}>yes {toCents(m.prices[yesIdx])}</PixelText>
              </View>
              <View style={[st.mktPill, { backgroundColor: "rgba(192,57,43,0.18)" }]}>
                <PixelText size={11} color="#ff8a80">no {toCents(m.prices[noIdx])}</PixelText>
              </View>
            </>
          ) : (
            <View style={[st.mktPill, { backgroundColor: "rgba(98,126,234,0.18)" }]}>
              <PixelText size={11} color={C.ethLight}>{m.outcomes[topIdx]} {toCents(m.prices[topIdx])}</PixelText>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <PixelText size={9} upper={false} color={C.white45}>{fmtVolume(m.volume)} vol</PixelText>
        </View>
        <View style={{ marginTop: 10, alignItems: "flex-end" }}>
          <PixelText size={9} upper color={C.eth} tracking={1}>trade on polymarket ↗</PixelText>
        </View>
      </Panel>
    </Pressable>
  )
}

export function MarketsScreen({ onBack }: { onBack: () => void }) {
  const [markets, setMarkets] = useState<PolyMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [trading, setTrading] = useState<PolyMarket | null>(null)

  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetchMarkets({ limit: 40 })
      .then(setMarkets)
      .catch((e) => setErr(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const shown = q ? markets.filter((m) => m.question.toLowerCase().includes(q.toLowerCase())) : markets

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={16} tracking={2}>polymarket</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        <Panel style={st.pad}>
          <PixelText size={9} upper={false} color={C.white45} style={{ lineHeight: 14 }}>
            real-money prediction markets · live CLOB odds · Polygon mainnet. the
            real-stakes version of your Pacts — same World Cup, real order book.
          </PixelText>
        </Panel>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="search markets (e.g. world cup, USA…)"
          placeholderTextColor={C.white35}
          autoCapitalize="none"
          style={[st.input, { marginBottom: 0 }]}
        />
        {loading && <ActivityIndicator color={C.eth} style={{ marginTop: 24 }} />}
        {!loading && err && (
          <View style={{ alignItems: "center", marginTop: 24, gap: 10 }}>
            <PixelText size={11} upper={false} color={C.white35}>couldn't load markets — {err}</PixelText>
            <PixelButton label="retry" color={C.eth} size={12} onPress={load} />
          </View>
        )}
        {!loading && !err && shown.length === 0 && (
          <PixelText size={11} upper={false} color={C.white35} style={{ textAlign: "center", marginTop: 24 }}>
            no markets found.
          </PixelText>
        )}
        {shown.map((m) => (
          <MarketCard key={m.id} m={m} onTrade={() => setTrading(m)} />
        ))}
      </ScrollView>
      {trading && <TradeSheet m={trading} onClose={() => setTrading(null)} />}
    </View>
  )
}

/** In-app CLOB trading: sign an EIP-712 FOK market buy with the WDK wallet and
 * post it straight to Polymarket's order book. Real money — funded via the
 * Swap/Bridge rails (USDC.e + a little POL on Polygon). */
function TradeSheet({ m, onClose }: { m: PolyMarket; onClose: () => void }) {
  const { signer } = useWallet()
  const [outcome, setOutcome] = useState(0)
  const [amount, setAmount] = useState("1")
  const [ask, setAsk] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [needsApprove, setNeedsApprove] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const tokenId = m.tokenIds[outcome]
  useEffect(() => {
    setAsk(null)
    setNote(null)
    setDone(null)
    if (!tokenId) return
    clob
      .bestPrice(tokenId, "BUY")
      .then(setAsk)
      .catch(() => setAsk(m.prices[outcome] ?? null))
  }, [tokenId])

  const usdc = Math.max(0, Number(amount) || 0)
  const px = ask ?? m.prices[outcome] ?? 0
  const shares = px > 0 ? usdc / px : 0

  const buy = async () => {
    if (!signer || !tokenId || usdc <= 0) return
    setBusy("checking funds on polygon…")
    setNote(null)
    setDone(null)
    try {
      const gap = await clob.fundingGap(await signer.getAddress(), usdc, m.negRisk)
      if (gap === "APPROVE_REQUIRED") {
        setNeedsApprove(true)
        setNote("one-time approval needed: let the exchange pull your USDC.e")
        return
      }
      if (gap) {
        setNote(gap)
        return
      }
      setBusy("signing order with your wallet…")
      const creds = await clob.deriveApiCreds(signer)
      const built = await clob.buildMarketBuy(signer, { tokenId, usdcAmount: usdc, negRisk: m.negRisk })
      setBusy(`posting FOK buy @ ${toCents(built.price)}…`)
      const res = await clob.postOrder(signer, creds, built)
      if (res.ok) {
        setDone(`filled — ~${built.tokens.toFixed(2)} shares @ ${toCents(built.price)}`)
      } else {
        setNote(String(res.body?.error || `CLOB rejected (HTTP ${res.status})`))
      }
    } catch (e: any) {
      setNote(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  const approve = async () => {
    if (!signer) return
    setBusy("approving USDC.e (one-time)…")
    setNote(null)
    try {
      const polygonSigner = signer.connect(clob.polygonProvider())
      await clob.approveUsdce(polygonSigner, m.negRisk)
      setNeedsApprove(false)
      setNote("approved — tap buy again")
    } catch (e: any) {
      setNote(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.modalOverlay} onPress={onClose}>
        <Pressable style={st.modalSheet} onPress={() => {}}>
          <PixelText size={12} style={{ lineHeight: 18 }} upper={false}>{m.question}</PixelText>
          <PixelText size={8} color={C.white45} style={{ marginTop: 4 }}>
            real money · polymarket clob · polygon mainnet{m.negRisk ? " · neg-risk" : ""}
          </PixelText>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {m.outcomes.map((o, i) => (
              <Pressable
                key={i}
                onPress={() => setOutcome(i)}
                style={[st.mktPill, { backgroundColor: i === outcome ? C.eth : C.panel, flex: 1, alignItems: "center" }]}
              >
                <PixelText size={11}>{o} {toCents(m.prices[i] ?? 0)}</PixelText>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="USDC amount"
            placeholderTextColor={C.white35}
            style={st.input}
          />
          <PixelText size={9} upper={false} color={C.white45}>
            {ask == null ? "fetching live ask…" : `best ask ${toCents(px)} — pay $${usdc.toFixed(2)} for ~${shares.toFixed(2)} shares`}
          </PixelText>

          {busy && (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 }}>
              <ActivityIndicator color={C.eth} />
              <PixelText size={9} upper={false} color={C.white60}>{busy}</PixelText>
            </View>
          )}
          {note && !busy && (
            <PixelText size={9} upper={false} color={C.amber} style={{ marginTop: 12, lineHeight: 14 }}>{note}</PixelText>
          )}
          {done && (
            <PixelText size={11} upper={false} color={C.greenLight} style={{ marginTop: 12 }}>✓ {done}</PixelText>
          )}

          <View style={{ marginTop: 14, gap: 10 }}>
            {needsApprove && <PixelButton label="approve usdc.e (one-time)" color={C.gold} textColor="#241c06" onPress={approve} />}
            <PixelButton label={busy ? "working…" : `buy ${m.outcomes[outcome] ?? ""}`} color={C.green} onPress={buy} />
            <Pressable onPress={() => Linking.openURL(marketUrl(m))}>
              <PixelText size={9} color={C.eth} style={{ textAlign: "center" }}>open on polymarket ↗</PixelText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const st = StyleSheet.create({
  chainBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.panelBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  roomLog: { backgroundColor: C.frameDeep, borderRadius: 10, borderWidth: 1, borderColor: C.panelBorder, padding: 10, marginVertical: 12, minHeight: 90, maxHeight: 260, gap: 6 },
  roomMsg: { backgroundColor: C.panel, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start", maxWidth: "88%" },
  roomMsgMine: { backgroundColor: C.importBlue, alignSelf: "flex-end" },
  modeRow: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: C.panel, borderRadius: 999, padding: 3, gap: 3 },
  modePill: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 999 },
  modePillActive: { backgroundColor: C.eth },
  balCard: { padding: 16, backgroundColor: C.frameDeep, borderColor: C.highlight },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, alignItems: "center", gap: 6, backgroundColor: C.panel, borderWidth: 1, borderColor: C.panelBorder, borderRadius: 12, paddingVertical: 12 },
  actionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.importBlue, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.frame, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderTopColor: C.highlight, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  betRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.white15 },
  mktPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  polyBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(98,126,234,0.12)", borderWidth: 1, borderColor: C.eth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  hero: { width: 240, height: 150, marginBottom: 4 },
  sub: { textAlign: "center", marginTop: 6, marginBottom: 20 },
  full: { alignSelf: "stretch" },
  errBox: { backgroundColor: "rgba(255,0,0,0.12)", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, alignSelf: "stretch" },
  warn: { textAlign: "center", marginBottom: 12, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, justifyContent: "center" },
  word: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, width: "30%" },
  input: { alignSelf: "stretch", borderWidth: 1, borderColor: C.white15, borderRadius: 8, color: C.white, padding: 12, marginVertical: 10, fontFamily: "KickpactPixel", fontSize: 13 },
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
