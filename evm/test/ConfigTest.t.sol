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

  function testContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();

    (address implementation, ) = invokeStaticTbr(
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

    (address restoredImplementation, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        IMPLEMENTATION_ID
      )
    ).asAddressUnchecked(0);
    assertEq(restoredImplementation, implementation);
  }

  function testExternalContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();

    (address implementation, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector,
        DISPATCHER_PROTOCOL_VERSION0,
        IMPLEMENTATION_ID
      )
    ).asAddressUnchecked(0);

    vm.expectRevert(NotAuthorized.selector);
    tbr.upgrade(address(upgradeTester), new bytes(0));

    vm.startPrank(admin);
    vm.expectRevert(NotAuthorized.selector);
    tbr.upgrade(address(upgradeTester), new bytes(0));

    vm.startPrank(owner);
    tbr.upgrade(address(upgradeTester), new bytes(0));

    vm.expectRevert(IdempotentUpgrade.selector);
    UpgradeTester(address(tbr)).upgradeTo(address(upgradeTester), new bytes(0));

    UpgradeTester(address(tbr)).upgradeTo(implementation, new bytes(0));

    (address restoredImplementation, ) = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector,
        DISPATCHER_PROTOCOL_VERSION0,
        IMPLEMENTATION_ID
      )
    ).asAddressUnchecked(0);
    assertEq(restoredImplementation, implementation);
  }

  function testOwnershipTransfer(address newOwner) public {
    vm.assume(newOwner != owner);
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
    (owner_,        ) = getRes.asAddressUnchecked(0);
    (pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_, newOwner);
    assertEq(pendingOwner_, address(0));
  }


  function testExternalOwnershipTransfer(address newOwner) public {
    vm.expectRevert(NotAuthorized.selector);
    tbr.transferOwnership(newOwner);

    vm.prank(owner);
    tbr.transferOwnership(newOwner);

    uint8 commandCount = 2;
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
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_,        owner);
    assertEq(pendingOwner_, newOwner);
  }

  function testExternalCancelOwnershipTransfer(address newOwner) public {
    vm.prank(owner);
    tbr.transferOwnership(newOwner);

    vm.expectRevert(NotAuthorized.selector);
    tbr.cancelOwnershipTransfer();

    vm.prank(owner);
    tbr.cancelOwnershipTransfer();

    uint8 commandCount = 2;
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
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_,        owner);
    assertEq(pendingOwner_, address(0));
  }

  function testExternalReceiveOwnership(address newOwner) public {
    vm.assume(newOwner != owner);
    vm.prank(owner);
    tbr.transferOwnership(newOwner);

    vm.expectRevert(NotAuthorized.selector);
    tbr.receiveOwnership();

    vm.prank(newOwner);
    tbr.receiveOwnership();

    uint8 commandCount = 2;
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
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

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
    bytes memory getRes = invokeStaticTbr(
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

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        ADD_ADMIN_ID,
        newAdmin
      )
    );

    vm.expectRevert(NotAuthorized.selector);
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        ADD_ADMIN_ID,
        newAdmin
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        ADD_ADMIN_ID,
        newAdmin
      )
    );

    commandCount = 2;
    bytes memory res = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        IS_ADMIN_ID,
        newAdmin,
        ADMINS_ID
      )
    );
    
    (bool isAdmin, ) = res.asBoolUnchecked(0);
    (uint8 adminsCount, ) = res.asUint8Unchecked(1);
    (bytes memory rawAdmin, ) = res.sliceUnchecked(res.length - 20, 20);
    (address newAdmin_, ) = rawAdmin.asAddressUnchecked(0);

    assertEq(isAdmin, true);
    assertEq(adminsCount, 2);
    assertEq(newAdmin_, newAdmin);

    commandCount = 1;
    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_ID,
        commandCount, 
        REVOKE_ADMIN_ID,
        newAdmin
      )
    );

    commandCount = 2;
    res = invokeStaticTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        ACCESS_CONTROL_QUERIES_ID,
        commandCount, 
        IS_ADMIN_ID,
        newAdmin,
        ADMINS_ID
      )
    );
    
    (isAdmin, ) = res.asBoolUnchecked(0);
    (adminsCount, ) = res.asUint8Unchecked(1);

    assertEq(isAdmin, false);
    assertEq(adminsCount, 1);
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
        ADD_ADMIN_ID
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

    (address owner_, ) = invokeStaticTbr(
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
