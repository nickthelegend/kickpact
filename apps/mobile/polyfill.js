// Runtime polyfills — MUST load before any @solana/web3.js / spl-token code.
import { Platform } from "react-native"
import "react-native-get-random-values"
import { Buffer } from "buffer"

// Buffer + process are referenced at module top-level by spl-token/web3.js and
// are absent in both Hermes and the web runtime.
const g = globalThis
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) g.process = { env: {} }
if (!g.process.env) g.process.env = {}

// react-native-quick-crypto is a JSI native module (SubtleCrypto for MWA/anchor)
// — native only; the web runtime already has window.crypto.
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { install } = require("react-native-quick-crypto")
  install()
}
