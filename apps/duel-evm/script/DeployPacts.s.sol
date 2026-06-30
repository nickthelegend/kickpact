// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FlickyPacts} from "../src/FlickyPacts.sol";

/// @notice Deploy FlickyPacts to Sepolia, reusing the existing MockUSDT.
/// @dev forge script script/DeployPacts.s.sol --rpc-url sepolia --broadcast
contract DeployPacts is Script {
    function run() external returns (FlickyPacts pacts) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdt = vm.envOr("USDT_ADDRESS", address(0x4802B35fFE360CAcF7bc22702544DDA207b950A3));
        vm.startBroadcast(pk);
        pacts = new FlickyPacts(usdt);
        vm.stopBroadcast();
        console.log("FlickyPacts deployed at:", address(pacts));
        console.log("stakeToken (USDT):     ", usdt);
        console.log("chainId:                ", block.chainid);
    }
}
