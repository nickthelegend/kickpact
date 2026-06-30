import { useEffect, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { PixelButton } from "@/components/pixel-button"
import { useWdkWallet } from "@/wdk/wallet"

/**
 * Sign-in popup — self-custodial Ethereum wallet via WDK (@tetherto/wdk).
 *
 * Replaces the old Sui zkLogin/Enoki + Slush flow. The player either creates
 * a fresh wallet (a BIP-39 seed generated client-side, shown once for backup)
 * or imports an existing recovery phrase. Keys never leave the device —
 * stored locally, the user holds them. Powered by WDK on Ethereum (Sepolia).
 *
 * Mounted via createPortal so it overlays the mobile frame AND the checker
 * background. Closes on Escape, backdrop click, or the X button.
 */

const CREATE_BRAND_STYLE = {
  "--btn-bg": "#627eea", // Ethereum brand blue
  "--btn-highlight": "#8aa0f5",
  "--btn-text-shadow": "0 1px 0 rgba(0, 0, 0, 0.35)",
} as CSSProperties

const IMPORT_BRAND_STYLE = {
  "--btn-bg": "#2c3a63",
  "--btn-highlight": "#4a5c91",
} as CSSProperties

export interface LoginModalProps {
  open: boolean
  onClose: () => void
}

type View = "choose" | "backup" | "import"

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { createWallet, importWallet } = useWdkWallet()
  const [view, setView] = useState<View>("choose")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phrase, setPhrase] = useState("")
  const [importText, setImportText] = useState("")

  // Reset to a clean state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setView("choose")
      setBusy(false)
      setError(null)
      setPhrase("")
      setImportText("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", handleKey)
    }
  }, [open, onClose])

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      const generated = await createWallet()
      setPhrase(generated)
      setView("backup")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet")
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setBusy(true)
    setError(null)
    try {
      await importWallet(importText)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid recovery phrase")
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="pixel-frame relative w-full max-w-sm rounded-3xl bg-[#1b2548] font-pixel text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute right-3 top-3 grid size-7 place-items-center text-base text-white/55 hover:text-white"
        >
          ✕
        </button>

        <header className="px-6 pb-4 pt-7 text-center">
          <h2 id="login-title" className="text-base uppercase tracking-[0.18em]">
            {view === "import" ? "import wallet" : "sign in to flicky"}
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">
            self-custodial · powered by wdk
          </p>
        </header>

        {error && (
          <p className="mx-6 mb-3 rounded bg-red-500/15 px-3 py-2 text-center text-[11px] uppercase tracking-[0.12em] text-red-300">
            {error}
          </p>
        )}

        {view === "choose" && (
          <div className="flex flex-col gap-3 px-6 pb-6">
            <PixelButton
              onClick={handleCreate}
              disabled={busy}
              style={CREATE_BRAND_STYLE}
              className="h-12"
            >
              <span className="flex w-full items-center justify-center gap-2">
                <span aria-hidden className="text-lg">
                  ⟠
                </span>
                {busy ? "creating…" : "create ethereum wallet"}
              </span>
            </PixelButton>

            <div className="my-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-white/35">
              <span className="h-px flex-1 bg-white/15" />
              or
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <PixelButton
              onClick={() => setView("import")}
              disabled={busy}
              style={IMPORT_BRAND_STYLE}
              className="h-12"
            >
              import recovery phrase
            </PixelButton>

            <p className="mt-2 text-center text-[10px] uppercase leading-relaxed tracking-[0.16em] text-white/35">
              your keys, your funds. a wallet is created on your device — no
              email, no seed phrase shared with anyone else.
            </p>
          </div>
        )}

        {view === "backup" && (
          <div className="flex flex-col gap-3 px-6 pb-6">
            <p className="text-center text-[11px] uppercase leading-relaxed tracking-[0.14em] text-amber-300/90">
              write down these 12 words. they are the only way to recover your
              wallet.
            </p>
            <ol className="grid grid-cols-3 gap-2 rounded-lg bg-black/25 p-3 text-[11px] lowercase">
              {phrase.split(" ").map((word, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-1.5"
                >
                  <span className="text-white/35">{i + 1}</span>
                  <span className="tracking-wide text-white">{word}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(phrase)}
              className="text-center text-[10px] uppercase tracking-[0.18em] text-white/45 hover:text-white"
            >
              copy to clipboard
            </button>
            <PixelButton
              onClick={onClose}
              style={CREATE_BRAND_STYLE}
              className="mt-1 h-12"
            >
              i&apos;ve saved it — enter
            </PixelButton>
          </div>
        )}

        {view === "import" && (
          <div className="flex flex-col gap-3 px-6 pb-6">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="enter your 12-word recovery phrase"
              rows={3}
              className="w-full resize-none rounded-lg border border-white/15 bg-black/25 p-3 text-sm lowercase text-white outline-none focus:border-[#627eea]"
            />
            <PixelButton
              onClick={handleImport}
              disabled={busy || importText.trim().length === 0}
              style={CREATE_BRAND_STYLE}
              className="h-12"
            >
              {busy ? "importing…" : "import & sign in"}
            </PixelButton>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setView("choose")
              }}
              className="text-center text-[10px] uppercase tracking-[0.18em] text-white/45 hover:text-white"
            >
              ← back
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
