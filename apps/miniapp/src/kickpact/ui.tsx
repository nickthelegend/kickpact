"use client"
/** Kickpact pixel UI primitives (web) — the DOM twins of apps/mobile/src/ui.tsx. */
import type { CSSProperties, ReactNode } from "react"

export function Px({
  children,
  size = 14,
  color = "var(--white)",
  tracking = 1,
  upper = true,
  style,
  as: Tag = "div",
}: {
  children: ReactNode
  size?: number
  color?: string
  tracking?: number
  upper?: boolean
  style?: CSSProperties
  as?: "div" | "span" | "p" | "h1"
}) {
  return (
    <Tag
      className={`px${upper ? "" : " lower"}`}
      style={{ fontSize: size, color, letterSpacing: tracking, ...style }}
    >
      {children}
    </Tag>
  )
}

export function Panel({ children, style, glow }: { children: ReactNode; style?: CSSProperties; glow?: string }) {
  return (
    <div className="panel" style={{ ...(glow ? { borderColor: glow } : {}), ...style }}>
      {children}
    </div>
  )
}

export function PixelButton({
  label,
  onClick,
  color = "var(--green)",
  textColor = "var(--white)",
  size = 14,
  disabled,
  full,
  style,
}: {
  label: ReactNode
  onClick?: () => void
  color?: string
  textColor?: string
  size?: number
  disabled?: boolean
  full?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      className={`pbtn${full ? " full" : ""}`}
      disabled={disabled}
      onClick={onClick}
      style={{ background: color, color: textColor, fontSize: size, ...style }}
    >
      {label}
    </button>
  )
}

export function TabPill({
  items,
  active,
  onPick,
}: {
  items: { key: string; label: string }[]
  active: string
  onPick: (k: string) => void
}) {
  return (
    <div
      className="row gap6"
      style={{ background: "var(--panel)", borderRadius: 999, padding: 3, alignSelf: "flex-start", width: "fit-content" }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onPick(it.key)}
          className="px"
          style={{
            border: 0,
            cursor: "pointer",
            borderRadius: 999,
            padding: "6px 16px",
            fontSize: 11,
            letterSpacing: 1,
            background: active === it.key ? "var(--eth)" : "transparent",
            color: active === it.key ? "var(--white)" : "var(--white45)",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
