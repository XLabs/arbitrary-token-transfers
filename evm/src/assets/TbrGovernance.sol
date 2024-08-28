// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { ProxyBase } from "wormhole-sdk/proxy/ProxyBase.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "./TbrBase.sol";

//rationale for different roles (owner, admin):
// * owner should be a mulit-sig / ultra cold wallet that is only activated in exceptional
//     circumstances.
// * admin should also be either a cold wallet or Admin contract. In either case,
//     the expectation is that multiple, slightly less trustworthy parties than the owner will
//     have access to it, lowering trust assumptions and increasing attack surface. Admin
//     perform rare but not exceptional operations like registering new peers, etc.

struct GovernanceState {
  address  owner; //puts owner address in eip1967 admin slot
  address  pendingOwner;
  address  admin;
  address  feeRecipient;
}

// we use the designated eip1967 admin storage slot: keccak256("eip1967.proxy.admin") - 1
bytes32 constant GOVERNANCE_STORAGE_SLOT =
  0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

function governanceState() pure returns (GovernanceState storage state) {
  assembly ("memory-safe") { state.slot := GOVERNANCE_STORAGE_SLOT }
}

error NotAuthorized();
error InvalidFeeRecipient();

enum Role {
  Owner,
  Admin,
  FeeRecipient
}

enum GovernanceCommand {
  //admin can add new peers, but only owner can change existing registrations
  AddPeer,
  SweepTokens,
  UpdateMaxGasDropoff,
  UpdateFeeRecipient,
  UpdateRelayFee,
  PauseOutboundTransfers,
  //only available to owner:
  UpdateAdmin,
  UpdateCanonicalPeer,
  UpgradeContract,
  ProposeOwnershipTransfer,
  RelinquishOwnership
}

enum GovernanceQueryType {
  RelayFee,
  MaxGasDropoff,
  OutboundTransfersPaused,
  Peers,
  CanonicalPeer,
  Owner,         
  PendingOwner,
  Admin,
  FeeRecipient,
  Implementation
}

event RoleUpdated(Role role, address oldAddress, address newAddress, uint256 timestamp);

