/**
 * Fiat on-ramp / off-ramp via MoonPay — demo (sandbox) integration.
 *
 * Mirrors WDK's `@tetherto/wdk-protocol-fiat-moonpay` (`buy()` / `sell()` return
 * widget URLs). Here we build the MoonPay widget URLs directly and open them in
 * the device browser (unsigned sandbox URLs — no backend signer needed for the
 * demo). Swap the URL builders for the WDK module + a `signUrl` backend in prod.
 */
import { Linking } from "react-native"
import { C } from "./theme"

// Public MoonPay sandbox/demo key — replace with your own from
// https://dashboard.moonpay.com. Sandbox widgets are non-custodial test flows.
const MOONPAY_API_KEY = "pk_test_DMRuyL6Nf1qc9OzjPBmCBhBn8qBjU"
const BUY_BASE = "https://buy-sandbox.moonpay.com"
const SELL_BASE = "https://sell-sandbox.moonpay.com"

export interface FiatConfig {
  theme?: "light" | "dark"
  colorCode?: string
  redirectURL?: string
}

const qs = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join("&")

/** On-ramp widget URL — buy `asset` with fiat, credited to `walletAddress`. */
export function buildBuyUrl(opts: {
  walletAddress: string
  asset?: string // moonpay currencyCode, e.g. "usdt", "eth"
  fiat?: string // e.g. "usd", "eur"
  amount?: number // fiat amount in major units (dollars)
  config?: FiatConfig
}): string {
  const { walletAddress, asset = "usdt", fiat = "usd", amount, config } = opts
  return `${BUY_BASE}?${qs({
    apiKey: MOONPAY_API_KEY,
    currencyCode: asset,
    baseCurrencyCode: fiat,
    baseCurrencyAmount: amount ? String(amount) : undefined,
    walletAddress,
    theme: config?.theme ?? "dark",
    colorCode: config?.colorCode ?? C.eth,
    redirectURL: config?.redirectURL,
  })}`
}

/** Off-ramp widget URL — sell `asset` for fiat, refunds to `refundAddress`. */
export function buildSellUrl(opts: {
  refundAddress: string
  asset?: string
  fiat?: string
  amount?: number // crypto amount in major units
  config?: FiatConfig
}): string {
  const { refundAddress, asset = "usdt", fiat = "usd", amount, config } = opts
  return `${SELL_BASE}?${qs({
    apiKey: MOONPAY_API_KEY,
    baseCurrencyCode: asset,
    quoteCurrencyCode: fiat,
    baseCurrencyAmount: amount ? String(amount) : undefined,
    refundWalletAddress: refundAddress,
    theme: config?.theme ?? "dark",
    colorCode: config?.colorCode ?? C.eth,
    redirectURL: config?.redirectURL,
  })}`
}

/** Open the MoonPay buy (on-ramp) widget. Returns the URL opened. */
export async function onRamp(opts: Parameters<typeof buildBuyUrl>[0]): Promise<string> {
  const url = buildBuyUrl(opts)
  await Linking.openURL(url)
  return url
}

/** Open the MoonPay sell (off-ramp) widget. Returns the URL opened. */
export async function offRamp(opts: Parameters<typeof buildSellUrl>[0]): Promise<string> {
  const url = buildSellUrl(opts)
  await Linking.openURL(url)
  return url
}

// WDK MoonPayProtocol-shaped aliases (so this can be swapped for the WDK module).
export const buy = (o: Parameters<typeof buildBuyUrl>[0]) => ({ buyUrl: buildBuyUrl(o) })
export const sell = (o: Parameters<typeof buildSellUrl>[0]) => ({ sellUrl: buildSellUrl(o) })
