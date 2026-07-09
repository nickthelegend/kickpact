/** Tiny async localStorage shim so the ported pact.ts (which used RN
 * AsyncStorage) works unchanged in the browser / Telegram Mini App. */
const mem = new Map<string, string>()
const ls = (): Storage | null => (typeof window !== "undefined" ? window.localStorage : null)

const AsyncStorage = {
  async getItem(k: string): Promise<string | null> {
    return ls()?.getItem(k) ?? mem.get(k) ?? null
  },
  async setItem(k: string, v: string): Promise<void> {
    try {
      ls()?.setItem(k, v)
    } catch {}
    mem.set(k, v)
  },
  async removeItem(k: string): Promise<void> {
    try {
      ls()?.removeItem(k)
    } catch {}
    mem.delete(k)
  },
}
export default AsyncStorage
