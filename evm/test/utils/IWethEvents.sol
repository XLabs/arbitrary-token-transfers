// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

// TODO: remove this interface and use the one from the wormhole-sdk when it's available
contract IWethEvents {
  event  Deposit(address indexed dst, uint wad);
  event  Withdrawal(address indexed src, uint wad);
}