// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {ITokenBridge} from "wormhole-sdk/interfaces/ITokenBridge.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import {IPermit2} from "permit2/IPermit2.sol";
import {TbrDispatcher} from "./assets/TbrDispatcher.sol";
import {TbrBase} from "./assets/TbrBase.sol";

contract Tbr is TbrDispatcher {
  using BytesParsing for bytes;

  constructor(
    IPermit2 initPermit2,
    ITokenBridge initTokenBridge,
    address oracle,
    IWETH initGasToken,
    bool initGasErc20TokenizationIsExplicit
  ) TbrBase(
    initPermit2,
    initTokenBridge,
    oracle,
    initGasToken,
    initGasErc20TokenizationIsExplicit
  ) {}

  //constructor of the proxy contract setting storage variables
  function _proxyConstructor(bytes calldata args) internal override {
    uint offset = 0;

    address owner;
    address admin;
    address feeRecipient;
    (owner,        offset) = args.asAddressCdUnchecked(offset);
    (admin,        offset) = args.asAddressCdUnchecked(offset);
    (feeRecipient, offset) = args.asAddressCdUnchecked(offset);

    args.checkLengthCd(offset);

    _accessControlConstruction(owner, admin);
    _configConstruction(payable(feeRecipient));
  }
}
