import type { PropsWithChildren } from "react"
import type { Metadata, Viewport } from "next"

import { Root } from "@/components/Root/Root"

export const metadata: Metadata = {
  title: "Kickpact",
  description: "Bet on football with a wallet that's yours — self-custodial, on Sepolia.",
}

export const viewport: Viewport = {
  themeColor: "#10162e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Root>{children}</Root>
      </body>
    </html>
  )
}
