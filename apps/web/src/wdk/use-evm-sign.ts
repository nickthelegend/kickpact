/**
 * Single signing entrypoint for EVM transactions — the WDK replacement for
 * the old Sui `use-flicky-sign.ts`. The connected WDK account signs and sends
 * each transaction; gas is paid in Sepolia ETH from the player's own wallet
 * (self-custodial). USD₮ stakes move via the FlickyDuel contract.
 *
 * Call sites pass a `{ to, data, value }` request (see `lib/duel-contract.ts`)
 * — a smaller, EVM-native contract than the old Sui `{ transaction }` shape.
 */
import { useCallback, useState } from "react"

import { useWdkWallet } from "./wallet"
import type { TxRequest } from "@/lib/duel-contract"

export interface SendResult {
  hash: string
  fee: bigint
}

export function useEvmSign() {
  const { account } = useWdkWallet()
  const [isPending, setIsPending] = useState(false)

  const mutateAsync = useCallback(
    async (tx: TxRequest): Promise<SendResult> => {
      if (!account) throw new Error("wallet not connected")
      setIsPending(true)
      try {
        const res = await account.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ?? 0n,
        })
        return { hash: res.hash, fee: res.fee }
      } finally {
        setIsPending(false)
      }
    },
    [account],
  )

  return { mutateAsync, isPending }
}
