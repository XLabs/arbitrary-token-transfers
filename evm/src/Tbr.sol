// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "./assets/TbrDispatcher.sol";

contract Tbr is TbrDispatcher {
  using BytesParsing for bytes;

  constructor(
    address permit2,
    address oracle,
    uint8 oracleVersion
  ) TbrBase(permit2, oracle, oracleVersion) {}

  //constructor of the proxy contract setting storage variables
  function _proxyConstructor(bytes calldata args) internal override {
    uint offset = 0;

    address owner;
    address admin;
    address feeRecipient;
    (owner,      offset) = args.asAddressUnchecked(offset);
    (admin,      offset) = args.asAddressUnchecked(offset);
    (feeRecipient, offset) = args.asAddressUnchecked(offset);

    _governanceConstruction(owner, admin, feeRecipient);
  }
}
