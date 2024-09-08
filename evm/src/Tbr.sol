// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {TbrDispatcher} from "./assets/TbrDispatcher.sol";
import {TbrBase} from "./assets/TbrBase.sol";

contract Tbr is TbrDispatcher {
  using BytesParsing for bytes;

  constructor(
    address permit2,
    address tokenBridge,
    address oracle,
    uint8 oracleVersion
  ) TbrBase(permit2, tokenBridge, oracle, oracleVersion) {}

  //constructor of the proxy contract setting storage variables
  function _proxyConstructor(bytes calldata args) internal override {
    uint offset = 0;

    address owner;
    address admin;
    address feeRecipient;
    (owner,      offset) = args.asAddressUnchecked(offset);
    (admin,      offset) = args.asAddressUnchecked(offset);
    (feeRecipient, offset) = args.asAddressUnchecked(offset);

    _governanceConstruction(owner, admin, payable(feeRecipient));
  }
}
