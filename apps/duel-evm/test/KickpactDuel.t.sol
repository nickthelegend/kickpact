// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KickpactDuel} from "../src/KickpactDuel.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

contract KickpactDuelTest is Test {
    KickpactDuel duel;
    MockUSDT usdt;

    address oracle = address(0x0AC1E);
    address alice = address(0xA11CE); // creator / player0
    address bob = address(0xB0B); // challenger / player1

    uint64 constant SCALE = 1_000_000_000;
    uint128 constant Q = 1_000_000_000;
    uint128 constant STAKE = 5_000_000; // 5 USD₮ (6 decimals)
    bytes32 constant SALT = keccak256("salt");

    function setUp() public {
        usdt = new MockUSDT();
        duel = new KickpactDuel(oracle, address(usdt));
        _fund(alice);
        _fund(bob);
    }

    // --- helpers ---

    function _fund(address who) internal {
        usdt.mint(who, 1_000_000_000); // 1000 USD₮
        vm.prank(who);
        usdt.approve(address(duel), type(uint256).max);
    }

    /// 2-card deck. Card 0: strike 100, probUp 0.30 (contrarian YES). Card 1:
    /// strike 200, probUp 0.80 (consensus YES).
    function _deck() internal pure returns (KickpactDuel.Card[] memory cards) {
        cards = new KickpactDuel.Card[](2);
        cards[0] = KickpactDuel.Card({strike: 100, probUp: 300_000_000});
        cards[1] = KickpactDuel.Card({strike: 200, probUp: 800_000_000});
    }

    // Pure local hash — must NOT call the contract, or it would consume a
    // pending vm.prank when used as a call argument.
    function _commit(KickpactDuel.Card[] memory cards) internal pure returns (bytes32) {
        return keccak256(abi.encode(cards, SALT));
    }

    function _createJoinReveal() internal returns (uint256 id, KickpactDuel.Card[] memory cards) {
        cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        id = duel.createDuel(STAKE, c);
        vm.prank(bob);
        duel.joinDuel(id);
        vm.prank(oracle);
        duel.revealDeck(id, cards, SALT);
    }

    // --- lifecycle ---

    function test_FullLifecycle_AliceWinsContrarian() public {
        (uint256 id, ) = _createJoinReveal();

        vm.startPrank(alice);
        duel.recordSwipe(id, 0, true);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();

        vm.startPrank(bob);
        duel.recordSwipe(id, 0, false);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();

        vm.startPrank(oracle);
        duel.settleCard(id, 0, 150); // UP
        duel.settleCard(id, 1, 250); // UP
        vm.stopPrank();

        uint256 aliceBefore = usdt.balanceOf(alice);
        uint256 bobBefore = usdt.balanceOf(bob);
        duel.finalize(id);

        // Alice correct on both (incl. the cheap contrarian card) → takes pot.
        assertEq(usdt.balanceOf(alice) - aliceBefore, 2 * STAKE, "alice takes pot");
        assertEq(usdt.balanceOf(bob), bobBefore, "bob gets nothing");
        assertEq(duel.getDuel(id).status, 3, "complete");
    }

    function test_Tie_SplitsPot() public {
        (uint256 id, ) = _createJoinReveal();
        vm.startPrank(alice);
        duel.recordSwipe(id, 0, true);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();
        vm.startPrank(bob);
        duel.recordSwipe(id, 0, true);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();
        vm.startPrank(oracle);
        duel.settleCard(id, 0, 150);
        duel.settleCard(id, 1, 250);
        vm.stopPrank();

        uint256 a = usdt.balanceOf(alice);
        uint256 b = usdt.balanceOf(bob);
        duel.finalize(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "alice refunded stake");
        assertEq(usdt.balanceOf(bob) - b, STAKE, "bob refunded stake");
    }

    function test_Forfeit_OnTimeout_WhenOnePlayerSwipedMore() public {
        (uint256 id, ) = _createJoinReveal();
        vm.startPrank(alice);
        duel.recordSwipe(id, 0, true);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();

        vm.warp(block.timestamp + 601);
        uint256 a = usdt.balanceOf(alice);
        duel.finalize(id);
        assertEq(usdt.balanceOf(alice) - a, 2 * STAKE, "alice wins by forfeit");
    }

    function test_Refund_BothStuck_AfterTimeout() public {
        (uint256 id, ) = _createJoinReveal();
        vm.prank(alice);
        duel.recordSwipe(id, 0, true);
        vm.prank(bob);
        duel.recordSwipe(id, 0, false);

        vm.expectRevert(KickpactDuel.SwipesNotComplete.selector);
        duel.finalize(id);

        vm.warp(block.timestamp + 601);
        uint256 a = usdt.balanceOf(alice);
        uint256 b = usdt.balanceOf(bob);
        duel.finalize(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "alice refunded");
        assertEq(usdt.balanceOf(bob) - b, STAKE, "bob refunded");
    }

    function test_PendingCreatorRefund() public {
        KickpactDuel.Card[] memory cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        uint256 id = duel.createDuel(STAKE, c);
        uint256 a = usdt.balanceOf(alice);
        vm.prank(alice);
        duel.refundDuel(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "creator refunded before join");
    }

    function test_ClaimRevealTimeout() public {
        KickpactDuel.Card[] memory cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        uint256 id = duel.createDuel(STAKE, c);
        vm.prank(bob);
        duel.joinDuel(id);
        vm.warp(block.timestamp + 301);
        uint256 b = usdt.balanceOf(bob);
        vm.prank(bob);
        duel.claimRevealTimeout(id);
        assertEq(usdt.balanceOf(bob) - b, 2 * STAKE, "bob claims stalled pot");
    }

    // --- reverts ---

    function test_RevertWhen_DeckHashMismatch() public {
        KickpactDuel.Card[] memory cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        uint256 id = duel.createDuel(STAKE, c);
        vm.prank(bob);
        duel.joinDuel(id);
        cards[0].strike = 999; // tamper
        vm.prank(oracle);
        vm.expectRevert(KickpactDuel.DeckHashMismatch.selector);
        duel.revealDeck(id, cards, SALT);
    }

    function test_RevertWhen_CreatorJoinsOwnDuel() public {
        KickpactDuel.Card[] memory cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        uint256 id = duel.createDuel(STAKE, c);
        vm.prank(alice);
        vm.expectRevert(KickpactDuel.CreatorCannotJoin.selector);
        duel.joinDuel(id);
    }

    function test_RevertWhen_SwipeOutOfTurn() public {
        (uint256 id, ) = _createJoinReveal();
        vm.prank(alice);
        vm.expectRevert(KickpactDuel.OutOfTurn.selector);
        duel.recordSwipe(id, 1, true);
    }

    function test_RevertWhen_NonOracleSettles() public {
        (uint256 id, ) = _createJoinReveal();
        vm.prank(alice);
        vm.expectRevert(KickpactDuel.NotOracle.selector);
        duel.settleCard(id, 0, 150);
    }

    function test_FreeTier_NoStake() public {
        KickpactDuel.Card[] memory cards = _deck();
        bytes32 c = _commit(cards);
        vm.prank(alice);
        uint256 id = duel.createDuelFree(c);
        vm.prank(bob);
        duel.joinDuel(id);
        vm.prank(oracle);
        duel.revealDeck(id, cards, SALT);
        vm.startPrank(alice);
        duel.recordSwipe(id, 0, true);
        duel.recordSwipe(id, 1, true);
        vm.stopPrank();
        vm.startPrank(bob);
        duel.recordSwipe(id, 0, false);
        duel.recordSwipe(id, 1, false);
        vm.stopPrank();
        vm.startPrank(oracle);
        duel.settleCard(id, 0, 150);
        duel.settleCard(id, 1, 250);
        vm.stopPrank();
        duel.finalize(id);
        assertEq(duel.getDuel(id).status, 3, "free duel completes");
    }
}
