// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import "./ids.sol";

//rationale for different roles (owner, admin):
// * owner should be a mulit-sig / ultra cold wallet that is only activated in exceptional
//     circumstances.
// * admin should also be either a cold wallet or Admin contract. In either case,
//     the expectation is that multiple, slightly less trustworthy parties than the owner will
//     have access to it, lowering trust assumptions and increasing attack surface. Admins
//     perform rare but not exceptional operations.

struct AccessControlState {
  address   owner; //puts owner address in eip1967 admin slot
  address   pendingOwner;
  address[] admins;
  mapping(address => bool) isAdmin;
}

// we use the designated eip1967 admin storage slot:
// keccak256("eip1967.proxy.admin") - 1
bytes32 constant ACCESS_CONTROL_STORAGE_SLOT =
  0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

function accessControlState() pure returns (AccessControlState storage state) {
  assembly ("memory-safe") { state.slot := ACCESS_CONTROL_STORAGE_SLOT }
}

error NotAuthorized();
error InvalidAccessControlCommand(uint8 command);
error InvalidAccessControlQuery(uint8 query);

event OwnerUpdated(address oldAddress, address newAddress, uint256 timestamp);
event AdminsUpdated(address newAddress, bool isAdmin, uint256 timestamp);

abstract contract AccessControl {
  using BytesParsing for bytes;

  // ---- construction ----

  function _accessControlConstruction(
    address owner,
    address admin
  ) internal {
    accessControlState().owner = owner;
    _updateAdmins(admin, true);
  }

  // ---- internals ----

  function _batchAccessControlCommands(
    bytes calldata commands,
    uint offset
  ) internal returns (uint) {
    AccessControlState storage state = accessControlState();
    bool isOwner;
    if (msg.sender == state.owner) //check highest privilege level first
      isOwner = true;
    else if (state.isAdmin[msg.sender])
      isOwner = false;
    else
      revert NotAuthorized();

    uint remainingCommands;
    (remainingCommands, offset) = commands.asUint8CdUnchecked(offset);
    for (uint i = 0; i < remainingCommands; ++i) {
      uint8 command;
      (command, offset) = commands.asUint8CdUnchecked(offset);
      if (command == REVOKE_ADMIN_ID) {
        address admin;
        (admin, offset) = commands.asAddressCdUnchecked(offset);
        _updateAdmins(admin, false);
      }
      else if (command == RELINQUISH_ADMINISTRATION_ID) {
        _updateAdmins(msg.sender, false);

        //administration relinquishment must be the last command in the batch
        commands.checkLength(offset);
      } 
      else {
        if (!isOwner)
          revert NotAuthorized();

        if (command == ADD_ADMIN_ID) {
          address newAdmin;
          (newAdmin, offset) = commands.asAddressCdUnchecked(offset);
          _updateAdmins(newAdmin, true);
        }
        else if (command == PROPOSE_OWNERSHIP_TRANSFER_ID) {
          address newOwner;
          (newOwner, offset) = commands.asAddressCdUnchecked(offset);

          state.pendingOwner = newOwner;
        }
        else if (command == RELINQUISH_OWNERSHIP_ID) {
          _updateOwner(address(0));

          //ownership relinquishment must be the last command in the batch
          commands.checkLengthCd(offset);
        }
        else
          revert InvalidAccessControlCommand(command);
      }
    }
    return offset;
  }

  function _batchAccessControlQueries(
    bytes calldata queries,
    uint offset
  ) internal view returns (bytes memory, uint) {
    AccessControlState storage state = accessControlState();
    bytes memory ret;

    uint remainingQueries;
    (remainingQueries, offset) = queries.asUint8CdUnchecked(offset);
    for (uint i = 0; i < remainingQueries; ++i) {
      uint8 query;
      (query, offset) = queries.asUint8CdUnchecked(offset);
      
      if (query == IS_ADMIN_ID) {
        address admin;
        (admin, offset) = queries.asAddressCdUnchecked(offset);
        ret = abi.encodePacked(ret, state.isAdmin[admin]);
      } 
      else if (query == ADMINS_ID) {
        ret = abi.encodePacked(ret, state.admins.length);
        for (uint j = 0; j < state.admins.length; ++j)
          ret = abi.encodePacked(ret, state.admins[j]);
      }
      else {
        address addr;
        if (query == OWNER_ID)
          addr = state.owner;
        else if (query == PENDING_OWNER_ID)
          addr = state.pendingOwner;
        else
          revert InvalidAccessControlQuery(query);

        ret = abi.encodePacked(ret, addr);
      }
    }

    return (ret, offset);
  }

  function isAdmin(address admin) internal view returns (bool) {
    return accessControlState().isAdmin[admin];
  }

  function _acquireOwnership() internal {
    AccessControlState storage state = accessControlState();
    if (state.pendingOwner != msg.sender)
      revert NotAuthorized();

    state.pendingOwner = address(0);
    _updateOwner(msg.sender);
  }

  // ---- private ----

  function _updateOwner(address newOwner) private {
    address oldAddress;
    accessControlState().owner = newOwner;
    emit OwnerUpdated(oldAddress, newOwner, block.timestamp);
  }

  function _updateAdmins(address admin, bool authorization) private {
    AccessControlState storage state = accessControlState();
    if (state.isAdmin[admin] == authorization)
      return;

    state.isAdmin[admin] = authorization;

    if (authorization)
      state.admins.push(admin);
    else {
      for (uint i = 0; i < state.admins.length; ++i) {
        if (state.admins[i] == admin) {
          state.admins[i] = state.admins[state.admins.length - 1];
          state.admins.pop();
          break;
        }
      }
    }

    emit AdminsUpdated(admin, authorization, block.timestamp);
  }
}