abstract contract TbrGovernance is TbrBase, ProxyBase {
  using BytesParsing for bytes;
  using SafeERC20 for IERC20;

  // ---- construction ----

  function _governanceConstruction(
    address owner,
    address admin,
    address feeRecipient
  ) internal {
    if (feeRecipient == address(0))
      revert InvalidFeeRecipient();

    GovernanceState storage state = governanceState();
    state.owner          = owner;
    state.admin          = admin;
    state.feeRecipient   = feeRecipient;
  }

  // ---- externals ----

  function batchGovernanceCommands(bytes calldata commands) internal returns (uint) {
    GovernanceState storage state = governanceState();
    bool isOwner;
    if (msg.sender == state.owner) //check highest privilege level first
      isOwner = true;
    else if (msg.sender == state.admin)
      isOwner = false;
    else if (msg.sender == state.pendingOwner) {
      _updateRole(Role.Owner, msg.sender);
      isOwner = true;
    }
    else
      revert NotAuthorized();

    uint offset = 0;
    uint8 amountOfCommands;
    (amountOfCommands, offset) = commands.asUint8Unchecked(offset);

    while (amountOfCommands > 0) {
      uint8 command_;
      (command_, offset) = commands.asUint8Unchecked(offset);
      GovernanceCommand command = GovernanceCommand(command_);
      if (command == GovernanceCommand.AddPeer) {
        uint16 peerChain;
        bytes32 newPeer;
        (peerChain, offset) = commands.asUint16Unchecked(offset);
        (newPeer,   offset) = commands.asBytes32Unchecked(offset);
        addPeer(peerChain, newPeer);
      }
      else if (command == GovernanceCommand.SweepTokens) {
        address token;
        (token, offset) = commands.asAddressUnchecked(offset);

        if (token == address(0))
          transferEth(msg.sender, address(this).balance);
        else
          IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
      }
      else if (command == GovernanceCommand.UpdateFeeRecipient) {
          address newFeeRecipient;
          (newFeeRecipient, offset) = commands.asAddressUnchecked(offset);
          _updateRole(Role.FeeRecipient, newFeeRecipient);
      }
      else if (command == GovernanceCommand.UpdateRelayFee) {
        uint32 newRelayFee;
        (newRelayFee, offset) = commands.asUint32Unchecked(offset);
        setRelayFee(newRelayFee);
      }
      else if (command == GovernanceCommand.UpdateMaxGasDropoff) {
        uint16 targetChain;
        uint32 newMaxGasDropoff;
        (targetChain, offset) = commands.asUint16Unchecked(offset);
        (newMaxGasDropoff, offset) = commands.asUint32Unchecked(offset);
        setMaxGasDropoff(targetChain, newMaxGasDropoff);
      }
      else if (command == GovernanceCommand.PauseOutboundTransfers) {
        bool paused;
        (paused, offset) = commands.asBoolUnchecked(offset);
        setPauseOutboundTransfers(paused);
      }
      else { //owner only commands
        if (!isOwner)
          revert NotAuthorized();

        if (command == GovernanceCommand.UpgradeContract) {
          address newImplementation;
          (newImplementation, offset) = commands.asAddressUnchecked(offset);
          //contract upgrades must be the last command in the batch
          commands.checkLength(offset);

          _upgradeTo(newImplementation, new bytes(0));
        }
        else if (command == GovernanceCommand.UpdateAdmin) {
          address newAdmin;
          (newAdmin, offset) = commands.asAddressUnchecked(offset);
          _updateRole(Role.Admin, newAdmin);
        }
        else if (command == GovernanceCommand.UpdateCanonicalPeer) {
          uint16 peerChain;
          bytes32 newCanonicalPeer;
          (peerChain, offset) = commands.asUint16Unchecked(offset);
          (newCanonicalPeer, offset) = commands.asBytes32Unchecked(offset);
          setCanonicalPeer(peerChain, newCanonicalPeer);
        }
        else if (command == GovernanceCommand.ProposeOwnershipTransfer) {
          address newOwner;
          (newOwner, offset) = commands.asAddressUnchecked(offset);

          state.pendingOwner = newOwner;
        }
        else if (command == GovernanceCommand.RelinquishOwnership) {
          _updateRole(Role.Owner, address(0));

          //ownership relinquishment must be the last command in the batch
          commands.checkLength(offset);
        }
        else
          _assertExhaustive();
      }
      amountOfCommands--;
    }
    commands.checkLength(offset);
  }

  function batchGovernanceQueries(bytes calldata queries) internal view returns (bytes memory, uint) {
    uint offset = 0;
    bytes memory ret;
    uint8 amountOfQueries;
    (amountOfQueries, offset) = queries.asUint8Unchecked(offset);
    
    GovernanceState storage state = governanceState();
    while (amountOfQueries > 0) {
      uint8 query_;
      (query_, offset) = queries.asUint8Unchecked(offset);
      GovernanceQueryType query = GovernanceQueryType(query_);
      
      if (query == GovernanceQueryType.Owner)
        ret = abi.encodePacked(ret, state.owner); 
      else if (query == GovernanceQueryType.PendingOwner)
        ret = abi.encodePacked(ret, state.pendingOwner);
      else if (query == GovernanceQueryType.Admin)
        ret = abi.encodePacked(ret, state.admin);
      else if (query == GovernanceQueryType.FeeRecipient)
        ret = abi.encodePacked(ret, state.feeRecipient);
      else if (query == GovernanceQueryType.Implementation)
        ret = abi.encodePacked(ret, _getImplementation());
      else if (query == GovernanceQueryType.Peers) {
        uint16 peersChainId;
        (peersChainId, offset) = queries.asUint16Unchecked(offset);
        ret = abi.encodePacked(ret, getPeers(peersChainId));
      }
      else if (query == GovernanceQueryType.CanonicalPeer) {
        uint16 peerChainId;
        (peerChainId, offset) = queries.asUint16Unchecked(offset);
        ret = abi.encodePacked(ret, getCanonicalPeer(peerChainId));
      }
      else if (query == GovernanceQueryType.RelayFee)
        ret = abi.encodePacked(ret, getRelayFee());
      else if (query == GovernanceQueryType.MaxGasDropoff) {
        uint16 targetChainId;
        (targetChainId, offset) = queries.asUint16Unchecked(offset);
        ret = abi.encodePacked(ret, getMaxGasDropoff(targetChainId));
      }
      else if (query == GovernanceQueryType.OutboundTransfersPaused)
        ret = abi.encodePacked(ret, getPauseOutboundTransfers());
      else
        break;

      amountOfQueries--;
    }

    return (ret, offset);
  }

  // ---- private ----

  function _updateRole(Role role, address newAddress) private {
    GovernanceState storage state = governanceState();
    address oldAddress;
    if (role == Role.Owner) {
      oldAddress = state.owner;
      state.owner = newAddress;
      state.pendingOwner = address(0);
    }
    else if (role == Role.Admin) {
      oldAddress = state.admin;
      state.admin = newAddress;
    }
    else if (role == Role.FeeRecipient) {
      if (newAddress == address(0))
        revert InvalidFeeRecipient();

      oldAddress = state.feeRecipient;
      state.feeRecipient = newAddress;
    }
    else
      _assertExhaustive();

    emit RoleUpdated(role, oldAddress, newAddress, block.timestamp);
  }
}
