// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FlickyDuel} from "../src/FlickyDuel.sol";
import {MockUSDT} from "../src/MockUSDT.sol";

/// @notice Deploy MockUSDT + FlickyDuel to Sepolia (chainId 11155111).
/// @dev    Set DEPLOYER_PRIVATE_KEY and (optionally) ORACLE_ADDRESS in env.
///         forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
contract Deploy is Script {
    function run() external returns (MockUSDT usdt, FlickyDuel duel) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address oracle = vm.envOr("ORACLE_ADDRESS", deployer);

        vm.startBroadcast(pk);
        usdt = new MockUSDT();
        duel = new FlickyDuel(oracle, address(usdt));
        // Seed the deployer with 10,000 test USD₮ for demo/funding.
        usdt.mint(deployer, 10_000_000_000);
        vm.stopBroadcast();

        console.log("MockUSDT  deployed at:", address(usdt));
        console.log("FlickyDuel deployed at:", address(duel));
        console.log("oracle (keeper):       ", oracle);
        console.log("chainId:               ", block.chainid);
    }
}
