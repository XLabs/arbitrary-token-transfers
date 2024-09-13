// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

contract Receiver {
  uint private receivedBalance;

  fallback() external payable {
    receivedBalance += msg.value;
  }
}
