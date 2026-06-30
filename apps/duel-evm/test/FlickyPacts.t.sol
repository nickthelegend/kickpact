// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FlickyPacts} from "../src/FlickyPacts.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

contract FlickyPactsTest is Test {
    FlickyPacts pacts;
    MockUSDT usdt;

    address alice = address(0xA11CE); // proposer
    address bob = address(0xB0B); // counterparty
    address ref = address(0x4EF); // arbiter
    address carol = address(0xCA401); // open-room joiner

    uint128 constant STAKE = 2_000_000; // 2 USD₮
    bytes32 constant TERMS = keccak256("If Brazil scores first, you owe me 2 USDt");

    function setUp() public {
        usdt = new MockUSDT();
        pacts = new FlickyPacts(address(usdt));
        _fund(alice);
        _fund(bob);
        _fund(carol);
    }

    function _fund(address who) internal {
        usdt.mint(who, 1_000_000_000);
        vm.prank(who);
        usdt.approve(address(pacts), type(uint256).max);
    }

    function _createAccept(address arbiter) internal returns (uint256 id) {
        vm.prank(alice);
        id = pacts.createPact(bob, arbiter, STAKE, TERMS, uint64(block.timestamp + 1 days));
        vm.prank(bob);
        pacts.acceptPact(id);
    }

    function test_ArbiterResolve_PaysWinner() public {
        uint256 id = _createAccept(ref);
        uint256 aBefore = usdt.balanceOf(alice);
        vm.prank(ref);
        pacts.resolveByArbiter(id, alice);
        // alice staked 2, wins pot 4 → net +2
        assertEq(usdt.balanceOf(alice) - aBefore, 2 * STAKE, "winner gets pot");
        assertEq(pacts.getPact(id).status, 3, "resolved");
        assertEq(pacts.getPact(id).winner, alice, "winner set");
    }

    function test_MutualAgree_PaysWinner() public {
        uint256 id = _createAccept(address(0));
        uint256 bBefore = usdt.balanceOf(bob);
        vm.prank(alice);
        pacts.agree(id, bob);
        // not resolved yet (only one vote)
        assertEq(pacts.getPact(id).status, 2, "still active");
        vm.prank(bob);
        pacts.agree(id, bob);
        assertEq(usdt.balanceOf(bob) - bBefore, 2 * STAKE, "agreed winner paid");
        assertEq(pacts.getPact(id).status, 3, "resolved");
    }

    function test_MutualAgree_VoidRefundsBoth() public {
        uint256 id = _createAccept(address(0));
        uint256 a = usdt.balanceOf(alice);
        uint256 b = usdt.balanceOf(bob);
        vm.prank(alice);
        pacts.agree(id, address(0));
        vm.prank(bob);
        pacts.agree(id, address(0));
        assertEq(usdt.balanceOf(alice) - a, STAKE, "alice refunded");
        assertEq(usdt.balanceOf(bob) - b, STAKE, "bob refunded");
        assertEq(pacts.getPact(id).status, 4, "refunded");
    }

    function test_Disagreement_StaysActive() public {
        uint256 id = _createAccept(address(0));
        vm.prank(alice);
        pacts.agree(id, alice);
        vm.prank(bob);
        pacts.agree(id, bob); // disagree
        assertEq(pacts.getPact(id).status, 2, "unresolved on disagreement");
    }

    function test_CancelBeforeAccept_Refunds() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(bob, ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        uint256 a = usdt.balanceOf(alice);
        vm.prank(alice);
        pacts.cancelPact(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "proposer refunded");
        assertEq(pacts.getPact(id).status, 4, "refunded");
    }

    function test_RefundExpired_Active_RefundsBoth() public {
        uint256 id = _createAccept(ref);
        vm.warp(block.timestamp + 2 days);
        uint256 a = usdt.balanceOf(alice);
        uint256 b = usdt.balanceOf(bob);
        pacts.refundExpired(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "alice refunded");
        assertEq(usdt.balanceOf(bob) - b, STAKE, "bob refunded");
    }

    function test_RefundExpired_Proposed_RefundsProposer() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(bob, ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        uint256 a = usdt.balanceOf(alice);
        pacts.refundExpired(id);
        assertEq(usdt.balanceOf(alice) - a, STAKE, "proposer refunded");
    }

    // --- reverts ---
    function test_RevertWhen_NonCounterpartyAccepts() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(bob, ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        vm.prank(address(0xDEAD));
        vm.expectRevert(FlickyPacts.NotCounterparty.selector);
        pacts.acceptPact(id);
    }

    function test_RevertWhen_NonArbiterResolves() public {
        uint256 id = _createAccept(ref);
        vm.prank(alice);
        vm.expectRevert(FlickyPacts.NotArbiter.selector);
        pacts.resolveByArbiter(id, alice);
    }

    function test_RevertWhen_ArbiterResolveButNoArbiter() public {
        uint256 id = _createAccept(address(0));
        vm.prank(alice);
        vm.expectRevert(FlickyPacts.NoArbiter.selector);
        pacts.resolveByArbiter(id, alice);
    }

    function test_RevertWhen_BadWinner() public {
        uint256 id = _createAccept(ref);
        vm.prank(ref);
        vm.expectRevert(FlickyPacts.BadWinner.selector);
        pacts.resolveByArbiter(id, address(0xDEAD));
    }

    function test_RevertWhen_SelfCounterparty() public {
        vm.prank(alice);
        vm.expectRevert(FlickyPacts.BadCounterparty.selector);
        pacts.createPact(alice, ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_ZeroStake() public {
        vm.prank(alice);
        vm.expectRevert(FlickyPacts.ZeroStake.selector);
        pacts.createPact(bob, ref, 0, TERMS, uint64(block.timestamp + 1 days));
    }

    // --- open rooms (counterparty == address(0): anyone can join) ---
    function test_OpenRoom_AnyoneJoins() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(address(0), ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        assertEq(pacts.getPact(id).counterparty, address(0), "open on create");
        uint256 cBefore = usdt.balanceOf(carol);
        vm.prank(carol);
        pacts.acceptPact(id);
        assertEq(pacts.getPact(id).counterparty, carol, "joiner becomes counterparty");
        assertEq(pacts.getPact(id).status, 2, "active");
        assertEq(cBefore - usdt.balanceOf(carol), STAKE, "joiner stake pulled");
    }

    function test_OpenRoom_ArbiterPaysJoiner() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(address(0), ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        vm.prank(carol);
        pacts.acceptPact(id);
        uint256 cBefore = usdt.balanceOf(carol);
        vm.prank(ref);
        pacts.resolveByArbiter(id, carol);
        assertEq(usdt.balanceOf(carol) - cBefore, 2 * STAKE, "open-room joiner wins pot");
        assertEq(pacts.getPact(id).status, 3, "resolved");
    }

    function test_RevertWhen_ProposerJoinsOwnOpenRoom() public {
        vm.prank(alice);
        uint256 id = pacts.createPact(address(0), ref, STAKE, TERMS, uint64(block.timestamp + 1 days));
        vm.prank(alice);
        vm.expectRevert(FlickyPacts.BadCounterparty.selector);
        pacts.acceptPact(id);
    }
}
