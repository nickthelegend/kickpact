/**
 * Kickpact key vault for the Telegram Mini App — the WDK analogue for the web.
 *
 * The 12-word seed is AES-GCM encrypted with a key derived (PBKDF2, 210k) from
 * the user's passcode, and the ciphertext is stored in **Telegram CloudStorage**
 * (synced to the user's Telegram account, off-device). Without the passcode the
 * seed is unrecoverable — self-custody, adapted to the platform. Falls back to
 * localStorage in a plain browser (dev / preview) so the app still runs.
 *
 * Mirrors the native app's WDK secure-storage: on device the seed sits in the
 * keychain behind biometrics; here it sits in CloudStorage behind a passcode.
 */

const KEY = "kickpact.vault.v1"
const enc = new TextEncoder()
const dec = new TextDecoder()

// ── platform storage: Telegram CloudStorage, else localStorage ──────────────

type KV = {
  get(k: string): Promise<string | null>
  set(k: string, v: string): Promise<void>
  del(k: string): Promise<void>
  kind: "cloud" | "local"
}

async function cloud(): Promise<KV | null> {
  if (typeof window === "undefined") return null
  try {
    const { cloudStorage } = await import("@tma.js/sdk-react")
    if (cloudStorage.getItem.isAvailable() && cloudStorage.setItem.isAvailable()) {
      return {
        kind: "cloud",
        get: (k) => cloudStorage.getItem(k).then((v) => v || null),
        set: (k, v) => cloudStorage.setItem(k, v),
        del: (k) => cloudStorage.deleteItem(k),
      }
    }
  } catch {}
  return null
}

const local: KV = {
  kind: "local",
  async get(k) {
    return (typeof window !== "undefined" && window.localStorage.getItem(k)) || null
  },
  async set(k, v) {
    if (typeof window !== "undefined") window.localStorage.setItem(k, v)
  },
  async del(k) {
    if (typeof window !== "undefined") window.localStorage.removeItem(k)
  },
}

async function store(): Promise<KV> {
  return (await cloud()) ?? local
}

/** Which backend holds the seed (for honest UI copy). */
export async function storageKind(): Promise<"cloud" | "local"> {
  return (await store()).kind
}

// ── crypto (WebCrypto AES-GCM + PBKDF2) ─────────────────────────────────────

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 210_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

interface Blob {
  v: 1
  salt: string
  iv: string
  ct: string
}

/** Encrypt + persist the seed. */
export async function saveSeed(seed: string, passcode: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passcode, salt)
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(seed))
  const blob: Blob = { v: 1, salt: b64(salt.buffer), iv: b64(iv.buffer), ct: b64(ct) }
  await (await store()).set(KEY, JSON.stringify(blob))
}

/** True if an encrypted seed exists. */
export async function hasSeed(): Promise<boolean> {
  return !!(await (await store()).get(KEY))
}

/** Decrypt the seed with the passcode (throws on wrong passcode). */
export async function loadSeed(passcode: string): Promise<string> {
  const raw = await (await store()).get(KEY)
  if (!raw) throw new Error("no wallet on this account")
  const blob = JSON.parse(raw) as Blob
  const key = await deriveKey(passcode, unb64(blob.salt))
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(blob.iv) as BufferSource },
      key,
      unb64(blob.ct) as BufferSource,
    )
    return dec.decode(pt)
  } catch {
    throw new Error("wrong passcode")
  }
}

export async function wipe(): Promise<void> {
  await (await store()).del(KEY)
}
