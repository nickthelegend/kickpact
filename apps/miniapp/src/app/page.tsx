"use client"

import dynamic from "next/dynamic"

// The whole app is client-only (WebCrypto, ethers, Telegram SDK) — never SSR it.
const App = dynamic(() => import("@/kickpact/App"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "monospace", color: "#7f92c9" }}>
      loading kickpact…
    </div>
  ),
})

export default function Page() {
  return <App />
}
