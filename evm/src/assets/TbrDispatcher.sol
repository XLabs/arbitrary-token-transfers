// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { AccessControl } from "./sharedComponents/AccessControl.sol";
import { SweepTokens } from "./sharedComponents/SweepTokens.sol";
import { RawDispatcher } from "wormhole-sdk/RawDispatcher.sol";
import { Upgrade } from "./sharedComponents/Upgrade.sol";
import { InvalidCommand } from "./TbrBase.sol";
import { TbrConfig } from "./TbrConfig.sol";
import { TbrUser } from "./TbrUser.sol";
import "./sharedComponents/ids.sol";
import "./TbrIds.sol";

/**
 * Command protocol version is unsupported
 */
error UnsupportedVersion(uint8 version);

abstract contract TbrDispatcher is RawDispatcher, TbrConfig, TbrUser, AccessControl, SweepTokens, Upgrade {
  using BytesParsing for bytes;

  function _exec(bytes calldata data) internal override returns (bytes memory) { unchecked {
    //nothing here can overflow or underflow - in particular, underflows are checked in the
    //  associated transfer functions
    uint offset = 0;
    uint8 version;
    (version, offset) = data.asUint8CdUnchecked(offset);

    if (version != DISPATCHER_PROTOCOL_VERSION0)
      revert UnsupportedVersion(version);

    uint256 senderRefund = msg.value;
    uint256 fees = 0;
    uint256 commandIndex = 0;
    while (offset < data.length) {
      uint8 command;
      (command, offset) = data.asUint8CdUnchecked(offset);

      if (command == TRANSFER_TOKEN_WITH_RELAY_ID) {
        uint256 fee; uint256 gasTokenSent;
        (fee, gasTokenSent, offset) =
          _transferTokenWithRelay(data, offset, senderRefund, commandIndex);
        fees += fee;
        senderRefund -= fee + gasTokenSent;
      } else if (command == TRANSFER_GAS_TOKEN_WITH_RELAY_ID) {
        uint256 fee; uint256 gasTokenSent;
        (fee, gasTokenSent, offset) =
          _transferGasTokenWithRelay(data, offset, senderRefund, commandIndex);
        fees += fee;
        senderRefund -= fee + gasTokenSent;
      } else if (command == COMPLETE_TRANSFER_ID) {
        uint256 gasDropoffSpent;
        (gasDropoffSpent, offset) = _completeTransfer(data, offset, senderRefund, commandIndex);
        senderRefund -= gasDropoffSpent;
      } else if (command == APPROVE_TOKEN_ID)
        offset = _approveToken(data, offset, commandIndex);
      else if (command == CONFIG_ID)
        offset = _batchConfigCommands(data, offset);
      else if (command == ACCESS_CONTROL_ID)
        offset = _batchAccessControlCommands(data, offset);
      else if (command == UPGRADE_CONTRACT_ID)
        offset = _upgradeContract(data, offset);
      else if (command == SWEEP_TOKENS_ID)
        offset = _sweepTokens(data, offset);
      else if (command == ACQUIRE_OWNERSHIP_ID)
        _acquireOwnership();
      else
        revert InvalidCommand(command, commandIndex);

      ++commandIndex;
    }

    data.checkLengthCd(offset);

    _transferEth(_getFeeRecipient(), fees);
    _transferEth(msg.sender, senderRefund);
    return new bytes(0);
  }}

  function _get(bytes calldata data) internal view override returns (bytes memory) { unchecked {
    bytes memory ret;
    uint offset = 0;
    uint8 version;
    (version, offset) = data.asUint8CdUnchecked(offset);

    if (version != DISPATCHER_PROTOCOL_VERSION0)
      revert UnsupportedVersion(version);

    uint queryIndex = 0;
    while (offset < data.length) {
      uint8 query;
      (query, offset) = data.asUint8CdUnchecked(offset);

      bytes memory result;
      if (query == RELAY_FEE_ID)
        (result, offset) = _relayFee(data, offset, queryIndex);
      else if (query == BASE_RELAYING_CONFIG_ID)
        (result, offset) = _baseRelayingConfig(data, offset, queryIndex);
      else if (query == CONFIG_QUERIES_ID)
        (result, offset) = _batchGovernanceQueries(data, offset);
      else if (query == ACCESS_CONTROL_QUERIES_ID)
        (result, offset) = _batchAccessControlQueries(data, offset);
      else if (query == IMPLEMENTATION_ID)
        result = abi.encodePacked(_getImplementation());
      else
        revert InvalidCommand(query, queryIndex);

      ret = abi.encodePacked(ret, result);
      ++queryIndex;
    }
    data.checkLengthCd(offset);
    return ret;
  }}
}