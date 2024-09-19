// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {ProxyBase} from "wormhole-sdk/proxy/ProxyBase.sol";
import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {TbrBase} from "./TbrBase.sol";
import "./TbrIds.sol";

//rationale for different roles (owner, admin):
// * owner should be a mulit-sig / ultra cold wallet that is only activated in exceptional
//     circumstances.
// * admin should also be either a cold wallet or Admin contract. In either case,
//     the expectation is that multiple, slightly less trustworthy parties than the owner will
//     have access to it, lowering trust assumptions and increasing attack surface. Admin
//     perform rare but not exceptional operations like registering new peers, etc.

struct GovernanceState {
  address owner; //puts owner address in eip1967 admin slot
  address pendingOwner;
  address payable feeRecipient;
  mapping(address => bool) admins;
}

// we use the designated eip1967 admin storage slot: keccak256("eip1967.proxy.admin") - 1
bytes32 constant GOVERNANCE_STORAGE_SLOT =
  0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

function governanceState() pure returns (GovernanceState storage state) {
  assembly ("memory-safe") { state.slot := GOVERNANCE_STORAGE_SLOT }
}

error NotAuthorized();
error InvalidFeeRecipient();
error InvalidGovernanceCommand(uint8 command);
error InvalidGovernanceQuery(uint8 query);
error UnknownRole(Role role);

enum Role {
  Owner,
  Admin,
  FeeRecipient
}

event RoleUpdated(Role role, address oldAddress, address newAddress, uint256 timestamp);
event AdminsUpdated(address newAddress, bool isAdmin, uint256 timestamp);

