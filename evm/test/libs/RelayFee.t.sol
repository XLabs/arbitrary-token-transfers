// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {InvalidCommand, RelayFee} from "tbr/assets/TbrUser.sol";
import {RELAY_FEE_ID} from "tbr/assets/TbrIds.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "forge-std/Test.sol";

contract RelayFeeTest is Test {
  using BytesParsing for bytes;

  function parseRelayFeeArgs(
    bytes calldata data, 
    uint256 commandIndex
  ) external pure returns (uint16 chainId, uint32 gasDropoff, uint256 consumedBytes) {
    (chainId, gasDropoff, consumedBytes) = RelayFee.parseRelayFeeArgs(data, commandIndex);
  }

  function testParseRelayFeeArgs(uint16 chainId, uint32 gasDropoff) public view {
    bytes memory data = abi.encodePacked(chainId, gasDropoff);
    uint commandIndex = 0;

    uint offset;
    uint16 chainId_;
    uint32 gasDropoff_;
    (chainId_, gasDropoff_, offset) = this.parseRelayFeeArgs(data, commandIndex);
    assertEq(chainId_, chainId);
    assertEq(gasDropoff_, gasDropoff);
    assertEq(offset, data.length);
  }

  function testParseRelayFeeArgs_InvalidCommand(uint16 chainId, uint32 gasDropoff) public {
    bytes memory data = abi.encodePacked(uint8(chainId), gasDropoff);
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidCommand.selector, RELAY_FEE_ID, commandIndex
      )
    );

    this.parseRelayFeeArgs(data, commandIndex);
  }
}
