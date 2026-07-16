// Runtime polyfills — MUST load before any @solana/web3.js / spl-token code.
import "react-native-get-random-values"
import { Buffer } from "buffer"

// Buffer + process are referenced at module top-level by spl-token/web3.js and
// are absent in both Hermes and the web runtime. `getRandomValues` (above) plus
// tweetnacl's bundled ed25519/sha512 cover everything the burner + MWA paths
// need — no native OpenSSL required.
const g = globalThis
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) g.process = { env: {} }
if (!g.process.env) g.process.env = {}
