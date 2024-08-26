// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";
import "wormhole-sdk/dispatcher/RawDispatcher.sol";
import "./TbrGovernance.sol";


error UnsupportedVersion(uint8 version);

abstract contract TbrDispatcher is RawDispatcher, TbrUser, TbrGovernance {
  using BytesParsing for bytes;

  function _exec(bytes calldata data) internal override returns (bytes memory) {
    uint offset = 0;
    uint8 version;
    (version, offset) = data.asUint8Unchecked(offset);

    if (version == 0) {
      while (offset < data.length) {
        uint8 command_;
        (command_, offset) = data.asUint8Unchecked(offset);
        CommandType command = CommandType(command_);

        uint8 amountOfCommands;
        (amountOfCommands, offset) = data.asUint8Unchecked(offset);

        uint movedOffset;
        if (command == CommandType.Price) {
          GovernanceState storage state = governanceState();
          if (msg.sender != state.feeUpdater && msg.sender != state.admin && msg.sender != state.owner)
            revert NotAuthorized();

          movedOffset = _batchPriceCommands(data[offset:], amountOfCommands);
        }
        else if (command == CommandType.Governance)
          movedOffset = _batchGovernanceCommands(data[offset:], amountOfCommands);
        else 
          assert(false);

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
        uint8 query_;
        (query_, offset) = data.asUint8Unchecked(offset);
        CommandType query = CommandType(query_);

        uint8 amountOfCommands;
        (amountOfCommands, offset) = data.asUint8Unchecked(offset);
        
        bytes memory result;
        uint movedOffset;
        if (query == CommandType.Price)
          (result, movedOffset) = _batchPriceQueries(data[offset:], amountOfCommands);
        else if (query == CommandType.Governance)
          (result, movedOffset) = _batchGovernanceQueries(data[offset:], amountOfCommands);
        else 
          assert(false);

        ret = abi.encodePacked(ret, result);
        offset += movedOffset;
      }
      data.checkLength(offset);
      return ret;
    } else 
      revert UnsupportedVersion(version);
  }
}