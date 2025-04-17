// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { NotAuthorized } from "wormhole-sdk/components/dispatcher/AccessControl.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { UpgradeTester } from "./utils/UpgradeTester.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import "wormhole-sdk/components/dispatcher/Ids.sol";
import "tbr/assets/TbrIds.sol";

contract ConfigTest is TbrTestBase {
  using BytesParsing for bytes;

  function testContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();

    (address implementation, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        IMPLEMENTATION_ID
      )
    ).asAddressMemUnchecked(0);

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        UPGRADE_CONTRACT_ID,
        address(upgradeTester)
      )
    );

    vm.startPrank(admin);
    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        UPGRADE_CONTRACT_ID,
        address(upgradeTester)
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        UPGRADE_CONTRACT_ID,
        address(upgradeTester)
      )
    );

    vm.expectRevert(IdempotentUpgrade.selector);
    UpgradeTester(address(tbr)).upgradeTo(address(upgradeTester), new bytes(0));

    UpgradeTester(address(tbr)).upgradeTo(implementation, new bytes(0));

    (address restoredImplementation, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        IMPLEMENTATION_ID
      )
    ).asAddressMemUnchecked(0);
    assertEq(restoredImplementation, implementation);
  }

  function testOwnershipTransfer(address newOwner) public {
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0,
        ACCESS_CONTROL_ID,
        commandCount, 
        PROPOSE_OWNERSHIP_TRANSFER_ID,
        newOwner
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        PROPOSE_OWNERSHIP_TRANSFER_ID,
        newOwner
      )
    );
    
    commandCount = 2;
    bytes memory getRes = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        OWNER_ID,
        PENDING_OWNER_ID
      )
    );
    (address owner_,        ) = getRes.asAddressMemUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressMemUnchecked(20);

    assertEq(owner_,        owner);
    assertEq(pendingOwner_, newOwner);

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACQUIRE_OWNERSHIP_ID
      )
    );

    vm.prank(newOwner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACQUIRE_OWNERSHIP_ID
      )
    );

    commandCount = 2;
    getRes = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        OWNER_ID,
        PENDING_OWNER_ID
      )
    );
    (owner_,        ) = getRes.asAddressMemUnchecked(0);
    (pendingOwner_, ) = getRes.asAddressMemUnchecked(20);

    assertEq(owner_, newOwner);
    assertEq(pendingOwner_, address(0));
  }

  function testSweepTokens() public {
    uint usdtAmount = 1e6;
    uint ethAmount = 1 ether;
    deal(address(usdt), address(tbr), usdtAmount);
    vm.deal(address(tbr), ethAmount);
    assertEq(usdt.balanceOf(owner), 0);
    uint ownerEthBalance = address(owner).balance;
    assertEq(usdt.balanceOf(address(tbr)), usdtAmount);
    assertEq(address(tbr).balance, ethAmount);
    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
      tbr.exec768.selector, 
      DISPATCHER_PROTOCOL_VERSION0, 
      SWEEP_TOKENS_ID, address(usdt), usdtAmount,
      SWEEP_TOKENS_ID, address(0), ethAmount
      )
    );
    assertEq(usdt.balanceOf(address(tbr)), 0);
    assertEq(address(tbr).balance, 0);
    assertEq(usdt.balanceOf(owner), usdtAmount);
    assertEq(address(owner).balance, ownerEthBalance + ethAmount);
  }
}
