/**
 * Key storage shim. On a real device the seed lives in the OS keychain /
 * keystore via expo-secure-store (true self-custody). On web (the dev preview)
 * it falls back to AsyncStorage (localStorage).
 */
import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import AsyncStorage from "@react-native-async-storage/async-storage"

const isWeb = Platform.OS === "web"

export async function loadSecret(key: string): Promise<string | null> {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key)
}

export async function saveSecret(key: string, value: string): Promise<void> {
  if (isWeb) await AsyncStorage.setItem(key, value)
  else await SecureStore.setItemAsync(key, value)
}

export async function clearSecret(key: string): Promise<void> {
  if (isWeb) await AsyncStorage.removeItem(key)
  else await SecureStore.deleteItemAsync(key)
}
