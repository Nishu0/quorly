// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QuorlyUSD} from "../src/QuorlyUSD.sol";

contract QuorlyUSDTest is Test {
    QuorlyUSD internal qusd;
    address internal deployer = address(0xD1);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        qusd = new QuorlyUSD(1_000_000 * 10 ** 6, deployer);
    }

    /* ------------------------------------------------------------- basics */

    function test_MirrorsUsdcPrecision() public view {
        // The app formats every amount at 6dp; a mismatch here silently
        // mis-scales every payout by 10^12.
        assertEq(qusd.decimals(), 6);
    }

    function test_MintsInitialSupplyToOwner() public view {
        assertEq(qusd.balanceOf(deployer), 1_000_000 * 10 ** 6);
        assertEq(qusd.totalSupply(), 1_000_000 * 10 ** 6);
    }

    /* ------------------------------------------------------------- faucet */

    function test_DripPaysOutAndIsEnoughForTheTopTier() public {
        vm.prank(alice);
        qusd.drip();
        // The high-value policy tier tops out at $25,000; one pull must make a
        // $20,000 approval demoable.
        assertEq(qusd.balanceOf(alice), 10_000 * 10 ** 6);
    }

    function test_DripBlocksASecondPullWithinCooldown() public {
        vm.startPrank(alice);
        qusd.drip();
        vm.expectRevert();
        qusd.drip();
        vm.stopPrank();
    }

    function test_DripAllowedAgainAfterCooldown() public {
        vm.startPrank(alice);
        qusd.drip();
        vm.warp(block.timestamp + 1 hours);
        qusd.drip();
        vm.stopPrank();
        assertEq(qusd.balanceOf(alice), 20_000 * 10 ** 6);
    }

    function test_CooldownIsPerAddressNotGlobal() public {
        vm.prank(alice);
        qusd.drip();
        vm.prank(bob);
        qusd.drip(); // must not revert
        assertEq(qusd.balanceOf(bob), 10_000 * 10 ** 6);
    }

    function test_DripToFundsAWalletHoldingNoGas() public {
        // The treasury is a Privy wallet with no ETH — it can't call drip()
        // itself, so someone else has to pull on its behalf.
        address treasury = address(0x7EA);
        vm.prank(alice);
        qusd.dripTo(treasury);
        assertEq(qusd.balanceOf(treasury), 10_000 * 10 ** 6);
        assertEq(qusd.balanceOf(alice), 0);
    }

    function test_DripAvailableInCountsDown() public {
        assertEq(qusd.dripAvailableIn(alice), 0);
        vm.prank(alice);
        qusd.drip();
        assertEq(qusd.dripAvailableIn(alice), 1 hours);
        vm.warp(block.timestamp + 40 minutes);
        assertEq(qusd.dripAvailableIn(alice), 20 minutes);
        vm.warp(block.timestamp + 20 minutes);
        assertEq(qusd.dripAvailableIn(alice), 0);
    }

    /* ----------------------------------------------------------- transfers */

    function test_TransferMovesBalance() public {
        vm.prank(alice);
        qusd.drip();
        vm.prank(alice);
        qusd.transfer(bob, 2_500 * 10 ** 6);
        assertEq(qusd.balanceOf(bob), 2_500 * 10 ** 6);
        assertEq(qusd.balanceOf(alice), 7_500 * 10 ** 6);
    }

    function test_TransferRevertsOnInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(QuorlyUSD.InsufficientBalance.selector);
        qusd.transfer(bob, 1);
    }

    function test_TransferFromSpendsAllowance() public {
        vm.prank(alice);
        qusd.drip();
        vm.prank(alice);
        qusd.approve(bob, 1_000 * 10 ** 6);
        vm.prank(bob);
        qusd.transferFrom(alice, bob, 400 * 10 ** 6);
        assertEq(qusd.allowance(alice, bob), 600 * 10 ** 6);
    }

    function test_InfiniteAllowanceIsNotDecremented() public {
        vm.prank(alice);
        qusd.drip();
        vm.prank(alice);
        qusd.approve(bob, type(uint256).max);
        vm.prank(bob);
        qusd.transferFrom(alice, bob, 400 * 10 ** 6);
        assertEq(qusd.allowance(alice, bob), type(uint256).max);
    }

    /* --------------------------------------------------------------- admin */

    function test_OnlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert(QuorlyUSD.NotOwner.selector);
        qusd.mint(alice, 1);
    }

    function test_OwnerCanMint() public {
        vm.prank(deployer);
        qusd.mint(alice, 5 * 10 ** 6);
        assertEq(qusd.balanceOf(alice), 5 * 10 ** 6);
    }

    function testFuzz_TransferNeverCreatesSupply(uint96 amount) public {
        vm.prank(alice);
        qusd.drip();
        uint256 before = qusd.totalSupply();
        vm.assume(amount <= qusd.balanceOf(alice));
        vm.prank(alice);
        qusd.transfer(bob, amount);
        assertEq(qusd.totalSupply(), before);
    }
}
