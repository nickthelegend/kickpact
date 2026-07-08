/**
 * Key storage — NATIVE implementation using WDK's secure storage
 * (@tetherto/wdk-react-native-secure-storage). The seed lives in the device
 * keychain / keystore (Secure Enclave / StrongBox), optionally behind
 * biometrics — true self-custody, the headline WDK-track integration.
 *
 * Metro picks this file over storage.ts on iOS/Android automatically.
 * Same { loadSecret, saveSecret, clearSecret } interface as the web version,
 * so wallet.tsx is unchanged.
 */
import { createSecureStorage } from "@tetherto/wdk-react-native-secure-storage"

const storage = createSecureStorage({
  authentication: {
    promptMessage: "Authenticate to access your Kickpact wallet",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  },
  timeoutMs: 30000,
})

// The storage key doubles as the WDK wallet identifier.
export async function loadSecret(key: string): Promise<string | null> {
  return storage.getEncryptedSeed(key)
}

export async function saveSecret(key: string, value: string): Promise<void> {
  await storage.setEncryptedSeed(value, key)
}

export async function clearSecret(key: string): Promise<void> {
  await storage.deleteWallet(key)
}
