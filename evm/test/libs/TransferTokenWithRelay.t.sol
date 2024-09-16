// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TRANSFER_TOKEN_WITH_RELAY_ID} from "tbr/assets/TbrIds.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import { TransferTokenWithRelayTestWrapper } from "./TbrUserTestWrappers.sol";
import {
  ACQUIRE_PREAPPROVED,
  ACQUIRE_PERMIT,
  ACQUIRE_PERMIT2TRANSFER,
  ACQUIRE_PERMITE2PERMIT,
  InvalidCommand, 
  InvalidAcquireMode
} from "tbr/assets/TbrUser.sol";
import "forge-std/Test.sol";

contract TransferTokenWithRelayTest is Test {
  using BytesParsing for bytes;

  TransferTokenWithRelayTestWrapper wrapper;

  function setUp() public {
    wrapper = new TransferTokenWithRelayTestWrapper();
  }

  function checkTransferTokenBounds(
    bytes calldata data, 
    uint256 commandIndex
  ) external view returns (uint8 acquireMode, uint256 size) {
    (acquireMode, size) = wrapper.checkTransferTokenBounds(data, commandIndex);
  }

  function testCheckTransferTokenBounds(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );
    uint256 expectedSize = data.length;
    uint commandIndex = 0;

    uint16 acquireMode;
    uint256 size;
    (acquireMode, size) = this.checkTransferTokenBounds(data, commandIndex);
    assertEq(acquireMode, ACQUIRE_PREAPPROVED);
    assertEq(size, expectedSize);
  }

  function testCheckTransferTokenBounds_InvalidCommand(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public {
    bytes memory data = abi.encodePacked(
      recipient,
      uint8(chainId),
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidCommand.selector, TRANSFER_TOKEN_WITH_RELAY_ID, commandIndex
      )
    );
  
    this.checkTransferTokenBounds(data, commandIndex);
  }

  function testCheckTransferTokenBounds_InvalidAcquireMode(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent,
    uint8 acquireMode
  ) public {
    vm.assume(acquireMode != ACQUIRE_PREAPPROVED);
    vm.assume(acquireMode != ACQUIRE_PERMIT);
    vm.assume(acquireMode != ACQUIRE_PERMIT2TRANSFER);
    vm.assume(acquireMode != ACQUIRE_PERMITE2PERMIT);
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      acquireMode
    );
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidAcquireMode.selector, acquireMode
      )
    );

    this.checkTransferTokenBounds(data, commandIndex);
  }

  function testDecodeToken(    
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    IERC20 token = wrapper.decodeToken(data);
    assertEq(address(token), tokenAddress);
  }

  function testDecodeGasDropoff(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    uint32 gasDropoff_ = wrapper.decodeGasdropoff(data);
    assertEq(gasDropoff_, gasDropoff);
  }

  function testDecodeDecodeTargetChain(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    uint16 chainId_ = wrapper.decodeTargetChain(data);
    assertEq(chainId_, chainId);
  }

  function testDecodeTokenAmount(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    uint256 tokenAmount_ = wrapper.decodeTokenAmount(data);
    assertEq(tokenAmount_, tokenAmount);
  }

  function testDecodeRecipient(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    bytes32 recipient_ = wrapper.decodeRecipient(data);
    assertEq(recipient_, recipient);
  }

  function testDecodeUnwrapIntent(
    bytes32 recipient, 
    uint16 chainId, 
    address tokenAddress,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public view {
    bytes memory data = abi.encodePacked(
      recipient,
      chainId,
      tokenAddress,
      tokenAmount,
      gasDropoff,
      unwrapIntent,
      ACQUIRE_PREAPPROVED
    );

    bool unwrapIntent_ = wrapper.decodeUnwrapIntent(data);
    assertEq(unwrapIntent_, unwrapIntent);
  }
}
