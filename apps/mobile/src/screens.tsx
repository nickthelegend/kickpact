/**
 * Flicky mobile screens (RN StyleSheet). Real on-chain flow:
 *  - SignIn  : create / import a self-custodial wallet (real BIP-39 seed)
 *  - Home    : live USD₮ + ETH balances, USD₮ faucet, enter PvP
 *  - Pvp     : create a duel (stake escrow) or join one by code — real txs
 *  - Duel    : reveal deck (creator) + swipe YES/NO on each card — real txs
 */
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, TextInput, View } from "react-native"

import { C } from "./theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./ui"
import { useWallet } from "./wallet"
import { CHAIN, DUEL_STATUS, shortAddr } from "./chain"
import {
  approveUsdt,
  createDuel,
  deckCommitment,
  demoDeck,
  fetchDuel,
  joinDuel,
  mintUsdt,
  randomSalt,
  recordSwipe,
  type Card,
  type DuelState,
} from "./duel"
import { loadSecret, saveSecret } from "./storage"

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
export function HomeScreen({ onPlay }: { onPlay: () => void }) {
  const { address, usdt, eth, signer, refresh } = useWallet()
  const [minting, setMinting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const faucet = useCallback(async () => {
    if (!signer || !address) return
    setMinting(true)
    setMsg(null)
    try {
      await mintUsdt(signer, address, 100n * CHAIN.ONE_USDT)
      await refresh()
      setMsg("minted 100 test USD₮")
    } catch (e) {
      setMsg(e instanceof Error ? e.message.slice(0, 80) : "mint failed")
    } finally {
      setMinting(false)
    }
  }, [signer, address, refresh])

  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <View style={st.headerLeft}>
          <View style={st.avatar} />
          <BalanceChip icon={USDT_ICON} amount={usdt.toFixed(2)} onPressAdd={faucet} />
          <View style={st.ethChip}>
            <PixelText size={11} color={C.white60} upper={false}>{eth.toFixed(4)} ETH</PixelText>
          </View>
        </View>
        <View style={st.gear}>
          <Image source={require("../assets/icons/gear.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />
        </View>
      </View>

      <PixelText size={30} tracking={6} style={st.title}>home</PixelText>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll}>
        <Panel style={st.pad}>
          <View style={st.row}>
            <View style={st.avatar} />
            <View>
              <PixelText size={14} tracking={1}>{address ? shortAddr(address) : "…"}</PixelText>
              <View style={st.rankRow}>
                <View style={st.badge}><PixelText size={10} color={C.white70}>unranked</PixelText></View>
              </View>
            </View>
          </View>
          <View style={st.stats}>
            {["wins", "losses", "streak"].map((s) => (
              <View key={s} style={st.stat}>
                <PixelText size={10} color={C.white45} tracking={2}>{s}</PixelText>
                <PixelText size={14} color={C.white70} style={{ marginTop: 4 }}>—</PixelText>
              </View>
            ))}
          </View>
        </Panel>

        {msg && (
          <Panel style={[st.pad, { borderColor: C.eth }]}>
            <PixelText size={11} upper={false} color={C.white70}>{msg}</PixelText>
          </Panel>
        )}

        <Panel style={st.pad}>
          <PixelText size={13} tracking={2}>your match</PixelText>
          <View style={st.matchBody}>
            <Image source={require("../assets/icons/swords.png")} style={{ width: 48, height: 48, marginBottom: 8 }} resizeMode="contain" />
            <PixelText size={15} tracking={2}>no active duel</PixelText>
            <PixelText size={12} upper={false} color={C.white45} style={{ textAlign: "center", marginTop: 6, lineHeight: 18 }}>
              stake USD₮ and face another player{"\n"}who reads the market better
            </PixelText>
            <PixelButton label="find a duel" color={C.green} onPress={onPlay} style={{ marginTop: 16, paddingHorizontal: 32 }} />
          </View>
        </Panel>

        <Panel style={st.pad}>
          <PixelText size={12} upper={false} color={C.white45} style={{ lineHeight: 18 }}>
            need test funds? tap the + on your USD₮ balance to mint 100 test USD₮.
            you also need a little Sepolia ETH for gas (faucet).
          </PixelText>
          <PixelButton label={minting ? "minting…" : "+ mint 100 test USD₮"} color={C.importBlue} onPress={faucet} style={{ marginTop: 12 }} size={12} />
        </Panel>
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

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topbar}>
        <PixelButton label="←" color={C.importBlue} onPress={onBack} size={14} />
        <PixelText size={18} tracking={3}>pvp duel</PixelText>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
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

  const reveal = async () => {
    if (!signer) return
    setBusy(true)
    setStatus("revealing deck…")
    try {
      const raw = await loadSecret(`deck.${duelId}`)
      if (!raw) throw new Error("deck not found on this device (creator only)")
      const { cards, salt } = JSON.parse(raw) as { cards: [string, string][]; salt: string }
      const c = new (await import("ethers")).ethers.Contract(CHAIN.duelAddress, (await import("./chain")).FLICKY_DUEL_ABI as unknown as string[], signer)
      const tx = await c.revealDeck(id, cards.map(([s, p]) => [BigInt(s), BigInt(p)]), salt)
      await tx.wait()
      setStatus("deck revealed — start swiping")
      await load()
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 90) : "reveal failed")
    } finally {
      setBusy(false)
    }
  }

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

        {done && (
          <Panel style={[st.pad, { alignItems: "center" }]}>
            <PixelText size={14} tracking={1}>all cards swiped</PixelText>
            <PixelText size={11} upper={false} color={C.white45} style={{ textAlign: "center", marginTop: 8, lineHeight: 18 }}>
              waiting for the oracle/keeper to settle each card{"\n"}then the pot pays the higher PnL.
            </PixelText>
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
