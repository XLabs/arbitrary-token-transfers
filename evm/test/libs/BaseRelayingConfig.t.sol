// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BASE_RELAYING_CONFIG_ID} from "tbr/assets/TbrIds.sol";
import {BaseRelayingConfig} from "tbr/assets/TbrUser.sol";
import {InvalidCommand} from "tbr/assets/TbrUser.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "forge-std/Test.sol";

contract BaseRelayingConfigTest is Test {
  using BytesParsing for bytes;

  function parseBaseRelayingConfigArgs(
    bytes calldata data, 
    uint256 commandIndex
  ) external pure returns (uint16 chainId, uint256 consumedBytes) {
    (chainId, consumedBytes) = BaseRelayingConfig.parseBaseRelayingConfigArgs(data, commandIndex);
  }

  function testParseBaseRelayingConfigArgs(uint16 chainId) public view {
    bytes memory data = abi.encodePacked(chainId);
    uint commandIndex = 0;

    uint offset;
    uint16 chainId_;
    (chainId_, offset) = this.parseBaseRelayingConfigArgs(data, commandIndex);
    assertEq(chainId_, chainId);
    assertEq(offset, data.length);
  }

  function testParseBaseRelayingConfigArgs_InvalidCommand(uint16 chainId) public {
    uint commandIndex = 0;
    bytes memory data = abi.encodePacked(uint8(chainId));

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidCommand.selector, BASE_RELAYING_CONFIG_ID, commandIndex
      )
    );

    this.parseBaseRelayingConfigArgs(data, commandIndex);
  }
}
