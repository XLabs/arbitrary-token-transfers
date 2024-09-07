// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {RawDispatcher} from "wormhole-sdk/dispatcher/RawDispatcher.sol";
import {TbrGovernance} from "./TbrGovernance.sol";
import "./TbrIds.sol";
import {TbrUser} from "./TbrUser.sol";
import {InvalidCommand} from "./TbrBase.sol";

error UnsupportedVersion(uint8 version);
error InvalidQuery(uint8 query);

abstract contract TbrDispatcher is RawDispatcher, TbrGovernance, TbrUser {
  using BytesParsing for bytes;

  function _exec(bytes calldata data) internal override returns (bytes memory) {
    uint offset = 0;
    uint256 commandIndex = 0;
    uint8 version;
    (version, offset) = data.asUint8Unchecked(offset);
    uint256 senderRefund = msg.value;

    if (version == 0) {
      while (offset < data.length) {
        uint8 command;
        (command, offset) = data.asUint8Unchecked(offset);

        uint movedOffset;
        if (command == TRANSFER_TOKEN_WITH_RELAY_ID) {
          uint256 fee;
          (fee, movedOffset) = transferTokenWithRelay(data[offset:], senderRefund, commandIndex);
          senderRefund -= fee;
        } else if (command == TRANSFER_GAS_TOKEN_WITH_RELAY_ID) {
          //(movedOffset) = _wrapAndTransferEthWithRelay(data[offset:]);
        } else if (command == COMPLETE_ID) {
          //(movedOffset) = _complete(data[offset:]);
        }
        else if (command == GOVERNANCE_ID)
          movedOffset = batchGovernanceCommands(data[offset:]);
        else 
          revert InvalidCommand(command, commandIndex);

        offset += movedOffset;
        commandIndex += 1;
      }
      data.checkLength(offset);
    } else 
      revert UnsupportedVersion(version);
  }

  function _get(bytes calldata data) internal view override returns (bytes memory) {
    bytes memory ret;
    uint offset = 0;
    uint8 version;
    (version, offset) = data.asUint8Unchecked(offset);

    if (version == 0) {
      while (offset < data.length) {
        uint8 query;
        (query, offset) = data.asUint8Unchecked(offset);
        
        bytes memory result;
        uint movedOffset;
        if (query == RELAY_FEE_ID) {
          //(result, movedOffset) = _relayFee(data[offset:]);
        } else if (query == BASE_RELAYING_CONFIG_ID) {
          //(result, movedOffset) = _baseRelayingConfig(data[offset:]);
        } 
        else if (query == GOVERNANCE_QUERIES_ID) 
          (result, movedOffset) = batchGovernanceQueries(data[offset:]);
        else 
          revert InvalidQuery(query);

        ret = abi.encodePacked(ret, result);
        offset += movedOffset;
      }
      data.checkLength(offset);
      return ret;
    } else 
      revert UnsupportedVersion(version);
  }
}