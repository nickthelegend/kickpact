import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useWdkWallet } from "@/wdk/wallet"
import { getUsdtBalance } from "@/lib/duel-contract"
import { EVM_CONFIG } from "@/lib/evm-config"

const BALANCE_ROOT_KEY = "wallet-balance"
const MANAGER_BALANCE_KEY = "manager-balance"

/**
 * Live balance hooks backed by react-query (EVM / WDK).
 *
 * Migrated from Sui: the player's self-custodial WDK wallet now holds USD₮
 * (ERC-20, the stake asset) and Sepolia ETH (gas). Hook names + return shapes
 * are preserved so the UI (header chips, profile stats, deposit modal) is
 * untouched — only the data source changed.
 *
 * Polls every 5s and shares cache across consumers. Call
 * useInvalidateWalletBalances() after any action that should refresh.
 */

/** Generic balance reader. coinType is accepted for call-site compatibility;
 *  the ETH sentinel returns native gas balance, anything else returns USD₮. */
export function useWalletBalance(coinType: string) {
  const { address, provider } = useWdkWallet()
  return useQuery({
    queryKey: [BALANCE_ROOT_KEY, address ?? null, coinType],
    queryFn: async () => {
      if (!address) return 0
      if (coinType === "ETH") {
        const wei = await provider.getBalance(address)
        return Number(wei) / 1e18
      }
      const raw = await getUsdtBalance(provider, address)
      return Number(raw) / Number(EVM_CONFIG.ONE_USDT)
    },
    enabled: !!address,
    refetchInterval: 5_000,
    staleTime: 2_000,
  })
}

/** Native gas balance (Sepolia ETH). Kept under the old name for the UI. */
export function useSuiBalance() {
  return useWalletBalance("ETH")
}

/** USD₮ wallet balance — the stakeable asset. */
export function useDusdcBalance() {
  return useWalletBalance("USDT")
}

export function useInvalidateWalletBalances() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === BALANCE_ROOT_KEY ||
        q.queryKey[0] === MANAGER_BALANCE_KEY,
    })
}

/**
 * Stakeable USD₮ balance. On Sui this read a separate PredictManager; on EVM
 * the wallet holds USD₮ directly, so `managerId` is just the wallet address
 * (kept non-null to preserve the "ready to stake" UI gate) and `balance` is
 * the wallet's USD₮ balance in human units.
 */
export function useManagerBalance() {
  const { address, provider } = useWdkWallet()
  return useQuery({
    queryKey: [MANAGER_BALANCE_KEY, address ?? null],
    queryFn: async () => {
      if (!address) return { managerId: null as string | null, balance: 0 }
      const raw = await getUsdtBalance(provider, address)
      return {
        managerId: address,
        balance: Number(raw) / Number(EVM_CONFIG.ONE_USDT),
      }
    },
    enabled: !!address,
    refetchInterval: 5_000,
    staleTime: 2_000,
  })
}
