"use client"
/**
 * Self-custodial wallet context — the WDK analogue for the Telegram Mini App.
 * On-device BIP-39 seed via ethers; sealed into Telegram CloudStorage
 * (AES-GCM, passcode-derived key) by `vault.ts`. Mirrors the native app's
 * INITIALIZING → NO_WALLET → LOCKED → READY state machine.
 */
import { ethers } from "ethers"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { CHAIN, USDT_ABI } from "./chain"
import { hasSeed, loadSeed, saveSeed, storageKind, wipe } from "./vault"

export type WalletStatus = "initializing" | "no_wallet" | "locked" | "ready"

export interface WalletCtx {
  status: WalletStatus
  address: string | null
  signer: ethers.HDNodeWallet | null
  provider: ethers.JsonRpcProvider
  usdt: number
  eth: number
  storage: "cloud" | "local" | null
  createWallet(passcode: string): Promise<string> // returns the 12-word seed
  importWallet(phrase: string, passcode: string): Promise<void>
  unlock(passcode: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
  revealSeed(passcode: string): Promise<string>
}

const Ctx = createContext<WalletCtx | null>(null)

export function useWallet(): WalletCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error("useWallet outside WalletProvider")
  return c
}

const makeProvider = () =>
  new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId, { staticNetwork: true })

export function WalletProvider({ children }: { children: ReactNode }) {
  const providerRef = useRef<ethers.JsonRpcProvider>(makeProvider())
  const [status, setStatus] = useState<WalletStatus>("initializing")
  const [signer, setSigner] = useState<ethers.HDNodeWallet | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [usdt, setUsdt] = useState(0)
  const [eth, setEth] = useState(0)
  const [storage, setStorage] = useState<"cloud" | "local" | null>(null)

  useEffect(() => {
    ;(async () => {
      setStorage(await storageKind())
      setStatus((await hasSeed()) ? "locked" : "no_wallet")
    })()
  }, [])

  const attach = useCallback((phrase: string) => {
    const w = ethers.Wallet.fromPhrase(phrase.trim()).connect(providerRef.current)
    setSigner(w)
    setAddress(w.address)
    setStatus("ready")
    return w
  }, [])

  const refresh = useCallback(async () => {
    if (!address) return
    try {
      const usdtC = new ethers.Contract(CHAIN.usdtAddress, USDT_ABI as unknown as string[], providerRef.current)
      const [u, e] = await Promise.all([usdtC.balanceOf(address), providerRef.current.getBalance(address)])
      setUsdt(Number(ethers.formatUnits(u, CHAIN.USDT_DECIMALS)))
      setEth(Number(ethers.formatEther(e)))
    } catch {}
  }, [address])

  useEffect(() => {
    if (status === "ready") {
      refresh()
      const t = setInterval(refresh, 15_000)
      return () => clearInterval(t)
    }
  }, [status, refresh])

  const createWallet = useCallback(
    async (passcode: string) => {
      // Persist the encrypted seed but DON'T go "ready" yet — the SignIn screen
      // shows the 12 words for backup, then calls unlock() to enter.
      const w = ethers.Wallet.createRandom()
      const phrase = w.mnemonic!.phrase
      await saveSeed(phrase, passcode)
      return phrase
    },
    [],
  )

  const importWallet = useCallback(
    async (phrase: string, passcode: string) => {
      const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ")
      ethers.Wallet.fromPhrase(normalized) // validate
      await saveSeed(normalized, passcode)
      attach(normalized)
    },
    [attach],
  )

  const unlock = useCallback(
    async (passcode: string) => {
      attach(await loadSeed(passcode))
    },
    [attach],
  )

  const revealSeed = useCallback((passcode: string) => loadSeed(passcode), [])

  const logout = useCallback(async () => {
    await wipe()
    setSigner(null)
    setAddress(null)
    setUsdt(0)
    setEth(0)
    setStatus("no_wallet")
  }, [])

  const value = useMemo<WalletCtx>(
    () => ({
      status,
      address,
      signer,
      provider: providerRef.current,
      usdt,
      eth,
      storage,
      createWallet,
      importWallet,
      unlock,
      logout,
      refresh,
      revealSeed,
    }),
    [status, address, signer, usdt, eth, storage, createWallet, importWallet, unlock, logout, refresh, revealSeed],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
