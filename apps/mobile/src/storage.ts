/**
 * Key storage — WEB / default implementation (AsyncStorage → localStorage).
 *
 * On a real device, Metro resolves `storage.native.ts` instead, which stores
 * the seed in the OS keychain via @tetherto/wdk-react-native-secure-storage
 * (the WDK self-custody key store). This file never imports native-only
 * modules, so the web bundle stays clean.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"

export async function loadSecret(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key)
}

export async function saveSecret(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value)
}

export async function clearSecret(key: string): Promise<void> {
  await AsyncStorage.removeItem(key)
}
