/**
 * Wallet context — self-custodial EVM wallet for the mobile app.
 *
 * The key is a BIP-39 seed generated on-device and stored in the OS keychain
 * (expo-secure-store on native; localStorage on web preview). Signing + reads
 * go through an ethers wallet connected to Sepolia, so every duel action is a
 * real on-chain transaction.
 *
 * The status machine (INITIALIZING → NO_WALLET → READY) mirrors WDK RN core's
 * shape so the native build can swap this for @tetherto/wdk-react-native-core
 * (device keystore + Bare worklet) without touching the screens.
 */
import * as React from "react"
import { ethers } from "ethers"

import { CHAIN } from "./chain"
import { loadSecret, saveSecret, clearSecret } from "./storage"
import { getEthBalance, getUsdtBalance } from "./duel"

const SEED_KEY = "flicky.wallet.seed"

type Status = "INITIALIZING" | "NO_WALLET" | "READY"

interface WalletContextValue {
  status: Status
  address: string | null
  signer: ethers.HDNodeWallet | null
  provider: ethers.JsonRpcProvider
  usdt: number
  eth: number
  createWallet(): Promise<string>
  importWallet(phrase: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
  getSeedPhrase(): Promise<string | null>
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

function makeProvider() {
  return new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, {
    staticNetwork: true,
  })
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const providerRef = React.useRef<ethers.JsonRpcProvider | null>(null)
  if (!providerRef.current) providerRef.current = makeProvider()

  const [status, setStatus] = React.useState<Status>("INITIALIZING")
  const [signer, setSigner] = React.useState<ethers.HDNodeWallet | null>(null)
  const [address, setAddress] = React.useState<string | null>(null)
  const [usdt, setUsdt] = React.useState(0)
  const [eth, setEth] = React.useState(0)

  const connect = React.useCallback(async (phrase: string) => {
    const w = ethers.Wallet.fromPhrase(phrase).connect(providerRef.current!)
    setSigner(w)
    setAddress(w.address)
    setStatus("READY")
    return w
  }, [])

  const refresh = React.useCallback(async () => {
    if (!address) return
    try {
      const [u, e] = await Promise.all([
        getUsdtBalance(providerRef.current!, address),
        getEthBalance(providerRef.current!, address),
      ])
      setUsdt(Number(u) / Number(CHAIN.ONE_USDT))
      setEth(Number(e) / 1e18)
    } catch (err) {
      console.warn("balance refresh failed", err)
    }
  }, [address])

  // Restore on mount.
  React.useEffect(() => {
    let cancelled = false
    loadSecret(SEED_KEY)
      .then(async (seed) => {
        if (cancelled) return
        if (seed) await connect(seed)
        else setStatus("NO_WALLET")
      })
      .catch(() => setStatus("NO_WALLET"))
    return () => {
      cancelled = true
    }
  }, [connect])

  // Poll balances while signed in.
  React.useEffect(() => {
    if (status !== "READY") return
    refresh()
    const id = setInterval(refresh, 7000)
    return () => clearInterval(id)
  }, [status, refresh])

  const createWallet = React.useCallback(async () => {
    const w = ethers.Wallet.createRandom()
    const phrase = w.mnemonic!.phrase
    await saveSecret(SEED_KEY, phrase)
    await connect(phrase)
    return phrase
  }, [connect])

  const importWallet = React.useCallback(
    async (phrase: string) => {
      const normalized = phrase.trim().toLowerCase()
      if (!ethers.Mnemonic.isValidMnemonic(normalized)) {
        throw new Error("Invalid recovery phrase")
      }
      await saveSecret(SEED_KEY, normalized)
      await connect(normalized)
    },
    [connect],
  )

  const logout = React.useCallback(async () => {
    await clearSecret(SEED_KEY)
    setSigner(null)
    setAddress(null)
    setUsdt(0)
    setEth(0)
    setStatus("NO_WALLET")
  }, [])

  const getSeedPhrase = React.useCallback(() => loadSecret(SEED_KEY), [])

  const value = React.useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      signer,
      provider: providerRef.current!,
      usdt,
      eth,
      createWallet,
      importWallet,
      logout,
      refresh,
      getSeedPhrase,
    }),
    [status, address, signer, usdt, eth, createWallet, importWallet, logout, refresh, getSeedPhrase],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
