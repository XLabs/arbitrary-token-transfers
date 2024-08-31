// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";

import { IdempotentUpgrade } from "wormhole-sdk/proxy/ProxyBase.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import "./utils/UpgradeTester.sol";

import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrGovernance.sol";

contract GovernanceTest is TbrTestBase {
  using BytesParsing for bytes;
  uint8 dispatcherVersion = 0;
  uint8 governanceId;
  uint8 governanceQueryId;

  function _setUp1() internal override {
    governanceId = tbr.GOVERNANCE_ID();
    governanceQueryId = tbr.GOVERNANCE_QUERIES_ID();
  }

  function testOwnerContractUpgrade() public {
    UpgradeTester upgradeTester = new UpgradeTester();
    uint8 amountOfCommands = 1;

    (address implementation, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Implementation
      )
    ).asAddressUnchecked(0);

    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpgradeContract, 
        address(upgradeTester)
      )
    );

    vm.startPrank(admin);
    vm.expectRevert(NotAuthorized.selector);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpgradeContract, 
        address(upgradeTester)
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpgradeContract, 
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
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Implementation
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
        governanceId,
        amountOfCommands, 
        GovernanceCommand.ProposeOwnershipTransfer, 
        newOwner
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.ProposeOwnershipTransfer, 
        newOwner
      )
    );
    
    amountOfCommands = 2;
    bytes memory getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Owner, 
        GovernanceQueryType.PendingOwner
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
        governanceId, 
        amountOfCommands, 
        new bytes(0)
      )
    );

    amountOfCommands = 2;
    getRes = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Owner, 
        GovernanceQueryType.PendingOwner
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateAdmin, 
        newAdmin
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateAdmin, 
        newAdmin
      )
    );

    (address newAdmin_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Admin
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.RelinquishOwnership
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
        governanceId, 
        amountOfCommands,
        GovernanceCommand.RelinquishOwnership, 
        GovernanceCommand.UpdateAdmin
      )
    );

    amountOfCommands = 1;
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.RelinquishOwnership
      )
    );

    (address owner_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands,
        GovernanceQueryType.Owner
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.AddPeer, 
        peerChain, 
        newPeer
      )
    );

    vm.startPrank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.AddPeer, 
        peerChain, 
        newPeer
      )
    );

    (bytes32 peer, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.Peers,
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateMaxGasDropoff, 
        targetChain,
        maxGasDropoff
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateMaxGasDropoff, 
        targetChain,
        maxGasDropoff
      )
    );

    (uint32 maxGasDropoff_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.MaxGasDropoff,
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateFeeRecipient, 
        newFeeRecipient
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateFeeRecipient, 
        newFeeRecipient
      )
    );

    (address newFeeRecipient_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.FeeRecipient
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateRelayFee, 
        newRelayFee
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateRelayFee, 
        newRelayFee
      )
    );

    (uint32 newRelayFee_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.RelayFee
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.PauseOutboundTransfers, 
        paused
      )
    );

    vm.prank(admin);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.PauseOutboundTransfers, 
        paused
      )
    );

    (bool paused_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.OutboundTransfersPaused
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
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateCanonicalPeer, 
        peerChain,
        newCanonicalPeer
      )
    );

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        GovernanceCommand.UpdateCanonicalPeer, 
        peerChain,
        newCanonicalPeer
      )
    );

    (bytes32 newCanonicalPeer_, ) = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        GovernanceQueryType.CanonicalPeer,
        peerChain
      )
    ).asBytes32Unchecked(0);

    assertEq(newCanonicalPeer_, newCanonicalPeer);
  }

  function testUnknownCommand() public {
    uint8 amountOfCommands = 1;
    uint8 fakeCommand = uint8(type(GovernanceCommand).max) + 1;

    vm.prank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(UnknownGovernanceCommand.selector, fakeCommand)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        dispatcherVersion, 
        governanceId, 
        amountOfCommands, 
        fakeCommand
      )
    );
  }

  function testUnknownQuery() public {
    uint8 amountOfCommands = 1;
    uint8 fakeQuery = uint8(type(GovernanceQueryType).max) + 1;

    vm.prank(owner);
    vm.expectRevert(
      abi.encodeWithSelector(UnknownGovernanceQuery.selector, fakeQuery)
    );
    invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        dispatcherVersion, 
        governanceQueryId, 
        amountOfCommands, 
        fakeQuery
      )
    );
  }
}
