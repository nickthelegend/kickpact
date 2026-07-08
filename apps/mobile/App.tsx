import { useState } from "react"
import { ActivityIndicator, Image, Pressable, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { useFonts } from "expo-font"

import { C } from "./src/theme"
import { PixelText } from "./src/ui"
import { WalletProvider, useWallet } from "./src/wallet"
import {
  BridgeScreen,
  DuelScreen,
  GameScreen,
  HomeScreen,
  MarketsScreen,
  PactsScreen,
  PracticeScreen,
  ProfileScreen,
  PvpScreen,
  RankScreen,
  SignInScreen,
  SwapScreen,
} from "./src/screens"

/**
 * Kickpact mobile — Expo / React Native. Self-custodial WDK wallet (seed in the
 * device keychain) + real on-chain features on Sepolia:
 *   • PvP prediction duels (KickpactDuel)
 *   • Pacts — P2P friend bets in escrow (KickpactPacts)
 * Premium pixel UI rebuilt natively (RN StyleSheet).
 */

type Tab = "home" | "pacts" | "pvp" | "rank" | "profile"

const TABS: { key: Tab; icon: number; label: string }[] = [
  { key: "home", icon: require("./assets/icons/main_menu.png"), label: "home" },
  { key: "pacts", icon: require("./assets/icons/link.png"), label: "pacts" },
  { key: "pvp", icon: require("./assets/icons/swords.png"), label: "pvp" },
  { key: "rank", icon: require("./assets/icons/star.png"), label: "rank" },
  { key: "profile", icon: require("./assets/icons/portrait.png"), label: "profile" },
]

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.4)",
        backgroundColor: C.frame,
        paddingVertical: 8,
      }}
    >
      {TABS.map((t) => {
        const active = t.key === tab
        return (
          <Pressable key={t.key} onPress={() => onTab(t.key)} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <View
              style={
                t.key === "pvp"
                  ? {
                      width: 60,
                      height: 60,
                      marginTop: -10,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: C.gold,
                      backgroundColor: C.frameDark,
                      opacity: active ? 1 : 0.85,
                    }
                  : { opacity: active ? 1 : 0.5 }
              }
            >
              <Image source={t.icon} style={{ width: 38, height: 38 }} resizeMode="contain" />
            </View>
            {t.key !== "pvp" && (
              <PixelText size={9} color={active ? C.white : C.white45} tracking={1}>
                {t.label}
              </PixelText>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

function Game() {
  const { status } = useWallet()
  const [tab, setTab] = useState<Tab>("home")
  const [duelId, setDuelId] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [marketsOpen, setMarketsOpen] = useState(false)
  const [soloOpen, setSoloOpen] = useState(false)

  if (status === "INITIALIZING") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  if (status === "NO_WALLET" || status === "BACKUP_PENDING") return <SignInScreen />

  // Full-screen flows (no tab bar).
  if (duelId) return <DuelScreen duelId={duelId} onExit={() => setDuelId(null)} />
  if (gameId) return <GameScreen gameId={gameId} onBack={() => setGameId(null)} />
  if (swapOpen) return <SwapScreen onBack={() => setSwapOpen(false)} />
  if (bridgeOpen) return <BridgeScreen onBack={() => setBridgeOpen(false)} />
  if (marketsOpen) return <MarketsScreen onBack={() => setMarketsOpen(false)} />
  if (soloOpen) return <PracticeScreen onExit={() => setSoloOpen(false)} />

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "home" && (
          <HomeScreen
            onProfile={() => setTab("profile")}
            onGame={(id) => setGameId(id)}
            onSwap={() => setSwapOpen(true)}
            onBridge={() => setBridgeOpen(true)}
            onMarkets={() => setMarketsOpen(true)}
          />
        )}
        {tab === "pacts" && <PactsScreen />}
        {tab === "pvp" && (
          <PvpScreen
            onBack={() => setTab("home")}
            onEnterDuel={(id) => setDuelId(id)}
            onSolo={() => setSoloOpen(true)}
          />
        )}
        {tab === "rank" && <RankScreen />}
        {tab === "profile" && <ProfileScreen onSwap={() => setSwapOpen(true)} />}
      </View>
      <BottomNav tab={tab} onTab={setTab} />
    </View>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    KickpactPixel: require("./assets/fonts/pixel.ttf"),
    KickpactDisplay: require("./assets/fonts/landing.ttf"),
  })

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.frame }} />

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.frame }} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <WalletProvider>
          <Game />
        </WalletProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
