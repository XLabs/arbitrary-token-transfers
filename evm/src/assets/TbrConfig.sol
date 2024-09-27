// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { 
  AccessControlState, 
  accessControlState, 
  NotAuthorized 
} from "./sharedComponents/AccessControl.sol";
import { SafeERC20 } from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { IERC20 } from "@openzeppelin/token/ERC20/IERC20.sol";
import { ProxyBase } from "wormhole-sdk/proxy/ProxyBase.sol";
import { TbrBase } from "./TbrBase.sol";
import "./TbrIds.sol";

struct ConfigState {
  address payable feeRecipient;
}

// keccak256("ConfigState") - 1
bytes32 constant CONFIG_STORAGE_SLOT =
  0xa1f28b22c196686da956abee6956ab0f6625f5b97ed2295735931c66c7c7b5e8;

function configState() pure returns (ConfigState storage state) {
  assembly ("memory-safe") { state.slot := CONFIG_STORAGE_SLOT }
}

error InvalidFeeRecipient();
error InvalidConfigCommand(uint8 command);
error InvalidConfigQuery(uint8 query);

event FeeRecipienUpdated(address oldAddress, address newAddress, uint256 timestamp);

abstract contract TbrConfig is TbrBase, ProxyBase {
  using BytesParsing for bytes;
  using SafeERC20 for IERC20;

  // ---- construction ----

  function _configConstruction(
    address payable feeRecipient
  ) internal {
    if (feeRecipient == address(0))
      revert InvalidFeeRecipient();

    configState().feeRecipient  = feeRecipient;
  }

  // ---- externals ----

  function _batchConfigCommands(bytes calldata commands, uint offset) internal returns (uint) {
    AccessControlState storage state = accessControlState();
    bool isOwner;
    if (msg.sender == state.owner) //check highest privilege level first
      isOwner = true;
    else if (state.isAdmin[msg.sender])
      isOwner = false;
    else
      revert NotAuthorized();

    uint commandCount;
    (commandCount, offset) = commands.asUint8CdUnchecked(offset);

    for (uint i = 0; i < commandCount; ++i) {
      uint8 command;
      (command, offset) = commands.asUint8CdUnchecked(offset);

      if (command == ADD_PEER_ID) {
        uint16 peerChain;
        bytes32 newPeer;
        (peerChain, offset) = commands.asUint16CdUnchecked(offset);
        (newPeer,   offset) = commands.asBytes32CdUnchecked(offset);
        _addPeer(peerChain, newPeer);
      }
      else if (command == UPDATE_BASE_FEE_ID) {
        uint16 targetChain;
        uint32 newBaseFee;
        (targetChain, offset) = commands.asUint16CdUnchecked(offset);
        (newBaseFee,  offset) = commands.asUint32CdUnchecked(offset);
        _setBaseFee(targetChain, newBaseFee);
      }
      else if (command == UPDATE_MAX_GAS_DROPOFF_ID) {
        uint16 targetChain;
        uint32 newMaxGasDropoff;
        (targetChain,      offset) = commands.asUint16CdUnchecked(offset);
        (newMaxGasDropoff, offset) = commands.asUint32CdUnchecked(offset);
        _setMaxGasDropoff(targetChain, newMaxGasDropoff);
      }
      else if (command == PAUSE_CHAIN_ID) {
        uint16 targetChain;
        bool paused;
        (targetChain, offset) = commands.asUint16CdUnchecked(offset);
        (paused,      offset) = commands.asBoolCdUnchecked(offset);
        _setPause(targetChain, paused);
      }
      else if (command == UPDATE_TX_SIZE_SENSITIVE_ID) {
        uint16 targetChain;
        bool txSizeSensitive;
        (targetChain,     offset) = commands.asUint16CdUnchecked(offset);
        (txSizeSensitive, offset) = commands.asBoolCdUnchecked(offset);
        _setChainTxSizeSensitive(targetChain, txSizeSensitive);
      }
      else if (command == UPDATE_FEE_RECIPIENT_ID) {
        address newFeeRecipient;
        (newFeeRecipient, offset) = commands.asAddressCdUnchecked(offset);
        _setFeeRecipient(newFeeRecipient);
      }
      else if (command == UPDATE_CANONICAL_PEER_ID) {
        if (!isOwner)
          revert NotAuthorized();
        uint16 peerChain;
        bytes32 newCanonicalPeer;
        (peerChain,        offset) = commands.asUint16CdUnchecked(offset);
        (newCanonicalPeer, offset) = commands.asBytes32CdUnchecked(offset);
        _setCanonicalPeer(peerChain, newCanonicalPeer);
      }
        else
          revert InvalidConfigCommand(command);
      
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

    for (uint8 i = 0; i < queryCount; i++) {
      uint8 query;
      (query, offset) = queries.asUint8CdUnchecked(offset);

      if (query == BASE_FEE_ID) {
        uint16 targetChainId;
        (targetChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getBaseFee(targetChainId));
      }
      else if (query == MAX_GAS_DROPOFF_ID) {
        uint16 targetChainId;
        (targetChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getMaxGasDropoff(targetChainId));
      }
      else if (query == IS_CHAIN_PAUSED_ID) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isPaused(chainId));
      }
      else if (query == IS_PEER_ID) {
        uint16 peerChainId;
        bytes32 peer;
        (peerChainId, offset) = queries.asUint16CdUnchecked(offset);
        (peer, offset) = queries.asBytes32CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isPeer(peerChainId, peer));
      }
      else if (query == IS_TX_SIZE_SENSITIVE_ID) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isChainTxSizeSensitive(chainId));
      }
      else if (query == CANONICAL_PEER_ID) {
        uint16 peerChainId;
        (peerChainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _getCanonicalPeer(peerChainId));
      }
      else if (query == IS_CHAIN_SUPPORTED_ID) {
        uint16 chainId;
        (chainId, offset) = queries.asUint16CdUnchecked(offset);
        ret = abi.encodePacked(ret, _isChainSupported(chainId));
      }
      else if (query == FEE_RECIPIENT_ID)
        ret = abi.encodePacked(ret, _getFeeRecipient());
      else
        revert InvalidConfigQuery(query);
    }

    return (ret, offset);
  }

  function _getFeeRecipient() view internal returns(address payable) {
    return configState().feeRecipient;
  }

  // ---- private ----

  function _setFeeRecipient(address newFeeRecipient) internal {
    AccessControlState storage acState = accessControlState();
    if (msg.sender != acState.owner && !acState.isAdmin[msg.sender]) 
      revert NotAuthorized();
    
    ConfigState storage state = configState();
    address oldFeeRecipient = state.feeRecipient;
    state.feeRecipient = payable(newFeeRecipient);
    emit FeeRecipienUpdated(oldFeeRecipient, newFeeRecipient, block.timestamp);
  }
}
