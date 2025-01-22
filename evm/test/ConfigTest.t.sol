// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { InvalidConfigCommand, InvalidConfigQuery } from "tbr/assets/TbrConfig.sol";
import { NotAuthorized } from "wormhole-sdk/components/dispatcher/AccessControl.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { ChainIsNotRegistered } from "tbr/assets/TbrBase.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import { makeBytes32 } from "./utils/utils.sol";
import "tbr/assets/TbrIds.sol";

contract ConfigTest is TbrTestBase {
  using BytesParsing for bytes;

  function addCanonicalPeer(uint16 peerChain, bytes32 peer) internal {
    uint8 commandCount = 1;
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_ID,
        commandCount, 
        UPDATE_CANONICAL_PEER_ID,
        peerChain,
        peer
      )
    );
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

    (bool isPeer, ) = invokeStaticTbr(
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

  function testAddCanonicalPeer() public {
    uint16 peerChain = 1;
    bytes32 newPeer = makeBytes32("peer");
    uint8 commandCount = 1;

    vm.expectRevert(NotAuthorized.selector);
    addCanonicalPeer(peerChain, newPeer);

    vm.startPrank(owner);
    addCanonicalPeer(peerChain, newPeer);

    (bool isPeer, ) = invokeStaticTbr(
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

    (bytes32 canonicalPeer, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        CANONICAL_PEER_ID,
        peerChain
      )
    ).asBytes32Unchecked(0);
    
    assertEq(canonicalPeer, newPeer);

    bytes32 anotherPeer = makeBytes32("anotherPeer");
    addCanonicalPeer(peerChain, anotherPeer);

    (isPeer, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        IS_PEER_ID,
        peerChain,
        anotherPeer
      )
    ).asBoolUnchecked(0);

    assertEq(isPeer, true);

    (canonicalPeer, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        CONFIG_QUERIES_ID,
        commandCount, 
        CANONICAL_PEER_ID,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(canonicalPeer, anotherPeer);
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

    vm.prank(owner);
    addCanonicalPeer(chainId, makeBytes32("peer"));

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

    (uint32 maxGasDropoff_, ) = invokeStaticTbr(
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

    (address newFeeRecipient_, ) = invokeStaticTbr(
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

    vm.prank(owner);
    addCanonicalPeer(chainId, makeBytes32("peer"));

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

    (uint32 newRelayFee_, ) = invokeStaticTbr(
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

    vm.prank(owner);
    addCanonicalPeer(chainId, makeBytes32("peer"));

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

    (bool paused_, ) = invokeStaticTbr(
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

    (bytes32 newCanonicalPeer_, ) = invokeStaticTbr(
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

  function testIsChainSupported() public {
    uint16 chainId = 1;
    uint8 commandCount = 1;

    (bool isSupported, ) = invokeStaticTbr(
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
    addCanonicalPeer(chainId, makeBytes32("peer"));

    (isSupported, ) = invokeStaticTbr(
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
    invokeStaticTbr(
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
