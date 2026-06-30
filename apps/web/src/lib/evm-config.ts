/**
 * EVM / Sepolia config for the WDK-powered Flicky.
 *
 * Replaces the old Sui `config.ts`. Source of truth for the deployed
 * addresses is `apps/duel-evm/deployed.json`. Override via VITE_* env.
 *
 * Chain: Ethereum Sepolia (chainId 11155111). Gas is paid in Sepolia ETH;
 * stakes/payouts are in mock USD₮ (ERC-20, 6 decimals). The WDK EVM wallet
 * holds the user's keys (self-custodial).
 */

export const EVM_CONFIG = {
  chainId: 11155111,
  rpcUrl:
    import.meta.env.VITE_EVM_RPC_URL ??
    "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",

  /** FlickyDuel escrow contract. */
  duelAddress:
    import.meta.env.VITE_DUEL_ADDRESS ??
    "0x045Ad96EB24CE29f02C4E41542507DE26FE13895",

  /** Mock USD₮ ERC-20 (stake token, 6 decimals, open mint faucet). */
  usdtAddress:
    import.meta.env.VITE_USDT_ADDRESS ??
    "0x4802B35fFE360CAcF7bc22702544DDA207b950A3",

  serverHttpUrl:
    import.meta.env.VITE_SERVER_HTTP_URL || "http://localhost:3001",
  serverWsUrl: import.meta.env.VITE_SERVER_WS_URL || "ws://localhost:3001/ws",

  /** USD₮ has 6 decimals. 1 USD₮ = 1e6. */
  USDT_DECIMALS: 6,
  ONE_USDT: 1_000_000n,

  /** On-chain probability scale (PROB_SCALE in FlickyDuel). 1.0 == 1e9. */
  PROB_SCALE: 1_000_000_000n,

  /** Stake tiers in USD₮ base units (1 / 3 / 5 / 10 USD₮). */
  stakeTiers: [1_000_000n, 3_000_000n, 5_000_000n, 10_000_000n] as const,

  /** Default stake = 5 USD₮ (matches the original entry gate). */
  defaultStake: 5_000_000n,
} as const

/** BIP-44 derivation path style used by WDK EVM accounts. */
export const DERIVATION_PATH = "0'/0/0"

/** localStorage key for the (testnet) WDK seed phrase. */
export const SEED_STORAGE_KEY = "flicky.wdk.seed"
