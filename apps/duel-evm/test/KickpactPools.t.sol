// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KickpactPools} from "../src/KickpactPools.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

contract KickpactPoolsTest is Test {
    KickpactPools pools;
    MockUSDT usdt;

    address keeper = address(0x4EF); // arbiter (settle-keeper)
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address dave = address(0xDA4E);

    uint128 constant STAKE = 5_000_000; // 5 USD₮
    bytes32 GAME; // keccak256("WC#760510")
    uint64 kickoff;

    function setUp() public {
        usdt = new MockUSDT();
        pools = new KickpactPools(address(usdt));
        GAME = keccak256(bytes("WC#760510"));
        kickoff = uint64(block.timestamp + 2 hours);
        _fund(alice);
        _fund(bob);
        _fund(carol);
        _fund(dave);
    }

    function _fund(address who) internal {
        usdt.mint(who, 1_000_000_000);
        vm.prank(who);
        usdt.approve(address(pools), type(uint256).max);
    }

    /// alice(home) + bob(draw) + carol(home) — the standard fixture
    function _threeWay() internal returns (uint256 id) {
        vm.prank(alice);
        id = pools.createPool(GAME, keeper, STAKE, kickoff, 1);
        vm.prank(bob);
        pools.joinPool(id, 2);
        vm.prank(carol);
        pools.joinPool(id, 1);
    }

    // ── lifecycle ──────────────────────────────────────────────────────────

    function test_create_join_escrowsStakes() public {
        uint256 id = _threeWay();
        assertEq(usdt.balanceOf(address(pools)), uint256(STAKE) * 3);
        KickpactPools.Pool memory p = pools.getPool(id);
        assertEq(p.members.length, 3);
        assertEq(pools.pickOf(id, alice), 1);
        assertEq(pools.pickOf(id, bob), 2);
        assertEq(pools.poolsForGame(GAME)[0], id);
    }

    function test_settle_splitsPotAmongWinners() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 3 hours);
        vm.prank(keeper);
        pools.settle(id, 1); // home wins → alice + carol split

        uint256 before = usdt.balanceOf(alice);
        vm.prank(alice);
        pools.claim(id);
        assertEq(usdt.balanceOf(alice) - before, 7_500_000); // 15 / 2

        vm.prank(carol);
        pools.claim(id);
        assertEq(usdt.balanceOf(address(pools)), 0); // fully drained

        vm.prank(bob);
        vm.expectRevert(KickpactPools.NotWinner.selector);
        pools.claim(id);
    }

    function test_soleWinnerTakesWholePot() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 3 hours);
        vm.prank(keeper);
        pools.settle(id, 2); // draw → only bob
        uint256 before = usdt.balanceOf(bob);
        vm.prank(bob);
        pools.claim(id);
        assertEq(usdt.balanceOf(bob) - before, uint256(STAKE) * 3);
    }

    function test_dustGoesToLastClaimer() public {
        // stake with 6dp indivisible pot: 3 members × 1.000001 → pot 3.000003;
        // 2 winners → share 1.5000015 → floor 1500001, last gets 1500002
        uint128 stake = 1_000_001;
        vm.prank(alice);
        uint256 id = pools.createPool(GAME, keeper, stake, kickoff, 1);
        vm.prank(bob);
        pools.joinPool(id, 1);
        vm.prank(carol);
        pools.joinPool(id, 3);
        vm.warp(kickoff + 1);
        vm.prank(keeper);
        pools.settle(id, 1);

        uint256 a0 = usdt.balanceOf(alice);
        uint256 b0 = usdt.balanceOf(bob);
        vm.prank(alice);
        pools.claim(id);
        vm.prank(bob);
        pools.claim(id);
        assertEq(usdt.balanceOf(alice) - a0, 1_500_001);
        assertEq(usdt.balanceOf(bob) - b0, 1_500_002); // dust swept
        assertEq(usdt.balanceOf(address(pools)), 0);
    }

    function test_noWinners_everyoneRefunds() public {
        uint256 id = _threeWay(); // picks: home, draw, home
        vm.warp(kickoff + 3 hours);
        vm.prank(keeper);
        pools.settle(id, 3); // away won — nobody called it
        for (uint256 i = 0; i < 3; i++) {
            address who = i == 0 ? alice : i == 1 ? bob : carol;
            uint256 before = usdt.balanceOf(who);
            vm.prank(who);
            pools.claim(id);
            assertEq(usdt.balanceOf(who) - before, STAKE);
        }
        assertEq(usdt.balanceOf(address(pools)), 0);
    }

    // ── guards ─────────────────────────────────────────────────────────────

    function test_joinAfterKickoff_reverts() public {
        uint256 id = _threeWay();
        vm.warp(kickoff);
        vm.prank(dave);
        vm.expectRevert(KickpactPools.NotOpen.selector);
        pools.joinPool(id, 1);
    }

    function test_doubleJoin_reverts() public {
        uint256 id = _threeWay();
        vm.prank(alice);
        vm.expectRevert(KickpactPools.AlreadyMember.selector);
        pools.joinPool(id, 3);
    }

    function test_settleOnlyArbiter_andOnlyAfterKickoff() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 1);
        vm.prank(alice);
        vm.expectRevert(KickpactPools.NotArbiter.selector);
        pools.settle(id, 1);

        uint256 id2;
        vm.prank(alice);
        id2 = pools.createPool(keccak256("WC#2"), keeper, STAKE, uint64(block.timestamp + 1 days), 1);
        vm.prank(keeper);
        vm.expectRevert(KickpactPools.NotExpired.selector);
        pools.settle(id2, 1);
    }

    function test_doubleClaim_reverts() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 1);
        vm.prank(keeper);
        pools.settle(id, 1);
        vm.prank(alice);
        pools.claim(id);
        vm.prank(alice);
        vm.expectRevert(KickpactPools.AlreadyClaimed.selector);
        pools.claim(id);
    }

    function test_claimBeforeSettle_reverts() public {
        uint256 id = _threeWay();
        vm.prank(alice);
        vm.expectRevert(KickpactPools.NotSettled.selector);
        pools.claim(id);
    }

    function test_nonMemberClaim_reverts() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 1);
        vm.prank(keeper);
        pools.settle(id, 1);
        vm.prank(dave);
        vm.expectRevert(KickpactPools.NotMember.selector);
        pools.claim(id);
    }

    // ── safety valves ──────────────────────────────────────────────────────

    function test_creatorCancelsLonelyPool() public {
        vm.prank(alice);
        uint256 id = pools.createPool(GAME, keeper, STAKE, kickoff, 1);
        uint256 before = usdt.balanceOf(alice);
        vm.prank(alice);
        pools.cancelPool(id);
        assertEq(usdt.balanceOf(alice) - before, STAKE);
        // terminal: nobody can join a cancelled pool
        vm.prank(bob);
        vm.expectRevert(KickpactPools.NotOpen.selector);
        pools.joinPool(id, 1);
    }

    function test_cancelWithMembers_reverts() public {
        uint256 id = _threeWay();
        vm.prank(alice);
        vm.expectRevert(KickpactPools.NotEmpty.selector);
        pools.cancelPool(id);
    }

    function test_refundExpired_afterGrace() public {
        uint256 id = _threeWay();
        vm.warp(kickoff + 3 days); // grace not over (deadline + 3 days)
        vm.prank(alice);
        vm.expectRevert(KickpactPools.NotExpired.selector);
        pools.refundExpired(id);

        vm.warp(uint256(kickoff) + 3 days + 1);
        for (uint256 i = 0; i < 3; i++) {
            address who = i == 0 ? alice : i == 1 ? bob : carol;
            uint256 before = usdt.balanceOf(who);
            vm.prank(who);
            pools.refundExpired(id);
            assertEq(usdt.balanceOf(who) - before, STAKE);
        }
        assertEq(usdt.balanceOf(address(pools)), 0);
        // settle after refunds is refused
        vm.prank(keeper);
        vm.expectRevert(KickpactPools.NotOpen.selector); // hard cutoff after grace
        pools.settle(id, 1);
    }

    function test_gameKeyOf_matchesClientHash() public view {
        assertEq(pools.gameKeyOf("WC#760510"), keccak256(bytes("WC#760510")));
    }
}
