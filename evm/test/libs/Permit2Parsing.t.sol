// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {Permit2Parsing} from "tbr/assets/TbrUser.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "forge-std/Test.sol";

contract Permit2ParsingTest is Test {
  using BytesParsing for bytes;

  function parsePermit(
    bytes calldata params,
    uint offset
  ) external pure returns (uint256, uint256, bytes32, bytes32, uint8, uint) {
    return Permit2Parsing._parsePermit(params, offset);
  }

  function parsePermit2Permit(
    bytes calldata params,
    uint offset
  ) external pure returns (uint160, uint48, uint48, uint256, bytes memory, uint) {
    return Permit2Parsing._parsePermit2Permit(params, offset);
  }

  function parsePermit2Transfer(
    bytes calldata params,
    uint offset
  ) external pure returns (uint256, uint256, uint256, bytes memory, uint) {
    return Permit2Parsing._parsePermit2Transfer(params, offset);
  }

  function testParsePermit(
    uint256 value, 
    uint256 deadline, 
    bytes32 r, 
    bytes32 s, 
    uint8 v
  ) public view {
    bytes memory params = abi.encodePacked(value, deadline, r, s, v);
    (uint256 _value, uint256 _deadline, bytes32 _r, bytes32 _s, uint8 _v, uint offset) = this.parsePermit(params, 0);
    assertEq(_value, value);
    assertEq(_deadline, deadline);
    assertEq(_r, r);
    assertEq(_s, s);
    assertEq(_v, v);
    assertEq(offset, params.length);
  }

  function testParsePermit2Permit(
    uint160 amount, 
    uint48 expiration, 
    uint48 nonce, 
    uint256 sigDeadline, 
    bytes memory signature
  ) public view {
    vm.assume(signature.length == 65);
    bytes memory params = abi.encodePacked(amount, expiration, nonce, sigDeadline, signature);
    (uint160 _amount, uint48 _expiration, uint48 _nonce, uint256 _sigDeadline, bytes memory _signature, uint offset) = this.parsePermit2Permit(params, 0);
    assertEq(_amount, amount);
    assertEq(_expiration, expiration);
    assertEq(_nonce, nonce);
    assertEq(_sigDeadline, sigDeadline);
    assertEq(_signature, signature);
    assertEq(offset, params.length);
  }

  function testParsePermit2Transfer(
    uint256 amount, 
    uint256 expiration, 
    uint256 nonce, 
    bytes memory signature
  ) public view {
    vm.assume(signature.length == 65);
    bytes memory params = abi.encodePacked(amount, expiration, nonce, signature);
    (uint256 _amount, uint256 _expiration, uint256 _nonce, bytes memory _signature, uint offset) = this.parsePermit2Transfer(params, 0);
    assertEq(_amount, amount);
    assertEq(_expiration, expiration);
    assertEq(_nonce, nonce);
    assertEq(_signature, signature);
    assertEq(offset, params.length);
  }
}