// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title KickpactPools — friendly group pools on a match, held by the contract
/// @notice A watch-party pot: friends in a P2P match room each lock the SAME
///         USD₮ stake and pick an outcome (home / draw / away). After the
///         match, the arbiter (the settle-keeper, recomputing the official
///         result) posts the outcome and the pot splits equally among everyone
///         who called it. Nobody holds the money — the contract does.
///
///   - no winners → every member reclaims their stake (full refund)
///   - never settled → after a grace period every member can self-refund
///   - picks are locked at kickoff (`deadline`); joining closes then too
contract KickpactPools {
    uint8 public constant OUTCOME_HOME = 1;
    uint8 public constant OUTCOME_DRAW = 2;
    uint8 public constant OUTCOME_AWAY = 3;
    uint256 public constant MAX_MEMBERS = 50; // bounds the settle loop
    uint256 public constant REFUND_GRACE = 3 days; // after deadline, if unsettled

    struct Pool {
        address creator;
        bytes32 gameKey; // keccak256("WC#<matchId>") — shared with the keeper
        address arbiter; // the settle-keeper
        uint128 stake; // per-member, USD₮ (6dp)
        uint64 deadline; // kickoff — joins & picks close here
        uint8 result; // 0 until settled
        bool settled;
        uint32 winners; // count of correct picks, set at settle
        uint32 paid; // winners paid so far (dust → last claimer)
        address[] members;
    }

    IERC20 public immutable stakeToken;
    uint256 public nextPoolId = 1;
    mapping(uint256 => Pool) private pools;
    mapping(uint256 => mapping(address => uint8)) public pickOf; // 0 = not a member
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(bytes32 => uint256[]) private poolsByGame;
    uint256 private _locked = 1;

    event PoolCreated(uint256 indexed poolId, address indexed creator, bytes32 indexed gameKey, address arbiter, uint128 stake, uint64 deadline);
    event PoolJoined(uint256 indexed poolId, address indexed member, uint8 pick);
    event PoolSettled(uint256 indexed poolId, uint8 result, uint32 winners, uint256 pot);
    event PoolClaimed(uint256 indexed poolId, address indexed member, uint256 amount);
    event PoolRefunded(uint256 indexed poolId, address indexed member, uint256 amount);

    error ZeroStake();
    error BadPick();
    error BadDeadline();
    error PoolFull();
    error NotOpen();
    error AlreadyMember();
    error NotMember();
    error NotArbiter();
    error NotSettled();
    error AlreadySettled();
    error AlreadyClaimed();
    error NotWinner();
    error NotExpired();
    error NotCreator();
    error NotEmpty();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _stakeToken) {
        stakeToken = IERC20(_stakeToken);
    }

    /// @notice Open a pool for a match and lock your stake with your pick.
    ///         Approve this contract for `stake` USD₮ first.
    function createPool(
        bytes32 gameKey,
        address arbiter,
        uint128 stake,
        uint64 deadline,
        uint8 pick
    ) external returns (uint256 poolId) {
        if (stake == 0) revert ZeroStake();
        if (pick < OUTCOME_HOME || pick > OUTCOME_AWAY) revert BadPick();
        if (deadline <= block.timestamp) revert BadDeadline();
        poolId = nextPoolId++;
        Pool storage p = pools[poolId];
        p.creator = msg.sender;
        p.gameKey = gameKey;
        p.arbiter = arbiter;
        p.stake = stake;
        p.deadline = deadline;
        p.members.push(msg.sender);
        pickOf[poolId][msg.sender] = pick;
        poolsByGame[gameKey].push(poolId);
        _pull(msg.sender, stake);
        emit PoolCreated(poolId, msg.sender, gameKey, arbiter, stake, deadline);
        emit PoolJoined(poolId, msg.sender, pick);
    }

    /// @notice Join before kickoff: lock the same stake and your pick.
    function joinPool(uint256 poolId, uint8 pick) external {
        Pool storage p = pools[poolId];
        if (p.creator == address(0) || p.settled || block.timestamp >= p.deadline) revert NotOpen();
        if (pick < OUTCOME_HOME || pick > OUTCOME_AWAY) revert BadPick();
        if (pickOf[poolId][msg.sender] != 0) revert AlreadyMember();
        if (p.members.length >= MAX_MEMBERS) revert PoolFull();
        p.members.push(msg.sender);
        pickOf[poolId][msg.sender] = pick;
        _pull(msg.sender, p.stake);
        emit PoolJoined(poolId, msg.sender, pick);
    }

    /// @notice The arbiter posts the official result after kickoff.
    function settle(uint256 poolId, uint8 result) external {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert NotOpen();
        if (msg.sender != p.arbiter) revert NotArbiter();
        if (p.settled) revert AlreadySettled();
        if (result < OUTCOME_HOME || result > OUTCOME_AWAY) revert BadPick();
        if (block.timestamp < p.deadline) revert NotExpired();
        // after the refund grace, members may have self-refunded — settling
        // then could pay winners from a partially-drained pot. Hard cutoff.
        if (block.timestamp > uint256(p.deadline) + REFUND_GRACE) revert NotOpen();
        p.settled = true;
        p.result = result;
        uint32 w = 0;
        uint256 n = p.members.length;
        for (uint256 i = 0; i < n; i++) {
            if (pickOf[poolId][p.members[i]] == result) w++;
        }
        p.winners = w;
        emit PoolSettled(poolId, result, w, uint256(p.stake) * n);
    }

    /// @notice Winners take their equal share of the pot (dust goes to the
    ///         last claimer). If nobody called it, every member reclaims
    ///         their own stake.
    function claim(uint256 poolId) external nonReentrant {
        Pool storage p = pools[poolId];
        if (!p.settled) revert NotSettled();
        if (pickOf[poolId][msg.sender] == 0) revert NotMember();
        if (claimed[poolId][msg.sender]) revert AlreadyClaimed();
        uint256 pot = uint256(p.stake) * p.members.length;
        uint256 amount;
        if (p.winners == 0) {
            amount = p.stake; // no winner → refund everyone
        } else {
            if (pickOf[poolId][msg.sender] != p.result) revert NotWinner();
            uint256 share = pot / p.winners;
            p.paid++;
            // last winner sweeps the rounding dust
            amount = (p.paid == p.winners) ? pot - share * (p.winners - 1) : share;
        }
        claimed[poolId][msg.sender] = true;
        _pay(msg.sender, amount);
        emit PoolClaimed(poolId, msg.sender, amount);
    }

    /// @notice Creator can cancel a pool nobody else joined (before kickoff).
    function cancelPool(uint256 poolId) external nonReentrant {
        Pool storage p = pools[poolId];
        if (msg.sender != p.creator) revert NotCreator();
        if (p.settled) revert AlreadySettled();
        if (p.members.length != 1) revert NotEmpty();
        p.settled = true; // terminal: nothing further
        p.winners = 0;
        claimed[poolId][msg.sender] = true;
        _pay(msg.sender, p.stake);
        emit PoolRefunded(poolId, msg.sender, p.stake);
    }

    /// @notice If the arbiter never settles, members self-refund after grace.
    function refundExpired(uint256 poolId) external nonReentrant {
        Pool storage p = pools[poolId];
        if (p.settled) revert AlreadySettled();
        if (block.timestamp <= uint256(p.deadline) + REFUND_GRACE) revert NotExpired();
        if (pickOf[poolId][msg.sender] == 0) revert NotMember();
        if (claimed[poolId][msg.sender]) revert AlreadyClaimed();
        claimed[poolId][msg.sender] = true;
        _pay(msg.sender, p.stake);
        emit PoolRefunded(poolId, msg.sender, p.stake);
    }

    // ── views ──────────────────────────────────────────────────────────────

    function getPool(uint256 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    function membersOf(uint256 poolId) external view returns (address[] memory) {
        return pools[poolId].members;
    }

    function poolsForGame(bytes32 gameKey) external view returns (uint256[] memory) {
        return poolsByGame[gameKey];
    }

    /// @notice The deterministic key the app + keeper share for a match.
    function gameKeyOf(string calldata matchTag) external pure returns (bytes32) {
        return keccak256(bytes(matchTag));
    }

    // ── token plumbing (USDT-safe: tolerates no-return ERC20s) ────────────

    function _pull(address from, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(stakeToken).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(stakeToken).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
