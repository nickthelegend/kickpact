import { useState } from "react"
import { Image, ScrollView, StyleSheet, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { useFonts } from "expo-font"

import { C } from "./src/theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./src/ui"

/**
 * Flicky mobile (Expo / React Native) — premium pixel UI rebuilt with RN
 * StyleSheet (matches the web app exactly). Next: wire the WDK self-custodial
 * wallet (@tetherto/wdk-react-native-core) so createWallet → READY drives the
 * signed-in state in place of the local useState.
 */

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View style={s.signinWrap}>
      <Image
        source={require("./assets/game/sign-in-hero.png")}
        style={s.hero}
        resizeMode="contain"
      />
      <PixelText size={30} tracking={3}>
        ready to duel?
      </PixelText>
      <PixelText
        size={13}
        upper={false}
        color={C.white60}
        tracking={0.3}
        style={s.signinSub}
      >
        a self-custodial wallet, created on your device. powered by WDK.
      </PixelText>

      <PixelButton
        label="⟠   create ethereum wallet"
        color={C.eth}
        onPress={onSignIn}
        style={s.fullBtn}
        size={15}
      />
      <View style={s.divider}>
        <View style={s.dividerLine} />
        <PixelText size={11} color={C.white35} tracking={3}>
          or
        </PixelText>
        <View style={s.dividerLine} />
      </View>
      <PixelButton
        label="import recovery phrase"
        color={C.importBlue}
        onPress={onSignIn}
        style={s.fullBtn}
        size={14}
      />
    </View>
  )
}

function StatCell({ label }: { label: string }) {
  return (
    <View style={s.statCell}>
      <PixelText size={10} color={C.white45} tracking={2}>
        {label}
      </PixelText>
      <PixelText size={14} color={C.white70} style={{ marginTop: 4 }}>
        —
      </PixelText>
    </View>
  )
}

const NAV = [
  { icon: require("./assets/icons/main_menu.png"), featured: false },
  { icon: require("./assets/icons/star.png"), featured: false },
  { icon: require("./assets/icons/swords.png"), featured: true },
  { icon: require("./assets/icons/coins.png"), featured: false },
  { icon: require("./assets/icons/inventory.png"), featured: false },
]

function HomeScreen({ address }: { address: string }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return (
    <View style={{ flex: 1 }}>
      {/* header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.avatar} />
          <BalanceChip
            icon={require("./assets/tokens/usdc-icon.png")}
            amount="0.00"
          />
          <BalanceChip
            icon={require("./assets/tokens/manager-usdc.png")}
            amount="0.00"
          />
        </View>
        <View style={s.gear}>
          <Image
            source={require("./assets/icons/gear.png")}
            style={{ width: 22, height: 22 }}
            resizeMode="contain"
          />
        </View>
      </View>

      <PixelText size={30} tracking={6} style={s.homeTitle}>
        home
      </PixelText>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
        {/* player card */}
        <Panel style={s.cardPad}>
          <View style={s.rowGap}>
            <View style={s.avatar} />
            <View>
              <PixelText size={15} tracking={1}>
                {short}
              </PixelText>
              <View style={s.rankRow}>
                <View style={s.rankBadge}>
                  <PixelText size={10} color={C.white70} tracking={1}>
                    unranked
                  </PixelText>
                </View>
                <PixelText size={13} color={C.white45}>
                  —
                </PixelText>
              </View>
            </View>
          </View>
          <View style={s.statsRow}>
            <StatCell label="wins" />
            <StatCell label="losses" />
            <StatCell label="streak" />
          </View>
        </Panel>

        {/* your match */}
        <Panel style={s.cardPad}>
          <View style={s.matchHead}>
            <PixelText size={13} tracking={2}>
              your match
            </PixelText>
            <View style={s.idleChip}>
              <PixelText size={10} color={C.white45} tracking={1}>
                idle
              </PixelText>
            </View>
          </View>
          <View style={s.matchBody}>
            <Image
              source={require("./assets/icons/swords.png")}
              style={{ width: 48, height: 48, marginBottom: 8 }}
              resizeMode="contain"
            />
            <PixelText size={15} tracking={2}>
              no active duel
            </PixelText>
            <PixelText
              size={13}
              upper={false}
              color={C.white45}
              style={{ textAlign: "center", marginTop: 6, lineHeight: 20 }}
            >
              your live pvp match will{"\n"}show up here once you start one
            </PixelText>
            <PixelButton
              label="find a duel"
              color={C.importBlue}
              style={{ marginTop: 16, paddingHorizontal: 32 }}
            />
          </View>
        </Panel>
      </ScrollView>

      {/* bottom nav */}
      <View style={s.nav}>
        {NAV.map((t, i) => (
          <View key={i} style={s.navItem}>
            <View style={t.featured ? s.navFeatured : undefined}>
              <Image
                source={t.icon}
                style={{ width: 44, height: 44 }}
                resizeMode="contain"
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [fontsLoaded] = useFonts({
    FlickyPixel: require("./assets/fonts/pixel.ttf"),
    FlickyDisplay: require("./assets/fonts/landing.ttf"),
  })

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.frame }} />

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        {signedIn ? (
          <HomeScreen address="0xD2530000000000000000000000000000000004427" />
        ) : (
          <SignInScreen onSignIn={() => setSignedIn(true)} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.frame },

  // sign-in
  signinWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  hero: { width: 280, height: 168, marginBottom: 4 },
  signinSub: { textAlign: "center", marginTop: 8, marginBottom: 28, lineHeight: 20 },
  fullBtn: { alignSelf: "stretch" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    marginVertical: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.white15 },

  // header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 10, backgroundColor: C.ethLight },
  gear: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: C.green,
  },
  homeTitle: { textAlign: "center", marginVertical: 12 },
  scroll: { gap: 16, paddingHorizontal: 12, paddingBottom: 24 },

  cardPad: { padding: 16 },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 12 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rankBadge: {
    borderWidth: 1,
    borderColor: C.white35,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statsRow: { flexDirection: "row", marginTop: 16 },
  statCell: { flex: 1, alignItems: "center" },

  matchHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  idleChip: {
    backgroundColor: "rgba(0,0,0,0.40)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  matchBody: { alignItems: "center", paddingVertical: 32 },

  nav: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.40)",
    backgroundColor: C.frame,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  navFeatured: {
    width: 64,
    height: 64,
    transform: [{ translateY: -12 }],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.gold,
    backgroundColor: C.frameDark,
  },
})
