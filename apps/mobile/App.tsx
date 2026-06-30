import { useState } from "react"
import { ActivityIndicator, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { useFonts } from "expo-font"

import { C } from "./src/theme"
import { WalletProvider, useWallet } from "./src/wallet"
import { DuelScreen, HomeScreen, PvpScreen, SignInScreen } from "./src/screens"

/**
 * Flicky mobile — Expo / React Native. Self-custodial wallet (real BIP-39 seed
 * in the device keystore) + real on-chain PvP duels on the deployed Sepolia
 * FlickyDuel contract. Premium pixel UI rebuilt natively (RN StyleSheet).
 */

type Screen = { name: "home" } | { name: "pvp" } | { name: "duel"; id: string }

function Game() {
  const { status } = useWallet()
  const [screen, setScreen] = useState<Screen>({ name: "home" })

  if (status === "INITIALIZING") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  if (status === "NO_WALLET" || status === "BACKUP_PENDING") return <SignInScreen />

  switch (screen.name) {
    case "pvp":
      return (
        <PvpScreen
          onBack={() => setScreen({ name: "home" })}
          onEnterDuel={(id) => setScreen({ name: "duel", id })}
        />
      )
    case "duel":
      return <DuelScreen duelId={screen.id} onExit={() => setScreen({ name: "home" })} />
    default:
      return <HomeScreen onPlay={() => setScreen({ name: "pvp" })} />
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    FlickyPixel: require("./assets/fonts/pixel.ttf"),
    FlickyDisplay: require("./assets/fonts/landing.ttf"),
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
