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

    address feeRecipient;
    address owner;
    (feeRecipient, offset) = args.asAddressCdUnchecked(offset);
    (owner,        offset) = args.asAddressCdUnchecked(offset);
    uint8 adminCount;
    (adminCount,   offset) = args.asUint8CdUnchecked(offset);
    address[] memory admins = new address[](adminCount);
    for (uint i = 0; i < adminCount; ++i) {
      (admins[i],  offset) = args.asAddressCdUnchecked(offset);
    }

    args.checkLengthCd(offset);

    _accessControlConstruction(owner, admins);
    _configConstruction(payable(feeRecipient));
  }
}
