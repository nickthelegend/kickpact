/**
 * Wallet context — self-custodial SOLANA wallet for the mobile app.
 *
 * Two ways in, one interface out:
 *   • Burner (default): an ed25519 keypair generated on-device, secret stored
 *     in the OS keychain via the same secure-storage path as the EVM era —
 *     the app signs transactions locally. Backup/restore via base58 secret.
 *   • Mobile Wallet Adapter: connect Phantom/Solflare/etc. on Android — the
 *     wallet app signs; we only ever hold the public key.
 *
 * The status machine (INITIALIZING → NO_WALLET → BACKUP_PENDING → READY)
 * is unchanged from the EVM build so screens port 1:1.
 */
import * as React from "react"
import { Keypair, PublicKey, Transaction, Connection } from "@solana/web3.js"
import bs58 from "bs58"

import { RPC_URL } from "./solana"
import { loadSecret, saveSecret, clearSecret } from "./storage"

const SECRET_KEY = "kickpact.solana.secret"

type Status = "INITIALIZING" | "NO_WALLET" | "BACKUP_PENDING" | "READY"
type Mode = "burner" | "mwa"

export interface WalletContextValue {
  status: Status
  mode: Mode
  address: string | null
  publicKey: PublicKey | null
  /** Local keypair when mode === "burner", null under MWA. */
  keypair: Keypair | null
  connection: Connection
  sol: number
  kusd: number
  createWallet(): Promise<string>
  confirmBackup(): void
  importWallet(secretBase58: string): Promise<void>
  connectMwa(): Promise<void>
  signAndSend(tx: Transaction): Promise<string>
  logout(): Promise<void>
  refresh(): Promise<void>
  getSecret(): Promise<string | null>
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connectionRef = React.useRef<Connection | null>(null)
  if (!connectionRef.current)
    connectionRef.current = new Connection(RPC_URL, { commitment: "confirmed" })

  const [status, setStatus] = React.useState<Status>("INITIALIZING")
  const [mode, setMode] = React.useState<Mode>("burner")
  const [keypair, setKeypair] = React.useState<Keypair | null>(null)
  const [publicKey, setPublicKey] = React.useState<PublicKey | null>(null)
  const [mwaToken, setMwaToken] = React.useState<string | null>(null)
  const [sol, setSol] = React.useState(0)
  const [kusd, setKusd] = React.useState(0)

  const refresh = React.useCallback(async () => {
    if (!publicKey) return
    try {
      const conn = connectionRef.current!
      const { getKusdBalance } = await import("./solana")
      const [lamports, k] = await Promise.all([
        conn.getBalance(publicKey),
        getKusdBalance(conn, publicKey),
      ])
      setSol(lamports / 1e9)
      setKusd(k)
    } catch (err) {
      console.warn("balance refresh failed", err)
    }
  }, [publicKey])

  // Restore on mount.
  React.useEffect(() => {
    let cancelled = false
    loadSecret(SECRET_KEY)
      .then((secret) => {
        if (cancelled) return
        if (secret) {
          const kp = Keypair.fromSecretKey(bs58.decode(secret))
          setKeypair(kp)
          setPublicKey(kp.publicKey)
          setMode("burner")
          setStatus("READY")
        } else setStatus("NO_WALLET")
      })
      .catch(() => setStatus("NO_WALLET"))
    return () => {
      cancelled = true
    }
  }, [])

  // Poll balances while signed in.
  React.useEffect(() => {
    if (status !== "READY") return
    refresh()
    const id = setInterval(refresh, 8000)
    return () => clearInterval(id)
  }, [status, refresh])

  const createWallet = React.useCallback(async () => {
    const kp = Keypair.generate()
    const secret = bs58.encode(kp.secretKey)
    await saveSecret(SECRET_KEY, secret)
    setKeypair(kp)
    setPublicKey(kp.publicKey)
    setMode("burner")
    setStatus("BACKUP_PENDING")
    return secret
  }, [])

  const confirmBackup = React.useCallback(() => setStatus("READY"), [])

  const importWallet = React.useCallback(async (secretBase58: string) => {
    const cleaned = secretBase58.trim()
    const kp = Keypair.fromSecretKey(bs58.decode(cleaned)) // throws if invalid
    await saveSecret(SECRET_KEY, cleaned)
    setKeypair(kp)
    setPublicKey(kp.publicKey)
    setMode("burner")
    setStatus("READY")
  }, [])

  /** Connect an installed MWA wallet (Phantom, Solflare, fakewallet…). */
  const connectMwa = React.useCallback(async () => {
    const { transact } = await import("@solana-mobile/mobile-wallet-adapter-protocol-web3js")
    await transact(async (wallet: any) => {
      const auth = await wallet.authorize({
        cluster: "devnet",
        identity: { name: "Kickpact", uri: "https://kickpact.app" },
      })
      const addr = auth.accounts[0].address
      // MWA returns base64 account addresses
      const pk = new PublicKey(Buffer.from(addr, "base64"))
      setPublicKey(pk)
      setMwaToken(auth.auth_token)
      setKeypair(null)
      setMode("mwa")
      setStatus("READY")
    })
  }, [])

  /** Sign + send through whichever wallet is active. */
  const signAndSend = React.useCallback(
    async (tx: Transaction): Promise<string> => {
      const conn = connectionRef.current!
      if (mode === "burner") {
        if (!keypair) throw new Error("no wallet")
        const bh = await conn.getLatestBlockhash("confirmed")
        tx.recentBlockhash = bh.blockhash
        tx.feePayer = keypair.publicKey
        tx.sign(keypair)
        const sig = await conn.sendRawTransaction(tx.serialize())
        await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed")
        return sig
      }
      // MWA path — the wallet app signs
      const { transact } = await import("@solana-mobile/mobile-wallet-adapter-protocol-web3js")
      return await transact(async (wallet: any) => {
        await wallet.reauthorize({ auth_token: mwaToken })
        const bh = await conn.getLatestBlockhash("confirmed")
        tx.recentBlockhash = bh.blockhash
        tx.feePayer = publicKey!
        const [sig] = await wallet.signAndSendTransactions({ transactions: [tx] })
        await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed")
        return sig
      })
    },
    [mode, keypair, publicKey, mwaToken],
  )

  const logout = React.useCallback(async () => {
    await clearSecret(SECRET_KEY)
    setKeypair(null)
    setPublicKey(null)
    setMwaToken(null)
    setSol(0)
    setKusd(0)
    setStatus("NO_WALLET")
  }, [])

  const getSecret = React.useCallback(() => loadSecret(SECRET_KEY), [])

  const value = React.useMemo<WalletContextValue>(
    () => ({
      status,
      mode,
      address: publicKey?.toBase58() ?? null,
      publicKey,
      keypair,
      connection: connectionRef.current!,
      sol,
      kusd,
      createWallet,
      confirmBackup,
      importWallet,
      connectMwa,
      signAndSend,
      logout,
      refresh,
      getSecret,
    }),
    [status, mode, publicKey, keypair, sol, kusd, createWallet, confirmBackup, importWallet, connectMwa, signAndSend, logout, refresh, getSecret],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
