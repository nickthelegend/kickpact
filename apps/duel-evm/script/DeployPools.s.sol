// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {KickpactPools} from "../src/KickpactPools.sol";

/// @notice Deploy KickpactPools to Sepolia, reusing the existing MockUSDT.
/// @dev DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployPools.s.sol \
///        --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast
contract DeployPools is Script {
    function run() external returns (KickpactPools pools) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdt = vm.envOr("USDT_ADDRESS", address(0x4802B35fFE360CAcF7bc22702544DDA207b950A3));
        vm.startBroadcast(pk);
        pools = new KickpactPools(usdt);
        vm.stopBroadcast();
        console.log("KickpactPools deployed at:", address(pools));
        console.log("stakeToken (USDT):        ", usdt);
        console.log("chainId:                   ", block.chainid);
    }
}
