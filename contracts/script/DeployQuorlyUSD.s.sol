// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {QuorlyUSD} from "../src/QuorlyUSD.sol";

contract DeployQuorlyUSD is Script {
    function run() external returns (QuorlyUSD qusd) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        qusd = new QuorlyUSD(1_000_000 * 10 ** 6, deployer);

        // Seed the treasury straight away so the first demo needs no faucet trip.
        address treasury = vm.envOr("TREASURY_ADDRESS", address(0));
        if (treasury != address(0)) {
            qusd.mint(treasury, 100_000 * 10 ** 6);
            console.log("seeded treasury", treasury, "with 100,000 QUSD");
        }
        vm.stopBroadcast();

        console.log("QuorlyUSD:", address(qusd));
        console.log("owner:    ", deployer);
    }
}
