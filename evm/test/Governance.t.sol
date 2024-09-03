// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";

import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import "./utils/UpgradeTester.sol";

import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrGovernance.sol";
import "tbr/assets/TbrIds.sol";

contract GovernanceTest is TbrTestBase {
  using BytesParsing for bytes;
  uint8 dispatcherVersion = 0;

  function testOwnerContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();
    uint8 amountOfCommands = 1;

    (address implementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        IMPLEMENTATION
      )
    ).asAddressUnchecked(0);

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPGRADE_CONTRACT, 
        address(upgradeTester)
      )
    );

    vm.startPrank(admin);
    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPGRADE_CONTRACT, 
        address(upgradeTester)
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
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
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        IMPLEMENTATION
      )
    ).asAddressUnchecked(0);
    assertEq(restoredImplementation, implementation);
  }

  function testOwnershipTransfer() public {
    address newOwner = makeAddr("newOwner");
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion,
        GOVERNANCE_ID,
        amountOfCommands, 
        PROPOSE_OWNERSHIP_TRANSFER, 
        newOwner
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        PROPOSE_OWNERSHIP_TRANSFER, 
        newOwner
      )
    );
    
    amountOfCommands = 2;
    bytes memory getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        OWNER, 
        PENDING_OWNER
      )
    );
    (address owner_,        ) = getRes.asAddressUnchecked(0);
    (address pendingOwner_, ) = getRes.asAddressUnchecked(20);

    assertEq(owner_,        owner);
    assertEq(pendingOwner_, newOwner);

    amountOfCommands = 0;
    vm.startPrank(newOwner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        new bytes(0)
      )
    );

    amountOfCommands = 2;
    getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
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
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_ADMIN, 
        newAdmin
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_ADMIN, 
        newAdmin
      )
    );

    (address newAdmin_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        ADMIN
      )
    ).asAddressUnchecked(0);

    assertEq(newAdmin_, newAdmin);
  } 

  function testRelinquishOwnership() public {
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        RELINQUISH_OWNERSHIP
      )
    );

    amountOfCommands = 2;
    vm.startPrank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(BytesParsing.LengthMismatch.selector, 3, 2)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands,
        RELINQUISH_OWNERSHIP, 
        UPDATE_ADMIN
      )
    );

    amountOfCommands = 1;
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        RELINQUISH_OWNERSHIP
      )
    );

    (address owner_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands,
        OWNER
      )
    ).asAddressUnchecked(0);

    assertEq(owner_, address(0)); 
  }

  function testAddPeer() public {
    uint16 peerChain = 1;
    bytes32 newPeer = 0x1234567890123456789012345678901234567890123456789012345678901234;
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        ADD_PEER, 
        peerChain, 
        newPeer
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        ADD_PEER, 
        peerChain, 
        newPeer
      )
    );

    (bytes32 peer, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        PEERS,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(peer, newPeer);
  }

  function testUpdateMaxGasDropoff() public {
    uint32 maxGasDropoff = 1e6;
    uint16 targetChain = 1;
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_MAX_GAS_DROPOFF, 
        targetChain,
        maxGasDropoff
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_MAX_GAS_DROPOFF, 
        targetChain,
        maxGasDropoff
      )
    );

    (uint32 maxGasDropoff_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        MAX_GAS_DROPOFF,
        targetChain
      )
    ).asUint32Unchecked(0);

    assertEq(maxGasDropoff_, maxGasDropoff);
  }

  function testUpdateFeeRecipient() public {
    address newFeeRecipient = makeAddr("newFeeRecipient");
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_FEE_RECIPIENT, 
        newFeeRecipient
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_FEE_RECIPIENT, 
        newFeeRecipient
      )
    );

    (address newFeeRecipient_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        FEE_RECIPIENT
      )
    ).asAddressUnchecked(0);

    assertEq(newFeeRecipient_, newFeeRecipient);
  }

  function testUpdateRelayFee() public {
    uint32 newRelayFee = 1e6;
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_RELAY_FEE, 
        newRelayFee
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_RELAY_FEE, 
        newRelayFee
      )
    );

    (uint32 newRelayFee_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        RELAY_FEE
      )
    ).asUint32Unchecked(0);

    assertEq(newRelayFee_, newRelayFee);
  }

  function testPauseOutboundTransfers() public {
    bool paused = true;
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        PAUSE_OUTBOUND_TRANSFERS, 
        paused
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        PAUSE_OUTBOUND_TRANSFERS, 
        paused
      )
    );

    (bool paused_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        OUTBOUND_TRANSFER_PAUSED
      )
    ).asBoolUnchecked(0);

    assertEq(paused_, paused);
  }

  function testUpdateCanonicalPeer() public {
    bytes32 newCanonicalPeer = 0x1234567890123456789012345678901234567890123456789012345678901234;
    uint16 peerChain = 1;
    uint8 amountOfCommands = 1;

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_CANONICAL_PEER, 
        peerChain,
        newCanonicalPeer
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        UPDATE_CANONICAL_PEER, 
        peerChain,
        newCanonicalPeer
      )
    );

    (bytes32 newCanonicalPeer_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        CANONICAL_PEER,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(newCanonicalPeer_, newCanonicalPeer);
  }

  function testInvalidCommand() public {
    uint8 amountOfCommands = 1;

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
        dispatcherVersion, 
        GOVERNANCE_ID, 
        amountOfCommands, 
        fakeCommand
      )
    );
  }

  function testInvalidQuery() public {
    uint8 amountOfCommands = 1;
    
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
        dispatcherVersion, 
        GOVERNANCE_QUERIES_ID, 
        amountOfCommands, 
        fakeQuery
      )
    );
  }
}