abstract contract TbrGovernance is TbrBase, ProxyBase {
  using BytesParsing for bytes;
  using SafeERC20 for IERC20;

  // ---- construction ----

  function _governanceConstruction(
    address owner,
    address admin,
    address payable feeRecipient
  ) internal {
    if (feeRecipient == address(0))
      revert InvalidFeeRecipient();

    GovernanceState storage state = governanceState();
    state.owner         = owner;
    state.feeRecipient  = feeRecipient;
    state.admins[admin] = true;
  }

  // ---- externals ----

  function _batchGovernanceCommands(bytes calldata commands, uint offset) internal returns (uint) {
    GovernanceState storage state = governanceState();
    bool isOwner;
    if (msg.sender == state.owner) //check highest privilege level first
      isOwner = true;
    else if (_isAdmin(msg.sender))
      isOwner = false;
    else if (msg.sender == state.pendingOwner) {
      _updateRole(Role.Owner, msg.sender);
      isOwner = true;
    }
    else
      revert NotAuthorized();

    uint commandCount;
    (commandCount, offset) = commands.asUint8CdUnchecked(offset);

    for (uint i = 0; i < commandCount; ++i) {
      uint8 command;
      (command, offset) = commands.asUint8CdUnchecked(offset);

      if (command == ADD_PEER) {
        uint16 peerChain;
        bytes32 newPeer;
        (peerChain, offset) = commands.asUint16CdUnchecked(offset);
        (newPeer,   offset) = commands.asBytes32CdUnchecked(offset);
        _addPeer(peerChain, newPeer);
      }
      else if (command == SWEEP_TOKENS) {
        address token;
        uint256 amount;
        (token,  offset) = commands.asAddressCdUnchecked(offset);
        (amount, offset) = commands.asUint256CdUnchecked(offset);

        if (token == address(0))
          _transferEth(msg.sender, amount);
        else
          IERC20(token).safeTransfer(msg.sender, amount);
      }
      else if (command == UPDATE_MAX_GAS_DROPOFF) {
        uint16 targetChain;
        uint32 newMaxGasDropoff;
        (targetChain,      offset) = commands.asUint16CdUnchecked(offset);
        (newMaxGasDropoff, offset) = commands.asUint32CdUnchecked(offset);
        _setMaxGasDropoff(targetChain, newMaxGasDropoff);
      }
      else if (command == UPDATE_FEE_RECIPIENT) {
        address newFeeRecipient;
        (newFeeRecipient, offset) = commands.asAddressCdUnchecked(offset);
        _updateRole(Role.FeeRecipient, newFeeRecipient);
      }
      else if (command == UPDATE_BASE_FEE) {
        uint16 targetChain;
        uint32 newBaseFee;
        (targetChain, offset) = commands.asUint16CdUnchecked(offset);
        (newBaseFee,  offset) = commands.asUint32CdUnchecked(offset);
        _setBaseFee(targetChain, newBaseFee);
      }
      else if (command == PAUSE_CHAIN) {
        uint16 targetChain;
        bool paused;
        (targetChain, offset) = commands.asUint16CdUnchecked(offset);
        (paused,      offset) = commands.asBoolCdUnchecked(offset);
        _setPause(targetChain, paused);
      }
      else if (command == UPDATE_TX_SIZE_SENSITIVE) {
        uint16 targetChain;
        bool txSizeSensitive;
        (targetChain,     offset) = commands.asUint16CdUnchecked(offset);
        (txSizeSensitive, offset) = commands.asBoolCdUnchecked(offset);
        _setChainTxSizeSensitive(targetChain, txSizeSensitive);
      }
      else {
        if (!isOwner)
          revert NotAuthorized();

        if (command == UPDATE_ADMIN) {
          address newAdmin;
          bool authorization;
          (newAdmin,      offset) = commands.asAddressCdUnchecked(offset);
          (authorization, offset) = commands.asBoolCdUnchecked(offset);
          _updateAdmins(newAdmin, authorization);
        }
        else if (command == UPDATE_CANONICAL_PEER) {
          uint16 peerChain;
          bytes32 newCanonicalPeer;
          (peerChain,        offset) = commands.asUint16CdUnchecked(offset);
          (newCanonicalPeer, offset) = commands.asBytes32CdUnchecked(offset);
          _setCanonicalPeer(peerChain, newCanonicalPeer);
        }
        else if (command == UPGRADE_CONTRACT) {
          address newImplementation;
          (newImplementation, offset) = commands.asAddressCdUnchecked(offset);
          //contract upgrades must be the last command in the batch
          commands.checkLengthCd(offset);

          _upgradeTo(newImplementation, new bytes(0));
        }
        else if (command == PROPOSE_OWNERSHIP_TRANSFER) {
          address newOwner;
          (newOwner, offset) = commands.asAddressCdUnchecked(offset);
          state.pendingOwner = newOwner;
        }
        else if (command == RELINQUISH_OWNERSHIP) {
          _updateRole(Role.Owner, address(0));
          //ownership relinquishment must be the last command in the batch
          commands.checkLengthCd(offset);
        }
        else
          revert InvalidGovernanceCommand(command);
      }
    }
    return offset;
  }

  function _batchGovernanceQueries(
    bytes calldata queries,
    uint offset
  ) internal view returns (bytes memory, uint) {
    bytes memory ret;
    uint8 queryCount;
    (queryCount, offset) = queries.asUint8CdUnchecked(offset);

    GovernanceState storage state = governanceState();
    for (uint8 i = 0; i < queryCount; i++) {
      uint8 query;
      (query, offset) = queries.asUint8CdUnchecked(offset);

      if (query == BASE_FEE) {
        uint16 targetChainId;
        (targetChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getBaseFee(targetChainId));
      }
      else if (query == MAX_GAS_DROPOFF) {
        uint16 targetChainId;
        (targetChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getMaxGasDropoff(targetChainId));
      }
      else if (query == IS_CHAIN_PAUSED) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isPaused(chainId));
      }
      else if (query == IS_PEER) {
        uint16 peerChainId;
        bytes32 peer;
        (peerChainId, offset) = queries.asUint16CdUnchecked(offset);
        (peer, offset) = queries.asBytes32CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isPeer(peerChainId, peer));
      }
      else if (query == IS_TX_SIZE_SENSITIVE) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isChainTxSizeSensitive(chainId));
      }
      else if (query == CANONICAL_PEER) {
        uint16 peerChainId;
        (peerChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getCanonicalPeer(peerChainId));
      }
      else if (query == IS_CHAIN_SUPPORTED) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isChainSupported(chainId));
      }
      else if (query == OWNER)
        ret = abi.encodePacked(ret, state.owner);
      else if (query == PENDING_OWNER)
        ret = abi.encodePacked(ret, state.pendingOwner);
      else if (query == IS_ADMIN) {
        address admin;
        (admin, offset) = queries.asAddressCdUnchecked(offset);
        ret = abi.encodePacked(ret, _isAdmin(admin));
      }
      else if (query == FEE_RECIPIENT)
        ret = abi.encodePacked(ret, state.feeRecipient);
      else if (query == IMPLEMENTATION)
        ret = abi.encodePacked(ret, _getImplementation());
      else
        revert InvalidGovernanceQuery(query);
    }

    return (ret, offset);
  }

  function _getFeeRecipient() view internal returns(address payable) {
    return governanceState().feeRecipient;
  }

  function _isAdmin(address admin) internal view returns (bool) {
    return governanceState().admins[admin];
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
    else if (role == Role.FeeRecipient) {
      if (newAddress == address(0))
        revert InvalidFeeRecipient();

      oldAddress = state.feeRecipient;
      state.feeRecipient = payable(newAddress);
    }
    else
      return;

    emit RoleUpdated(role, oldAddress, newAddress, block.timestamp);
  }

  function _updateAdmins(address admin, bool authorization) private {
    governanceState().admins[admin] = authorization;
    emit AdminsUpdated(admin, authorization, block.timestamp);
  }
}
