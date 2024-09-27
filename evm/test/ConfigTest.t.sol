// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { InvalidConfigCommand, InvalidConfigQuery } from "tbr/assets/TbrConfig.sol";
import { NotAuthorized } from "tbr/assets/sharedComponents/AccessControl.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { ChainIsNotRegistered } from "tbr/assets/TbrBase.sol";
import { UpgradeTester } from "./utils/UpgradeTester.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import { makeBytes32 } from "./utils/utils.sol";
import "tbr/assets/sharedComponents/ids.sol";
import "tbr/assets/TbrIds.sol";

contract ConfigTest is TbrTestBase {
  using BytesParsing for bytes;

  function addCanonicalPeer(uint16 peerChain) internal {
    uint8 commandCount = 1;
    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_CANONICAL_PEER_ID,
        peerChain,
        makeBytes32('peer')
      )
    );
  }

  function testOwnerContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();

    (address implementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        IMPLEMENTATION_ID
      )
    ).asAddressUnchecked(0);

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

    (address restoredImplementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        IMPLEMENTATION_ID
      )
    ).asAddressUnchecked(0);
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
    bytes memory getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        OWNER_ID,
        PENDING_OWNER_ID
      )
    );
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

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
    getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        OWNER_ID,
        PENDING_OWNER_ID
      )
    );
    (owner_,        ) = getRes.asAddressUnchecked(0);
    (pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_, newOwner);
    assertEq(pendingOwner_, address(0));
  }

  function testBatchAfterAcquire(address newOwner, bytes32 peer) public {
    vm.assume(peer != bytes32(0));
    uint8 commandCount = 1;
    uint16 peerChain = 1;

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

    vm.prank(newOwner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACQUIRE_OWNERSHIP_ID,
        CONFIG_ID,
        commandCount,
        UPDATE_CANONICAL_PEER_ID,
        peerChain,
        peer
      )
    );

    commandCount = 2;
    uint8 configCommandCount = 1;
    bytes memory getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        OWNER_ID,
        PENDING_OWNER_ID,
        CONFIG_QUERIES_ID,
        configCommandCount,
        CANONICAL_PEER_ID,
        peerChain
      )
    );
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);
    (bytes32 canonicalPeer, ) = getRes.asBytes32Unchecked(40);

    assertEq(owner_, newOwner);
    assertEq(pendingOwner_, address(0));
    assertEq(canonicalPeer, peer);
  }

  function testUpdateAdmin(address newAdmin) public {
    uint8 commandCount = 1;
    bool shouldBeAdmin = true;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        UPDATE_ADMIN_ID,
        newAdmin, 
        shouldBeAdmin
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        UPDATE_ADMIN_ID, 
        shouldBeAdmin,
        newAdmin
      )
    );

    (bool isAdmin, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        IS_ADMIN_ID,
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
        ACCESS_CONTROL_ID,
        commandCount, 
        RELINQUISH_OWNERSHIP_ID
      )
    );

    commandCount = 2;
    vm.startPrank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(BytesParsing.LengthMismatch.selector, 5, 4)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount,
        RELINQUISH_OWNERSHIP_ID,
        UPDATE_ADMIN_ID
      )
    );

    commandCount = 1;
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        RELINQUISH_OWNERSHIP_ID
      )
    );

    (address owner_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount,
        OWNER_ID
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
        CONFIG_ID,
        commandCount, 
        ADD_PEER_ID,
        peerChain, 
        newPeer
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        ADD_PEER_ID,
        peerChain, 
        newPeer
      )
    );

    (bool isPeer, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_PEER_ID,
        peerChain,
        newPeer
      )
    ).asBoolUnchecked(0);

    assertEq(isPeer, true);
  }

  function testUpdateMaxGasDropoff() public {
    uint16 chainId = 1;
    uint32 maxGasDropoff = 1e6;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_MAX_GAS_DROPOFF_ID,
        chainId,
        maxGasDropoff
      )
    );

    vm.prank(admin);
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_MAX_GAS_DROPOFF_ID,
        chainId,
        maxGasDropoff
      )
    );

    addCanonicalPeer(chainId);
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_MAX_GAS_DROPOFF_ID,
        chainId,
        maxGasDropoff
      )
    );

    (uint32 maxGasDropoff_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        MAX_GAS_DROPOFF_ID,
        chainId
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
        CONFIG_ID,
        commandCount, 
        UPDATE_FEE_RECIPIENT_ID,
        newFeeRecipient
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_FEE_RECIPIENT_ID,
        newFeeRecipient
      )
    );

    (address newFeeRecipient_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        FEE_RECIPIENT_ID
      )
    ).asAddressUnchecked(0);

    assertEq(newFeeRecipient_, newFeeRecipient);
  }

  function testUpdateRelayFee() public {
    uint32 newRelayFee = 1e6;
    uint8 commandCount = 1;
    uint16 chainId = EVM_CHAIN_ID;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_BASE_FEE_ID, 
        chainId,
        newRelayFee
      )
    );

    vm.prank(admin);
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_BASE_FEE_ID, 
        chainId,
        newRelayFee
      )
    );

    addCanonicalPeer(chainId);
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_BASE_FEE_ID, 
        chainId,
        newRelayFee
      )
    );

    (uint32 newRelayFee_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        BASE_FEE_ID,
        chainId
      )
    ).asUint32Unchecked(0);

    assertEq(newRelayFee_, newRelayFee);
  }

  function testPauseChain() public {
    bool paused = true;
    uint16 chainId = 1;
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        PAUSE_CHAIN_ID,
        chainId,
        paused
      )
    );

    vm.prank(admin);
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        PAUSE_CHAIN_ID,
        chainId,
        paused
      )
    );

    addCanonicalPeer(chainId);
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        PAUSE_CHAIN_ID,
        chainId,
        paused
      )
    );

    (bool paused_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_CHAIN_PAUSED_ID,
        chainId
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
        CONFIG_ID,
        commandCount, 
        UPDATE_CANONICAL_PEER_ID,
        peerChain,
        newCanonicalPeer
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_CANONICAL_PEER_ID,
        peerChain,
        newCanonicalPeer
      )
    );

    (bytes32 newCanonicalPeer_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        CANONICAL_PEER_ID,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(newCanonicalPeer_, newCanonicalPeer);
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

  function testIsChainSupported() public {
    uint16 chainId = 1;
    uint8 commandCount = 1;
    bytes32 fakePeer = makeBytes32("peer");

    (bool isSupported, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_CHAIN_SUPPORTED_ID,
        chainId
      )
    ).asBoolUnchecked(0);
    assertEq(isSupported, false);

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_CANONICAL_PEER_ID,
        chainId, 
        fakePeer
      )
    );

    (isSupported, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_CHAIN_SUPPORTED_ID,
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
        CONFIG_ID,
        commandCount, 
        UPDATE_TX_SIZE_SENSITIVE_ID,
        chainId,
        txSensitive
      )
    );

    vm.prank(admin);
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_TX_SIZE_SENSITIVE_ID,
        chainId,
        txSensitive
      )
    );

    addCanonicalPeer(chainId);
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_TX_SIZE_SENSITIVE_ID,
        chainId,
        txSensitive
      )
    );

    (bool txSensitive_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_TX_SIZE_SENSITIVE_ID,
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
      abi.encodeWithSelector(InvalidConfigCommand.selector, fakeCommand)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
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
      abi.encodeWithSelector(InvalidConfigQuery.selector, fakeQuery)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        fakeQuery
      )
    );
  }
}
