/**
 * WDK wallet layer — self-custodial EVM identity for Flicky.
 *
 * Replaces the old Sui dapp-kit + Enoki/zkLogin stack. The user holds their
 * own keys: a BIP-39 seed phrase is generated client-side, stored in
 * localStorage (testnet), and drives a WDK `WalletManagerEvm` on Sepolia.
 *
 * Exposes a small dapp-kit-shaped API so the rest of the app migrates with
 * minimal churn:
 *   - useCurrentAccount()  → { address } | null
 *   - useWdkWallet()       → full context (account, provider, create/import/logout)
 */
import * as React from "react"
import { ethers } from "ethers"
import WalletManagerEvm from "@tetherto/wdk-wallet-evm"

import { EVM_CONFIG, SEED_STORAGE_KEY } from "@/lib/evm-config"

// WDK's WalletAccountEvm — typed loosely to avoid deep coupling to beta types.
export interface WdkAccount {
  getAddress(): Promise<string>
  getBalance(): Promise<bigint>
  getTokenBalance(token: string): Promise<bigint>
  sendTransaction(tx: {
    to: string
    value?: bigint | number
    data?: string
  }): Promise<{ hash: string; fee: bigint }>
  sign(message: string): Promise<string>
  dispose?(): void
}

interface WdkWalletContextValue {
  /** Checksummed address of account 0, or null when no wallet exists. */
  address: string | null
  /** WDK account 0 (signer). Null until a wallet is created/imported. */
  account: WdkAccount | null
  /** Read-only JSON-RPC provider for view calls. Always available. */
  provider: ethers.JsonRpcProvider
  /** True once we've checked storage (avoids a flash of "no wallet"). */
  ready: boolean
  /** Generate a fresh seed, persist it, and connect. Returns the phrase. */
  createWallet(): Promise<string>
  /** Import an existing BIP-39 phrase. */
  importWallet(phrase: string): Promise<void>
  /** Reveal the stored seed phrase (for backup UI). */
  getSeedPhrase(): string | null
  /** Forget the wallet (clears storage). */
  logout(): void
}

const WdkWalletContext = React.createContext<WdkWalletContextValue | null>(null)

function makeProvider() {
  return new ethers.JsonRpcProvider(EVM_CONFIG.rpcUrl, EVM_CONFIG.chainId, {
    staticNetwork: true,
  })
}

export function WdkWalletProvider({ children }: { children: React.ReactNode }) {
  const providerRef = React.useRef<ethers.JsonRpcProvider | null>(null)
  if (!providerRef.current) providerRef.current = makeProvider()

  const [account, setAccount] = React.useState<WdkAccount | null>(null)
  const [address, setAddress] = React.useState<string | null>(null)
  const [ready, setReady] = React.useState(false)

  const connectFromSeed = React.useCallback(async (phrase: string) => {
    const manager = new WalletManagerEvm(phrase, {
      provider: EVM_CONFIG.rpcUrl,
      chainId: EVM_CONFIG.chainId,
    })
    const acct = (await manager.getAccount(0)) as unknown as WdkAccount
    const addr = await acct.getAddress()
    setAccount(acct)
    setAddress(addr)
  }, [])

  // On mount: restore an existing wallet from storage.
  React.useEffect(() => {
    let cancelled = false
    const stored = localStorage.getItem(SEED_STORAGE_KEY)
    if (!stored) {
      setReady(true)
      return
    }
    connectFromSeed(stored)
      .catch((e) => console.error("WDK restore failed", e))
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [connectFromSeed])

  const createWallet = React.useCallback(async () => {
    const phrase = ethers.Wallet.createRandom().mnemonic!.phrase
    localStorage.setItem(SEED_STORAGE_KEY, phrase)
    await connectFromSeed(phrase)
    return phrase
  }, [connectFromSeed])

  const importWallet = React.useCallback(
    async (phrase: string) => {
      const normalized = phrase.trim().toLowerCase()
      if (!ethers.Mnemonic.isValidMnemonic(normalized)) {
        throw new Error("Invalid recovery phrase")
      }
      localStorage.setItem(SEED_STORAGE_KEY, normalized)
      await connectFromSeed(normalized)
    },
    [connectFromSeed],
  )

  const getSeedPhrase = React.useCallback(
    () => localStorage.getItem(SEED_STORAGE_KEY),
    [],
  )

  const logout = React.useCallback(() => {
    try {
      account?.dispose?.()
    } catch {
      /* ignore */
    }
    localStorage.removeItem(SEED_STORAGE_KEY)
    setAccount(null)
    setAddress(null)
  }, [account])

  const value = React.useMemo<WdkWalletContextValue>(
    () => ({
      address,
      account,
      provider: providerRef.current!,
      ready,
      createWallet,
      importWallet,
      getSeedPhrase,
      logout,
    }),
    [address, account, ready, createWallet, importWallet, getSeedPhrase, logout],
  )

  return (
    <WdkWalletContext.Provider value={value}>
      {children}
    </WdkWalletContext.Provider>
  )
}

export function useWdkWallet(): WdkWalletContextValue {
  const ctx = React.useContext(WdkWalletContext)
  if (!ctx) throw new Error("useWdkWallet must be used within WdkWalletProvider")
  return ctx
}

/** dapp-kit-shaped shim: returns `{ address }` or null. */
export function useCurrentAccount(): { address: string } | null {
  const { address } = useWdkWallet()
  return address ? { address } : null
}
