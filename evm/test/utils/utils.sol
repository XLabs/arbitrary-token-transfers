// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

function getFakeBytes32(string memory seed) pure returns (bytes32) {
  return keccak256(abi.encodePacked(seed));
}