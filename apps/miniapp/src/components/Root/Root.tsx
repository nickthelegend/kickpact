"use client"

import { type PropsWithChildren, useEffect } from "react"
import { init as initSDK, viewport } from "@tma.js/sdk-react"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { ErrorPage } from "@/components/ErrorPage"
import { useDidMount } from "@/hooks/useDidMount"
import { WalletProvider } from "@/kickpact/wallet"
import "@/kickpact/kickpact.css"

function RootInner({ children }: PropsWithChildren) {
  useEffect(() => {
    try {
      initSDK()
      // go full-height + expand; ignore if a method isn't available in the host
      viewport.mount?.().catch?.(() => {})
      viewport.expand?.()
      viewport.requestFullscreen?.().catch?.(() => {})
    } catch {}
  }, [])

  return <WalletProvider>{children}</WalletProvider>
}

export function Root(props: PropsWithChildren) {
  // Telegram Mini Apps can't be server-rendered fully — show a loader on the server.
  const didMount = useDidMount()
  return didMount ? (
    <ErrorBoundary fallback={ErrorPage}>
      <RootInner {...props} />
    </ErrorBoundary>
  ) : (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "monospace", color: "#7f92c9" }}>
      loading kickpact…
    </div>
  )
}
