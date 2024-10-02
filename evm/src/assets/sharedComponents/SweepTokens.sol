// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { senderHasAuth } from "./AccessControl.sol";
import { transferTokens } from "./utils.sol";
import "./ids.sol";

abstract contract SweepTokens {
  using BytesParsing for bytes;

  function _sweepTokens(
    bytes calldata commands,
    uint offset
  ) internal returns (uint) {
    senderHasAuth();

    address token;
    uint256 amount;
    (token,  offset) = commands.asAddressCdUnchecked(offset);
    (amount, offset) = commands.asUint256CdUnchecked(offset);

    transferTokens(token, msg.sender, amount);
    return offset;
  }
}