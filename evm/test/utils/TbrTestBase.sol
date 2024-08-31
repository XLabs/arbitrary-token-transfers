// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "wormhole-sdk/proxy/Proxy.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import { forwardError } from "wormhole-sdk/Utils.sol";
import { Tbr } from "tbr/Tbr.sol";
import "./TbrExposer.sol";

contract TbrTestBase is Test {
  using BytesParsing for bytes;

  uint8   immutable oracleVersion;
  address immutable owner;
  address immutable admin;
  address immutable feeRecipient;
  address immutable permit2;
  address immutable oracle;

  address tbrImplementation;
  Tbr tbr;
  TbrExposer tbrExposer;

  constructor() {
    owner         = makeAddr("owner");
    admin         = makeAddr("admin");
    feeRecipient  = makeAddr("feeRecipient");
    permit2       = makeAddr("permit2");
    oracle        = makeAddr("oracle");
    oracleVersion = 0;
  }

  function _setUp1() internal virtual { }

  function setUp() public {
    tbrImplementation = address(new Tbr(
      permit2,
      oracle,
      oracleVersion
    ));

    tbr = Tbr(address(new Proxy(
      tbrImplementation,
      abi.encodePacked(
        owner,
        admin,
        feeRecipient
      )
    )));

    tbrExposer = new TbrExposer(
      permit2,
      oracle,
      oracleVersion
    );

    _setUp1();
  }

  function invokeTbr(bytes memory callData) internal returns (bytes memory data) {
    (bool success, bytes memory result) = address(tbr).call(callData);
    if (!success) {
      forwardError(result);
    }
    (uint length,) = result.asUint256Unchecked(32);
    (data,) = result.sliceUnchecked(64, length);
  }
}