// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";
import "wormhole-sdk/dispatcher/RawDispatcher.sol";
import "./TbrGovernance.sol";

error UnsupportedVersion(uint8 version);
error UnknownCommand(uint8 command);
error UnknownQuery(uint8 query);

abstract contract TbrDispatcher is RawDispatcher, TbrGovernance {
  using BytesParsing for bytes;

  // Execute commands

  uint8 constant TRANSFER_TOKENS_WITH_RELAY_ID = 0;
  uint8 constant WRAP_AND_TRANSFER_ETH_WITH_RELAY_ID = 1;
  uint8 constant COMPLETE_ID = 2;
  uint8 constant GOVERNANCE_ID = 3;

  // Query commands

  uint8 constant RELAY_FEE_ID = 0x80;
  uint8 constant BASE_RELAYING_CONFIG_ID = 0x81;
  uint8 constant GOVERNANCE_QUERIES_ID = 0x82;

  function _exec(bytes calldata data) internal override returns (bytes memory) {
    uint offset = 0;
    uint8 version;
    (version, offset) = data.asUint8Unchecked(offset);

    if (version == 0) {
      while (offset < data.length) {
        uint8 command;
        (command, offset) = data.asUint8Unchecked(offset);

        uint movedOffset;
        if (command == TRANSFER_TOKENS_WITH_RELAY_ID) {
          //(movedOffset) = _transferTokensWithRelay(data[offset:]);
        } else if (command == WRAP_AND_TRANSFER_ETH_WITH_RELAY_ID) {
          //(movedOffset) = _wrapAndTransferEthWithRelay(data[offset:]);
        } else if (command == COMPLETE_ID) {
          //(movedOffset) = _complete(data[offset:]);
        }
        else if (command == GOVERNANCE_ID)
          movedOffset = batchGovernanceCommands(data[offset:]);
        else 
          revert UnknownCommand(command);

        offset += movedOffset;
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
          //(result, movedOffset) = _relayFee(data[offset:], amountOfCommands);
        } else if (query == BASE_RELAYING_CONFIG_ID) {
          //(result, movedOffset) = _baseRelayingConfig(data[offset:], amountOfCommands);
        } 
        else if (query == GOVERNANCE_QUERIES_ID) 
          (result, movedOffset) = batchGovernanceQueries(data[offset:]);
        else 
          revert UnknownQuery(query);

        ret = abi.encodePacked(ret, result);
        offset += movedOffset;
      }
      data.checkLength(offset);
      return ret;
    } else 
      revert UnsupportedVersion(version);
  }
}