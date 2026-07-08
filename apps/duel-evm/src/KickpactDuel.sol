// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title KickpactDuel — PvP binary-prediction duel escrow (USD₮ ERC-20 stakes)
/// @notice EVM port of Kickpact's Move `duel` module. Two players swipe YES/NO
///         through a commit-revealed deck of binary cards; the contract escrows
///         both players' USD₮ stakes (an ERC-20 set at deploy) and pays the
///         side-pot to whoever reads the market better. Players must `approve`
///         the duel for their stake before create/join. Gas is the chain's
///         native token (Sepolia ETH); the staked asset is USD₮.
///
/// Differences from the Sui original (no DeepBook Predict on EVM):
///   * Each card carries a keeper-set implied probability `probUp` (scaled by
///     PROB_SCALE). `p_swiped` is that probability for the swiped direction —
///     snapshotted into the swipe at record time, mirroring the SVI snapshot.
///   * Scoring is self-contained: a correct binary pays a fixed notional
///     QUANTITY; premium = QUANTITY * p_swiped / SCALE. Net PnL = payout −
///     premium, so a correct low-probability (contrarian) call nets more —
///     same economics as the README, without Predict's premium engine.
///   * Settlement prices are posted by a trusted `oracle` (the Kickpact keeper).
contract KickpactDuel {
    // === Status / tier ===
    uint8 constant STATUS_PENDING = 1;
    uint8 constant STATUS_ACTIVE = 2;
    uint8 constant STATUS_COMPLETE = 3;

    uint8 constant TIER_STAKED = 1;
    uint8 constant TIER_FREE = 2;

    // === Bounds & scaling (mirror the Move constants) ===
    uint64 constant MIN_DECK_SIZE = 1;
    uint64 constant MAX_DECK_SIZE = 20;
    uint64 constant PROB_SCALE = 1_000_000_000; // 1e9
    /// Fixed per-card notional used for scoring. Independent of the escrowed
    /// side-pot — the duel pot and a player's individual PnL are separate
    /// ledgers, exactly as in the original.
    uint128 constant QUANTITY = 1_000_000_000; // 1e9 units

    uint64 constant SWIPE_WINDOW = 600; // 10 min
    uint64 constant REFUND_TIMEOUT = 3600; // 1 hour
    uint64 constant REVEAL_TIMEOUT = 300; // 5 min — challenger can claim forfeit

    // === Types ===
    struct Card {
        uint256 strike; // settlement_price > strike => actual_up
        uint64 probUp; // implied P(up), scaled by PROB_SCALE, in (0, SCALE)
    }

    struct Swipe {
        bool exists;
        bool isUp;
        uint64 pSwiped; // probability of the swiped direction at record time
        uint128 quantity;
    }

    struct Duel {
        uint8 status;
        uint8 tier;
        address creator;
        address challenger;
        uint128 p0Stake;
        uint128 p1Stake;
        bytes32 deckCommitment;
        uint64 deckSize; // 0 until reveal
        uint64 startedAt; // set on join (ACTIVE)
        uint64 settledCount;
        uint64 p0Next; // next card index player0 must swipe
        uint64 p1Next;
        // Aggregated PnL, accumulated per settleCard (unsigned; compared via
        // the subtraction-less trick in finalize).
        uint128 p0Payout;
        uint128 p0Premium;
        uint128 p1Payout;
        uint128 p1Premium;
        Card[] cards;
    }

    // === Storage ===
    address public immutable oracle; // keeper that reveals decks & settles cards
    IERC20 public immutable stakeToken; // USD₮ — the staked/escrowed asset
    uint256 public nextDuelId = 1;

    mapping(uint256 => Duel) private duels;
    mapping(uint256 => mapping(uint256 => bool)) public cardSettled;
    mapping(uint256 => mapping(uint256 => uint256)) public cardSettlementPrice;
    mapping(uint256 => mapping(uint256 => Swipe)) private p0Swipes;
    mapping(uint256 => mapping(uint256 => Swipe)) private p1Swipes;

    uint256 private _locked = 1;

    // === Events ===
    event DuelCreated(uint256 indexed duelId, address indexed creator, uint8 tier, uint128 stake, bytes32 deckCommitment);
    event DuelJoined(uint256 indexed duelId, address indexed challenger, uint64 startedAt);
    event DeckRevealed(uint256 indexed duelId, uint64 deckSize);
    event SwipeRecorded(uint256 indexed duelId, address indexed player, uint256 cardIdx, bool isUp, uint64 pSwiped);
    event CardSettled(uint256 indexed duelId, uint256 cardIdx, uint256 settlementPrice, bool actualUp, uint128 p0Payout, uint128 p0Premium, uint128 p1Payout, uint128 p1Premium);
    event DuelFinalized(uint256 indexed duelId, address winner, uint256 payoutToP0, uint256 payoutToP1);
    event DuelRefunded(uint256 indexed duelId);
    event DuelForfeited(uint256 indexed duelId, address winner);

    // === Errors ===
    error NotOracle();
    error NotPlayer();
    error DuelNotPending();
    error DuelNotActive();
    error AlreadyJoined();
    error CreatorCannotJoin();
    error StakeMismatch();
    error WrongTier();
    error ZeroStake();
    error InvalidDeckSize();
    error DeckAlreadyRevealed();
    error DeckNotRevealed();
    error DeckHashMismatch();
    error InvalidProb();
    error CardIndexOOB();
    error OutOfTurn();
    error AlreadySettled();
    error AllCardsNotSettled();
    error SwipesNotComplete();
    error RevealNotTimedOut();
    error RefundNotAllowed();
    error PayoutFailed();
    error TransferFailed();
    error Reentrancy();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _oracle, address _stakeToken) {
        oracle = _oracle == address(0) ? msg.sender : _oracle;
        stakeToken = IERC20(_stakeToken);
    }

    // === Create / join ===

    /// @notice Create a staked duel, escrowing the creator's USD₮ stake.
    ///         Caller must `approve` this contract for `stake` USD₮ first.
    /// @param deckCommitment keccak256(abi.encode(Card[] cards, bytes32 salt))
    function createDuel(uint128 stake, bytes32 deckCommitment) external returns (uint256 duelId) {
        if (stake == 0) revert ZeroStake();
        duelId = _create(TIER_STAKED, deckCommitment, stake);
        _pull(msg.sender, stake);
    }

    /// @notice Create a free/practice duel (no stake). Same engine, money gated off.
    function createDuelFree(bytes32 deckCommitment) external returns (uint256 duelId) {
        duelId = _create(TIER_FREE, deckCommitment, 0);
    }

    function _create(uint8 tier, bytes32 deckCommitment, uint128 stake) internal returns (uint256 duelId) {
        duelId = nextDuelId++;
        Duel storage d = duels[duelId];
        d.status = STATUS_PENDING;
        d.tier = tier;
        d.creator = msg.sender;
        d.p0Stake = stake;
        d.deckCommitment = deckCommitment;
        emit DuelCreated(duelId, msg.sender, tier, stake, deckCommitment);
    }

    /// @notice Join a pending duel as the challenger, matching the creator's
    ///         stake. Caller must `approve` this contract for the stake first.
    function joinDuel(uint256 duelId) external {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_PENDING) revert DuelNotPending();
        if (d.challenger != address(0)) revert AlreadyJoined();
        if (msg.sender == d.creator) revert CreatorCannotJoin();
        d.challenger = msg.sender;
        d.p1Stake = d.p0Stake;
        d.status = STATUS_ACTIVE;
        d.startedAt = uint64(block.timestamp);
        if (d.tier != TIER_FREE && d.p0Stake > 0) _pull(msg.sender, d.p0Stake);
        emit DuelJoined(duelId, msg.sender, d.startedAt);
    }

    // === Reveal ===

    /// @notice Reveal the committed deck. Must hash to `deckCommitment`.
    ///         Callable by oracle or creator (the committer). After this the
    ///         deck is public and swiping can begin.
    function revealDeck(uint256 duelId, Card[] calldata cards, bytes32 salt) external {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();
        if (d.deckSize != 0) revert DeckAlreadyRevealed();
        if (msg.sender != oracle && msg.sender != d.creator) revert NotPlayer();
        uint256 n = cards.length;
        if (n < MIN_DECK_SIZE || n > MAX_DECK_SIZE) revert InvalidDeckSize();
        if (keccak256(abi.encode(cards, salt)) != d.deckCommitment) revert DeckHashMismatch();
        for (uint256 i = 0; i < n; i++) {
            uint64 p = cards[i].probUp;
            if (p == 0 || p >= PROB_SCALE) revert InvalidProb();
            d.cards.push(cards[i]);
        }
        d.deckSize = uint64(n);
        emit DeckRevealed(duelId, uint64(n));
    }

    // === Swipe ===

    /// @notice Record the caller's YES/NO swipe on their next card. Cards must
    ///         be swiped in order (0..deckSize-1). p_swiped is snapshotted from
    ///         the card's implied probability for the swiped direction.
    function recordSwipe(uint256 duelId, uint256 cardIdx, bool isUp) external {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();
        if (d.deckSize == 0) revert DeckNotRevealed();
        if (cardIdx >= d.deckSize) revert CardIndexOOB();

        bool isCreator = msg.sender == d.creator;
        bool isChallenger = msg.sender == d.challenger;
        if (!isCreator && !isChallenger) revert NotPlayer();

        Card storage card = d.cards[cardIdx];
        uint64 pSwiped = isUp ? card.probUp : uint64(PROB_SCALE - card.probUp);
        Swipe memory s = Swipe({exists: true, isUp: isUp, pSwiped: pSwiped, quantity: QUANTITY});

        if (isCreator) {
            if (cardIdx != d.p0Next) revert OutOfTurn();
            p0Swipes[duelId][cardIdx] = s;
            d.p0Next++;
        } else {
            if (cardIdx != d.p1Next) revert OutOfTurn();
            p1Swipes[duelId][cardIdx] = s;
            d.p1Next++;
        }
        emit SwipeRecorded(duelId, msg.sender, cardIdx, isUp, pSwiped);
    }

    // === Settle ===

    /// @notice Oracle posts a card's settlement price; the contract scores both
    ///         players' swipes for that card and accumulates PnL.
    function settleCard(uint256 duelId, uint256 cardIdx, uint256 settlementPrice) external onlyOracle {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();
        if (d.deckSize == 0) revert DeckNotRevealed();
        if (cardIdx >= d.deckSize) revert CardIndexOOB();
        if (cardSettled[duelId][cardIdx]) revert AlreadySettled();

        bool actualUp = settlementPrice > d.cards[cardIdx].strike;

        (uint128 p0Pay, uint128 p0Prem) = _score(p0Swipes[duelId][cardIdx], actualUp);
        (uint128 p1Pay, uint128 p1Prem) = _score(p1Swipes[duelId][cardIdx], actualUp);

        d.p0Payout += p0Pay;
        d.p0Premium += p0Prem;
        d.p1Payout += p1Pay;
        d.p1Premium += p1Prem;

        cardSettled[duelId][cardIdx] = true;
        cardSettlementPrice[duelId][cardIdx] = settlementPrice;
        d.settledCount++;

        emit CardSettled(duelId, cardIdx, settlementPrice, actualUp, p0Pay, p0Prem, p1Pay, p1Prem);
    }

    /// Score one swipe: correct binary pays the full notional; premium is what
    /// the position "cost" at the swiped probability.
    function _score(Swipe storage s, bool actualUp) internal view returns (uint128 payout, uint128 premium) {
        if (!s.exists) return (0, 0);
        premium = uint128((uint256(s.quantity) * s.pSwiped) / PROB_SCALE);
        payout = (s.isUp == actualUp) ? s.quantity : 0;
    }

    // === Finalize ===

    /// @notice Settle the pot. Permissionless. Normal path requires all cards
    ///         settled and both players to have swiped the full deck; otherwise
    ///         the timeout forfeit/refund branches apply (mirrors the Move logic).
    function finalize(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();

        uint256 total = uint256(d.p0Stake) + uint256(d.p1Stake);
        uint64 deckSize = d.deckSize;
        bool timeExpired = block.timestamp > uint256(d.startedAt) + SWIPE_WINDOW;

        uint256 payoutToP0;
        uint256 payoutToP1;
        address winner;

        if (d.p0Next != d.p1Next && timeExpired) {
            // Forfeit: one player swiped more cards than the other after timeout.
            if (d.p0Next > d.p1Next) {
                payoutToP0 = total;
                winner = d.creator;
            } else {
                payoutToP1 = total;
                winner = d.challenger;
            }
            emit DuelForfeited(duelId, winner);
        } else if (deckSize != 0 && d.p0Next == deckSize && d.p1Next == deckSize) {
            if (d.settledCount != deckSize) revert AllCardsNotSettled();
            // Subtraction-less PnL: payout0 + premium1  vs  payout1 + premium0
            uint256 val0 = uint256(d.p0Payout) + uint256(d.p1Premium);
            uint256 val1 = uint256(d.p1Payout) + uint256(d.p0Premium);
            if (val0 > val1) {
                payoutToP0 = total;
                winner = d.creator;
            } else if (val1 > val0) {
                payoutToP1 = total;
                winner = d.challenger;
            } else {
                payoutToP0 = d.p0Stake; // tie: each gets their own stake back
                payoutToP1 = d.p1Stake;
            }
        } else {
            // Both stuck mid-deck: require timeout, then refund as a tie.
            if (!timeExpired) revert SwipesNotComplete();
            payoutToP0 = d.p0Stake;
            payoutToP1 = d.p1Stake;
        }

        d.status = STATUS_COMPLETE;
        if (payoutToP0 > 0) _pay(d.creator, payoutToP0);
        if (payoutToP1 > 0) _pay(d.challenger, payoutToP1);

        emit DuelFinalized(duelId, winner, payoutToP0, payoutToP1);
    }

    // === Safety paths ===

    /// @notice PENDING: creator cancels before anyone joins → full refund.
    ///         ACTIVE: either player after REFUND_TIMEOUT, only if not both done.
    function refundDuel(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status == STATUS_PENDING) {
            if (msg.sender != d.creator) revert NotPlayer();
            d.status = STATUS_COMPLETE;
            uint256 amt = d.p0Stake;
            if (amt > 0) _pay(d.creator, amt);
            emit DuelRefunded(duelId);
            return;
        }
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();
        if (msg.sender != d.creator && msg.sender != d.challenger) revert NotPlayer();
        bool bothComplete = d.deckSize != 0 && d.p0Next == d.deckSize && d.p1Next == d.deckSize;
        if (bothComplete) revert RefundNotAllowed(); // must finalize instead
        if (block.timestamp <= uint256(d.startedAt) + REFUND_TIMEOUT) revert RefundNotAllowed();
        d.status = STATUS_COMPLETE;
        uint256 a0 = d.p0Stake;
        uint256 a1 = d.p1Stake;
        if (a0 > 0) _pay(d.creator, a0);
        if (a1 > 0) _pay(d.challenger, a1);
        emit DuelRefunded(duelId);
    }

    /// @notice If the deck is never revealed within REVEAL_TIMEOUT of going
    ///         ACTIVE, the challenger can claim the pot (creator stalled).
    function claimRevealTimeout(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != STATUS_ACTIVE) revert DuelNotActive();
        if (d.deckSize != 0) revert DeckAlreadyRevealed();
        if (msg.sender != d.challenger) revert NotPlayer();
        if (block.timestamp <= uint256(d.startedAt) + REVEAL_TIMEOUT) revert RevealNotTimedOut();
        uint256 total = uint256(d.p0Stake) + uint256(d.p1Stake);
        d.status = STATUS_COMPLETE;
        if (total > 0) _pay(d.challenger, total);
        emit DuelForfeited(duelId, d.challenger);
    }

    /// Pull `amount` USD₮ from `from` into escrow (safe: tolerates tokens that
    /// don't return a bool, like real USDT).
    function _pull(address from, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(stakeToken).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    /// Pay `amount` USD₮ out of escrow to `to` (safe wrapper).
    function _pay(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(stakeToken).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert PayoutFailed();
    }

    // === Views ===
    function getDuel(uint256 duelId) external view returns (Duel memory) {
        return duels[duelId];
    }

    function getCard(uint256 duelId, uint256 cardIdx) external view returns (Card memory) {
        return duels[duelId].cards[cardIdx];
    }

    function getSwipes(uint256 duelId, uint256 cardIdx) external view returns (Swipe memory p0, Swipe memory p1) {
        return (p0Swipes[duelId][cardIdx], p1Swipes[duelId][cardIdx]);
    }

    function deckCommitmentHash(Card[] calldata cards, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(cards, salt));
    }
}
