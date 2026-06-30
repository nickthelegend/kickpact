/**
 * Human-readable ABIs (ethers format) for the deployed contracts.
 * Mirrors `apps/duel-evm/src/{FlickyDuel,MockUSDT}.sol`.
 */

export const FLICKY_DUEL_ABI = [
  // --- lifecycle (writes) ---
  "function createDuel(uint128 stake, bytes32 deckCommitment) returns (uint256 duelId)",
  "function createDuelFree(bytes32 deckCommitment) returns (uint256 duelId)",
  "function joinDuel(uint256 duelId)",
  "function revealDeck(uint256 duelId, tuple(uint256 strike, uint64 probUp)[] cards, bytes32 salt)",
  "function recordSwipe(uint256 duelId, uint256 cardIdx, bool isUp)",
  "function settleCard(uint256 duelId, uint256 cardIdx, uint256 settlementPrice)",
  "function finalize(uint256 duelId)",
  "function refundDuel(uint256 duelId)",
  "function claimRevealTimeout(uint256 duelId)",
  // --- reads ---
  "function nextDuelId() view returns (uint256)",
  "function oracle() view returns (address)",
  "function stakeToken() view returns (address)",
  "function cardSettled(uint256, uint256) view returns (bool)",
  "function cardSettlementPrice(uint256, uint256) view returns (uint256)",
  "function getCard(uint256 duelId, uint256 cardIdx) view returns (tuple(uint256 strike, uint64 probUp))",
  "function getSwipes(uint256 duelId, uint256 cardIdx) view returns (tuple(bool exists, bool isUp, uint64 pSwiped, uint128 quantity) p0, tuple(bool exists, bool isUp, uint64 pSwiped, uint128 quantity) p1)",
  "function getDuel(uint256 duelId) view returns (tuple(uint8 status, uint8 tier, address creator, address challenger, uint128 p0Stake, uint128 p1Stake, bytes32 deckCommitment, uint64 deckSize, uint64 startedAt, uint64 settledCount, uint64 p0Next, uint64 p1Next, uint128 p0Payout, uint128 p0Premium, uint128 p1Payout, uint128 p1Premium, tuple(uint256 strike, uint64 probUp)[] cards))",
  "function deckCommitmentHash(tuple(uint256 strike, uint64 probUp)[] cards, bytes32 salt) pure returns (bytes32)",
  // --- events ---
  "event DuelCreated(uint256 indexed duelId, address indexed creator, uint8 tier, uint128 stake, bytes32 deckCommitment)",
  "event DuelJoined(uint256 indexed duelId, address indexed challenger, uint64 startedAt)",
  "event DeckRevealed(uint256 indexed duelId, uint64 deckSize)",
  "event SwipeRecorded(uint256 indexed duelId, address indexed player, uint256 cardIdx, bool isUp, uint64 pSwiped)",
  "event CardSettled(uint256 indexed duelId, uint256 cardIdx, uint256 settlementPrice, bool actualUp, uint128 p0Payout, uint128 p0Premium, uint128 p1Payout, uint128 p1Premium)",
  "event DuelFinalized(uint256 indexed duelId, address winner, uint256 payoutToP0, uint256 payoutToP1)",
  "event DuelForfeited(uint256 indexed duelId, address winner)",
  "event DuelRefunded(uint256 indexed duelId)",
] as const

export const USDT_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const

/** Duel status enum (mirrors FlickyDuel constants). */
export const DUEL_STATUS = { PENDING: 1, ACTIVE: 2, COMPLETE: 3 } as const

/** Tier enum. */
export const DUEL_TIER = { STAKED: 1, FREE: 2 } as const
