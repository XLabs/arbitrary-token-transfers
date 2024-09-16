// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";

import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import {makeBytes32} from "./utils/utils.sol";
import "./utils/UpgradeTester.sol";

import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrGovernance.sol";
import "tbr/assets/TbrIds.sol";

contract GovernanceTest is TbrTestBase {
  using BytesParsing for bytes;

  function testOwnerContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();
    uint8 commandCount = 1;

    (address implementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IMPLEMENTATION
      )
    ).asAddressUnchecked(0);

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPGRADE_CONTRACT, 
        address(upgradeTester)
      )
    );

    vm.startPrank(admin);
    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPGRADE_CONTRACT, 
        address(upgradeTester)
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPGRADE_CONTRACT, 
        address(upgradeTester)
      )
    );

    vm.expectRevert(IdempotentUpgrade.selector);
    UpgradeTester(address(tbr)).upgradeTo(address(upgradeTester), new bytes(0));

    UpgradeTester(address(tbr)).upgradeTo(implementation, new bytes(0));

    (address restoredImplementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IMPLEMENTATION
      )
    ).asAddressUnchecked(0);
    assertEq(restoredImplementation, implementation);
  }

  function testOwnershipTransfer() public {
    address newOwner = makeAddr("newOwner");
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0,
        GOVERNANCE_ID,
        commandCount, 
        PROPOSE_OWNERSHIP_TRANSFER, 
        newOwner
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        PROPOSE_OWNERSHIP_TRANSFER, 
        newOwner
      )
    );
    
    commandCount = 2;
    bytes memory getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        OWNER, 
        PENDING_OWNER
      )
    );
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_,        owner);
    assertEq(pendingOwner_, newOwner);

    commandCount = 0;
    vm.startPrank(newOwner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        new bytes(0)
      )
    );

    commandCount = 2;
    getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        OWNER, 
        PENDING_OWNER
      )
    );
    (owner_,        ) = getRes.asAddressUnchecked(0);
    (pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_, newOwner);
    assertEq(pendingOwner_, address(0));
  }

  function testUpdateAdmin() public {
    address newAdmin = makeAddr("newAdmin");
    uint8 commandCount = 1;
    bool shouldBeAdmin = true;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_ADMIN, 
        shouldBeAdmin,
        newAdmin
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_ADMIN, 
        shouldBeAdmin,
        newAdmin
      )
    );

    (bool isAdmin, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_ADMIN,
        newAdmin
      )
    ).asBoolUnchecked(0);

    assertEq(isAdmin, true);
  } 

  function testRelinquishOwnership() public {
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        RELINQUISH_OWNERSHIP
      )
    );

    commandCount = 2;
    vm.startPrank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(BytesParsing.LengthMismatch.selector, 3, 2)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount,
        RELINQUISH_OWNERSHIP, 
        UPDATE_ADMIN
      )
    );

    commandCount = 1;
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        RELINQUISH_OWNERSHIP
      )
    );

    (address owner_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount,
        OWNER
      )
    ).asAddressUnchecked(0);

    assertEq(owner_, address(0)); 
  }

  function testAddPeer() public {
    uint16 peerChain = 1;
    bytes32 newPeer = makeBytes32("peer");
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        ADD_PEER, 
        peerChain, 
        newPeer
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        ADD_PEER, 
        peerChain, 
        newPeer
      )
    );

    (bool isPeer, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_PEER,
        peerChain,
        newPeer
      )
    ).asBoolUnchecked(0);

    assertEq(isPeer, true);
  }

  function testUpdateMaxGasDropoff() public {
    uint32 maxGasDropoff = 1e6;
    uint16 targetChain = 1;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_MAX_GAS_DROPOFF, 
        targetChain,
        maxGasDropoff
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_MAX_GAS_DROPOFF, 
        targetChain,
        maxGasDropoff
      )
    );

    (uint32 maxGasDropoff_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        MAX_GAS_DROPOFF,
        targetChain
      )
    ).asUint32Unchecked(0);

    assertEq(maxGasDropoff_, maxGasDropoff);
  }

  function testUpdateFeeRecipient() public {
    address newFeeRecipient = makeAddr("newFeeRecipient");
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_FEE_RECIPIENT, 
        newFeeRecipient
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_FEE_RECIPIENT, 
        newFeeRecipient
      )
    );

    (address newFeeRecipient_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        FEE_RECIPIENT
      )
    ).asAddressUnchecked(0);

    assertEq(newFeeRecipient_, newFeeRecipient);
  }

  function testUpdateRelayFee() public {
    uint32 newRelayFee = 1e6;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_RELAY_FEE, 
        newRelayFee
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_RELAY_FEE, 
        newRelayFee
      )
    );

    (uint32 newRelayFee_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        RELAY_FEE
      )
    ).asUint32Unchecked(0);

    assertEq(newRelayFee_, newRelayFee);
  }

  function testPauseChain() public {
    bool paused = true;
    uint8 commandCount = 1;
    uint16 fakeChainId = 2;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        PAUSE_CHAIN, 
        paused,
        fakeChainId
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        PAUSE_CHAIN, 
        fakeChainId,
        paused
      )
    );

    (bool paused_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_CHAIN_PAUSED,
        fakeChainId
      )
    ).asBoolUnchecked(0);

    assertEq(paused_, paused);
  }

  function testUpdateCanonicalPeer() public {
    bytes32 newCanonicalPeer = makeBytes32("canonicalPeer");
    uint16 peerChain = 1;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_CANONICAL_PEER, 
        peerChain,
        newCanonicalPeer
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_CANONICAL_PEER, 
        peerChain,
        newCanonicalPeer
      )
    );

    (bytes32 newCanonicalPeer_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        CANONICAL_PEER,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(newCanonicalPeer_, newCanonicalPeer);
  }

  function testSweepTokens() public {
    uint usdtAmount = 1e6;
    uint ethAmount = 1 ether;
    uint8 commandCount = 2;
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
      GOVERNANCE_ID, 
      commandCount, 
      SWEEP_TOKENS, address(usdt), usdtAmount,
      SWEEP_TOKENS, address(0), ethAmount
      )
    );
    assertEq(usdt.balanceOf(address(tbr)), 0);
    assertEq(address(tbr).balance, 0);
    assertEq(usdt.balanceOf(owner), usdtAmount);
    assertEq(address(owner).balance, ownerEthBalance + ethAmount);
  }

  function testIsChainSupported() public {
    uint16 chainId = 1;
    uint8 commandCount = 1;
    bytes32 fakePeer = makeBytes32("peer");

    (bool isSupported, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_CHAIN_SUPPORTED, 
        chainId
      )
    ).asBoolUnchecked(0);
    assertEq(isSupported, false);

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_CANONICAL_PEER, 
        chainId, 
        fakePeer
      )
    );

    (isSupported, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_CHAIN_SUPPORTED, 
        chainId
      )
    ).asBoolUnchecked(0);
    assertEq(isSupported, true);
  }

  function testSetChainTxSensitive() public {
    uint16 chainId = 1;
    bool txSensitive = true;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_TX_SIZE_SENSITIVE, 
        chainId,
        txSensitive
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        UPDATE_TX_SIZE_SENSITIVE, 
        chainId,
        txSensitive
      )
    );

    (bool txSensitive_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        IS_TX_SIZE_SENSITIVE,
        chainId
      )
    ).asBoolUnchecked(0);

    assertEq(txSensitive_, txSensitive);
  }

  function testInvalidCommand() public {
    uint8 commandCount = 1;

    // The first query command, so should fail because the exec 
    // function will not be able to handle it.
    uint8 fakeCommand = 0x80;
    vm.prank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(InvalidGovernanceCommand.selector, fakeCommand)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        fakeCommand
      )
    );
  }

  function testInvalidQuery() public {
    uint8 commandCount = 1;
    
    // The last exec command, so should fail because the get
    // function will not be able to handle it.
    uint8 fakeQuery = 0x79;
    vm.prank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(InvalidGovernanceQuery.selector, fakeQuery)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_QUERIES_ID, 
        commandCount, 
        fakeQuery
      )
    );
  }
}
