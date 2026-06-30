/**
 * EVM chain registry + a reusable "switch chain" bottom-sheet modal with chain
 * logos. Used by the Swap router (and anywhere else that picks a network).
 */
import { useState } from "react"
import { Image, Modal, Pressable, ScrollView, View } from "react-native"
import { C } from "./theme"
import { PixelText } from "./ui"

export interface EvmChain {
  key: string
  chainId: number
  name: string
  short: string
  color: string
  logo: string
  rpc: string
  explorer: string
  testnet?: boolean
}

const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains"

/** Popular EVM chains (mainnet) + Sepolia testnet. */
export const CHAINS: EvmChain[] = [
  { key: "ethereum", chainId: 1, name: "Ethereum", short: "ETH", color: "#627eea", logo: `${TW}/ethereum/info/logo.png`, rpc: "https://eth.drpc.org", explorer: "https://etherscan.io" },
  { key: "polygon", chainId: 137, name: "Polygon", short: "POL", color: "#8247e5", logo: `${TW}/polygon/info/logo.png`, rpc: "https://polygon-rpc.com", explorer: "https://polygonscan.com" },
  { key: "arbitrum", chainId: 42161, name: "Arbitrum", short: "ARB", color: "#28a0f0", logo: `${TW}/arbitrum/info/logo.png`, rpc: "https://arbitrum.drpc.org", explorer: "https://arbiscan.io" },
  { key: "optimism", chainId: 10, name: "Optimism", short: "OP", color: "#ff0420", logo: `${TW}/optimism/info/logo.png`, rpc: "https://optimism.drpc.org", explorer: "https://optimistic.etherscan.io" },
  { key: "base", chainId: 8453, name: "Base", short: "BASE", color: "#0052ff", logo: `${TW}/base/info/logo.png`, rpc: "https://base.drpc.org", explorer: "https://basescan.org" },
  { key: "bnb", chainId: 56, name: "BNB Chain", short: "BNB", color: "#f0b90b", logo: `${TW}/smartchain/info/logo.png`, rpc: "https://bsc-dataseed.binance.org", explorer: "https://bscscan.com" },
  { key: "avalanche", chainId: 43114, name: "Avalanche", short: "AVAX", color: "#e84142", logo: `${TW}/avalanchec/info/logo.png`, rpc: "https://avalanche.drpc.org", explorer: "https://snowtrace.io" },
  { key: "sepolia", chainId: 11155111, name: "Sepolia", short: "SEP", color: "#627eea", logo: `${TW}/ethereum/info/logo.png`, rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", testnet: true },
]

export const chainByKey = (key: string) => CHAINS.find((c) => c.key === key)
export const chainById = (id: number) => CHAINS.find((c) => c.chainId === id)

/** A round chain badge — remote logo with a colored-circle fallback. */
export function ChainLogo({ chain, size = 28 }: { chain: EvmChain; size?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: chain.color,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {failed ? (
        <PixelText size={Math.round(size * 0.3)} color={C.white}>
          {chain.short.slice(0, 3)}
        </PixelText>
      ) : (
        <Image
          source={{ uri: chain.logo }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  )
}

/** Bottom-sheet modal listing chains; tap to pick. */
export function ChainSwitcherModal({
  visible,
  chains,
  selectedKey,
  onSelect,
  onClose,
}: {
  visible: boolean
  chains: EvmChain[]
  selectedKey?: string
  onSelect: (c: EvmChain) => void
  onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.frame,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderTopWidth: 1,
            borderTopColor: C.highlight,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 28,
            maxHeight: "75%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <PixelText size={14} tracking={2}>switch chain</PixelText>
            <Pressable onPress={onClose} hitSlop={10}>
              <PixelText size={16} color={C.white45}>✕</PixelText>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {chains.map((c) => {
              const active = c.key === selectedKey
              return (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    onSelect(c)
                    onClose()
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    marginBottom: 8,
                    borderRadius: 12,
                    backgroundColor: active ? C.importBlue : C.panel,
                    borderWidth: 1,
                    borderColor: active ? C.importBlueLight : C.panelBorder,
                  }}
                >
                  <ChainLogo chain={c} size={32} />
                  <View style={{ flex: 1 }}>
                    <PixelText size={12}>{c.name}</PixelText>
                    <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 2 }}>
                      chain {c.chainId}
                      {c.testnet ? " · testnet" : ""}
                    </PixelText>
                  </View>
                  {active && <PixelText size={14} color={C.greenLight}>✓</PixelText>}
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
