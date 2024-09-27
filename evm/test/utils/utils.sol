// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {ERC20} from "wormhole-sdk/testing/ERC20Mock.sol";

function makeBytes32(string memory seed) pure returns (bytes32) {
  return keccak256(abi.encodePacked(seed));
}

function normalizeAmount(uint256 amount, uint8 decimals) pure returns(uint256) { unchecked {
  if (decimals > 8) {
    amount /= 10 ** (decimals - 8);
  }
  return amount;
}}

function deNormalizeAmount(uint256 amount, uint8 decimals) pure returns(uint256) { unchecked {
  if (decimals > 8) {
    amount *= 10 ** (decimals - 8);
  }
  return amount;
}}

function discardInsignificantBits(uint256 amount, uint8 decimals) pure returns(uint256) {
  return deNormalizeAmount(normalizeAmount(amount, decimals), decimals);
}

contract ERC20Mock is ERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals) ERC20(name, symbol, decimals) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }
}