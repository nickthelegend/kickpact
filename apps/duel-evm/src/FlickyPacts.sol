// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title FlickyPacts — self-custodial P2P friend bets on any outcome
/// @notice "If Brazil scores first, you owe me 2 USD₮." Two friends each lock
///         an equal USD₮ stake in escrow against a stated outcome. When the
///         outcome is known, the winner is paid the whole pot and the loser's
///         escrowed stake is auto-released to the winner — no custodian, no
///         KYC, no exchange. Pure on-chain self-custody.
///
/// Resolution (pick whichever the friends prefer at create time):
///   1. **Mutual** — both sides call `agree(winner)`; when they agree, it pays.
///      Fully trustless between the two friends.
///   2. **Arbiter** — a mutually-trusted third party (or oracle) set at create
///      time calls `resolveByArbiter(winner)`.
/// Safety: proposer can `cancel` before it's accepted; after `deadline` an
/// unresolved pact is refundable to both.
contract FlickyPacts {
    uint8 constant STATUS_PROPOSED = 1;
    uint8 constant STATUS_ACTIVE = 2;
    uint8 constant STATUS_RESOLVED = 3;
    uint8 constant STATUS_REFUNDED = 4;

    struct Pact {
        address proposer;
        address counterparty;
        address arbiter; // address(0) = mutual-agreement only
        uint128 stake; // per-side, USD₮
        uint8 status;
        address winner; // set on resolve (address(0) until then / on void)
        bytes32 terms; // keccak256 of the human-readable terms
        uint64 deadline; // after this, an unresolved pact is refundable
        address p0Vote; // proposer's agreed winner
        address p1Vote; // counterparty's agreed winner
        bool p0Voted;
        bool p1Voted;
    }

    IERC20 public immutable stakeToken;
    uint256 public nextPactId = 1;
    mapping(uint256 => Pact) private pacts;
    uint256 private _locked = 1;

    event PactCreated(uint256 indexed pactId, address indexed proposer, address indexed counterparty, address arbiter, uint128 stake, bytes32 terms, uint64 deadline);
    event PactAccepted(uint256 indexed pactId, address indexed counterparty);
    event PactVoted(uint256 indexed pactId, address indexed voter, address winner);
    event PactResolved(uint256 indexed pactId, address indexed winner, uint256 payout, bool byArbiter);
    event PactVoided(uint256 indexed pactId);
    event PactRefunded(uint256 indexed pactId);

    error NotProposer();
    error NotCounterparty();
    error NotParticipant();
    error NotArbiter();
    error NoArbiter();
    error BadCounterparty();
    error ZeroStake();
    error NotProposed();
    error NotActive();
    error BadWinner();
    error NotExpired();
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

    /// @notice Propose a pact and lock your stake. Approve this contract for
    ///         `stake` USD₮ first. `arbiter` may be address(0) for mutual-only.
    function createPact(
        address counterparty,
        address arbiter,
        uint128 stake,
        bytes32 terms,
        uint64 deadline
    ) external returns (uint256 pactId) {
        if (stake == 0) revert ZeroStake();
        if (counterparty == address(0) || counterparty == msg.sender) revert BadCounterparty();
        pactId = nextPactId++;
        Pact storage p = pacts[pactId];
        p.proposer = msg.sender;
        p.counterparty = counterparty;
        p.arbiter = arbiter;
        p.stake = stake;
        p.status = STATUS_PROPOSED;
        p.terms = terms;
        p.deadline = deadline;
        _pull(msg.sender, stake);
        emit PactCreated(pactId, msg.sender, counterparty, arbiter, stake, terms, deadline);
    }

    /// @notice Accept a pact as the named counterparty and lock your stake.
    function acceptPact(uint256 pactId) external {
        Pact storage p = pacts[pactId];
        if (p.status != STATUS_PROPOSED) revert NotProposed();
        if (msg.sender != p.counterparty) revert NotCounterparty();
        p.status = STATUS_ACTIVE;
        _pull(msg.sender, p.stake);
        emit PactAccepted(pactId, msg.sender);
    }

    /// @notice Both participants vote on the winner. When both agree, the pot
    ///         pays out (or refunds both if they agree it's a void/tie via
    ///         winner == address(0)).
    function agree(uint256 pactId, address winner) external nonReentrant {
        Pact storage p = pacts[pactId];
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (winner != p.proposer && winner != p.counterparty && winner != address(0)) revert BadWinner();
        if (msg.sender == p.proposer) {
            p.p0Vote = winner;
            p.p0Voted = true;
        } else if (msg.sender == p.counterparty) {
            p.p1Vote = winner;
            p.p1Voted = true;
        } else {
            revert NotParticipant();
        }
        emit PactVoted(pactId, msg.sender, winner);

        if (p.p0Voted && p.p1Voted && p.p0Vote == p.p1Vote) {
            if (winner == address(0)) _void(pactId, p);
            else _payout(pactId, p, winner, false);
        }
    }

    /// @notice The mutually-trusted arbiter declares the winner.
    function resolveByArbiter(uint256 pactId, address winner) external nonReentrant {
        Pact storage p = pacts[pactId];
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (p.arbiter == address(0)) revert NoArbiter();
        if (msg.sender != p.arbiter) revert NotArbiter();
        if (winner != p.proposer && winner != p.counterparty) revert BadWinner();
        _payout(pactId, p, winner, true);
    }

    /// @notice Proposer cancels before anyone accepts → full refund.
    function cancelPact(uint256 pactId) external nonReentrant {
        Pact storage p = pacts[pactId];
        if (p.status != STATUS_PROPOSED) revert NotProposed();
        if (msg.sender != p.proposer) revert NotProposer();
        p.status = STATUS_REFUNDED;
        _pay(p.proposer, p.stake);
        emit PactRefunded(pactId);
    }

    /// @notice After the deadline, an unresolved pact refunds both sides
    ///         (or just the proposer if never accepted). Permissionless.
    function refundExpired(uint256 pactId) external nonReentrant {
        Pact storage p = pacts[pactId];
        if (block.timestamp <= p.deadline) revert NotExpired();
        if (p.status == STATUS_PROPOSED) {
            p.status = STATUS_REFUNDED;
            _pay(p.proposer, p.stake);
            emit PactRefunded(pactId);
        } else if (p.status == STATUS_ACTIVE) {
            _void(pactId, p);
        } else {
            revert NotActive();
        }
    }

    function _payout(uint256 pactId, Pact storage p, address winner, bool byArbiter) internal {
        p.status = STATUS_RESOLVED;
        p.winner = winner;
        uint256 pot = uint256(p.stake) * 2;
        _pay(winner, pot);
        emit PactResolved(pactId, winner, pot, byArbiter);
    }

    function _void(uint256 pactId, Pact storage p) internal {
        p.status = STATUS_REFUNDED;
        uint256 stake = p.stake;
        _pay(p.proposer, stake);
        _pay(p.counterparty, stake);
        emit PactVoided(pactId);
    }

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

    function getPact(uint256 pactId) external view returns (Pact memory) {
        return pacts[pactId];
    }

    /// @notice Hash human-readable terms for on-chain commitment.
    function hashTerms(string calldata terms) external pure returns (bytes32) {
        return keccak256(bytes(terms));
    }
}
