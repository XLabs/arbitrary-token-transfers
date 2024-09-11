// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "wormhole-sdk/proxy/Proxy.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import { forwardError } from "wormhole-sdk/Utils.sol";
import "@openzeppelin/token/ERC20/IERC20.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";
import {IPermit2} from "wormhole-sdk/interfaces/token/IPermit2.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import { Tbr } from "tbr/Tbr.sol";
import "./TbrExposer.sol";

contract TbrTestBase is Test {
  using BytesParsing for bytes;

  address      immutable owner;
  address      immutable admin;
  address      immutable feeRecipient;

  uint8        immutable oracleVersion;
  IPermit2     immutable permit2;
  address      immutable oracle;
  ITokenBridge immutable tokenBridge;
  IWETH        immutable initGasToken;
  bool         immutable initGasErc20TokenizationIsExplicit;
  
  IERC20       immutable usdt;

  address tbrImplementation;
  Tbr tbr;
  TbrExposer tbrExposer;

  constructor() {
    owner         = makeAddr("owner");
    admin         = makeAddr("admin");
    feeRecipient  = makeAddr("feeRecipient");

    permit2       = IPermit2(makeAddr("permit2"));
    oracle        = makeAddr("oracle");
    oracleVersion = 0;
    tokenBridge   = ITokenBridge(vm.envAddress("TEST_TOKEN_BRIDGE_ADDRESS"));
    initGasToken  = IWETH(vm.envAddress("TEST_WETH_ADDRESS"));
    initGasErc20TokenizationIsExplicit = false;

    usdt          = IERC20(vm.envAddress("TEST_USDT_ADDRESS"));
  }

  function _setUp1() internal virtual { }

  function setUp() public {
    tbrImplementation = address(new Tbr(
      permit2,
      tokenBridge,
      oracle,
      oracleVersion,
      initGasToken,
      initGasErc20TokenizationIsExplicit
    ));

    tbr = Tbr(payable(new Proxy(
      tbrImplementation,
      abi.encodePacked(
        owner,
        admin,
        feeRecipient
      )
    )));

    tbrExposer = new TbrExposer(
      permit2,
      tokenBridge,
      oracle,
      oracleVersion,
      initGasToken,
      initGasErc20TokenizationIsExplicit
    );

    _setUp1();
  }

  function invokeTbr(bytes memory encoded) internal returns (bytes memory data) {
    (bool success, bytes memory result) = address(tbr).call(encoded);
    if (!success) {
      forwardError(result);
    }
    (uint length,) = result.asUint256Unchecked(32);
    (data,) = result.sliceUnchecked(64, length);
  }

  function invokeTbr(bytes memory encoded, uint value) internal returns (bytes memory data) {
    (bool success, bytes memory result) = address(tbr).call{value: value}(encoded);
    if (!success) {
      forwardError(result);
    }
    (uint length,) = result.asUint256Unchecked(32);
    (data,) = result.sliceUnchecked(64, length);
  }
}