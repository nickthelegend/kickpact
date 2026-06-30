/**
 * On-chain config for the mobile app — Sepolia + the deployed FlickyDuel /
 * MockUSDT (same contracts as the web app). Source of truth:
 * apps/duel-evm/deployed.json.
 */
export const CHAIN = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  duelAddress: "0x045Ad96EB24CE29f02C4E41542507DE26FE13895",
  usdtAddress: "0x4802B35fFE360CAcF7bc22702544DDA207b950A3",
  USDT_DECIMALS: 6,
  ONE_USDT: 1_000_000n,
  PROB_SCALE: 1_000_000_000n,
  /** Stake tiers in USD₮ base units (1 / 3 / 5 / 10). */
  stakeTiers: [1_000_000n, 3_000_000n, 5_000_000n, 10_000_000n] as const,
} as const

export const FLICKY_DUEL_ABI = [
  "function createDuel(uint128 stake, bytes32 deckCommitment) returns (uint256 duelId)",
  "function createDuelFree(bytes32 deckCommitment) returns (uint256 duelId)",
  "function joinDuel(uint256 duelId)",
  "function revealDeck(uint256 duelId, tuple(uint256 strike, uint64 probUp)[] cards, bytes32 salt)",
  "function recordSwipe(uint256 duelId, uint256 cardIdx, bool isUp)",
  "function settleCard(uint256 duelId, uint256 cardIdx, uint256 settlementPrice)",
  "function finalize(uint256 duelId)",
  "function refundDuel(uint256 duelId)",
  "function claimRevealTimeout(uint256 duelId)",
  "function nextDuelId() view returns (uint256)",
  "function getCard(uint256 duelId, uint256 cardIdx) view returns (tuple(uint256 strike, uint64 probUp))",
  "function getSwipes(uint256 duelId, uint256 cardIdx) view returns (tuple(bool exists, bool isUp, uint64 pSwiped, uint128 quantity) p0, tuple(bool exists, bool isUp, uint64 pSwiped, uint128 quantity) p1)",
  "function getDuel(uint256 duelId) view returns (tuple(uint8 status, uint8 tier, address creator, address challenger, uint128 p0Stake, uint128 p1Stake, bytes32 deckCommitment, uint64 deckSize, uint64 startedAt, uint64 settledCount, uint64 p0Next, uint64 p1Next, uint128 p0Payout, uint128 p0Premium, uint128 p1Payout, uint128 p1Premium, tuple(uint256 strike, uint64 probUp)[] cards))",
  "event DuelCreated(uint256 indexed duelId, address indexed creator, uint8 tier, uint128 stake, bytes32 deckCommitment)",
  "event DuelJoined(uint256 indexed duelId, address indexed challenger, uint64 startedAt)",
  "event SwipeRecorded(uint256 indexed duelId, address indexed player, uint256 cardIdx, bool isUp, uint64 pSwiped)",
  "event DuelFinalized(uint256 indexed duelId, address winner, uint256 payoutToP0, uint256 payoutToP1)",
] as const

export const USDT_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const

export const DUEL_STATUS = { PENDING: 1, ACTIVE: 2, COMPLETE: 3 } as const

export function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""
}

export function explorerTx(hash: string): string {
  return `${CHAIN.explorer}/tx/${hash}`
}
