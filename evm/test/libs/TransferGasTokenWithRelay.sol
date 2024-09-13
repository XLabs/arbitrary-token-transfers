// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {TRANSFER_GAS_TOKEN_WITH_RELAY_ID} from "tbr/assets/TbrIds.sol";
import {TransferGasTokenWithRelay} from "tbr/assets/TbrUser.sol";
import {InvalidCommand} from "tbr/assets/TbrUser.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "forge-std/Test.sol";

contract TransferGasTokenWithRelayTest is Test {
  using BytesParsing for bytes;

  function parseTransferGasToken(
    bytes calldata data, 
    uint256 commandIndex
  ) external pure returns (    
    bytes32 recipient,
    uint16 chainId,
    uint256 tokenAmount,
    uint32 gasDropoff,
    uint256 size
  ) {
    (recipient, chainId, tokenAmount, gasDropoff, size) = TransferGasTokenWithRelay.parseTransferGasToken(data, commandIndex);
  }

  function testParseTransferGasToken(    
    uint16 chainId,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 tokenAmount
  ) public view {
    bytes memory data = abi.encodePacked(recipient, chainId, tokenAmount, gasDropoff);
    uint commandIndex = 0;

    uint offset;
    uint16 chainId_;
    uint32 gasDropoff_;
    bytes32 recipient_;
    uint256 tokenAmount_;
    (recipient_, chainId_, tokenAmount_, gasDropoff_, offset) = this.parseTransferGasToken(data, commandIndex);
    assertEq(recipient_, recipient);
    assertEq(chainId_, chainId);
    assertEq(tokenAmount_, tokenAmount);
    assertEq(gasDropoff_, gasDropoff);
    assertEq(offset, data.length);
  }

  function testParseTransferGasToken_InvalidCommand(
    uint16 chainId,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 tokenAmount
  ) public {
    bytes memory data = abi.encodePacked(recipient, uint8(chainId), tokenAmount, gasDropoff);
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidCommand.selector, TRANSFER_GAS_TOKEN_WITH_RELAY_ID, commandIndex
      )
    );
    this.parseTransferGasToken(data, commandIndex);
  }
}

