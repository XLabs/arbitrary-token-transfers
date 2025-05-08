// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import { SolanaFeeParams } from "price-oracle/assets/types/SolanaFeeParams.sol";
import { EvmFeeParams } from "price-oracle/assets/types/EvmFeeParams.sol";
import {
  PricePerTxByte,
  GasPrice,
  GasTokenPrice,
  SolanaComputationPrice,
  PricePerAccountByte,
  SignaturePrice
} from "price-oracle/assets/types/ParamLibs.sol";
import { IPriceOracle } from "price-oracle/IPriceOracle.sol";
import { PriceOracle } from "price-oracle/PriceOracle.sol";
import { IPermit2 } from "permit2/IPermit2.sol";
import { Tbr } from "tbr/Tbr.sol";
import { DISPATCHER_PROTOCOL_VERSION0 } from "tbr/assets/TbrIds.sol";
import { ITokenBridge } from "wormhole-sdk/interfaces/ITokenBridge.sol";
import { IWormhole } from "wormhole-sdk/interfaces/IWormhole.sol";
import { IERC20Metadata } from "wormhole-sdk/interfaces/token/IERC20Metadata.sol";
import { IWETH } from "wormhole-sdk/interfaces/token/IWETH.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { Proxy } from "wormhole-sdk/proxy/Proxy.sol";
import { WormholeOverride } from "wormhole-sdk/testing/WormholeOverride.sol";
import { reRevert } from "wormhole-sdk/Utils.sol";

import { TbrExposer } from "./TbrExposer.sol";

contract TbrTestBase is Test {
  using BytesParsing for bytes;

  uint16  SOLANA_CHAIN_ID = 1;
  uint16  HOME_CHAIN_ID   = 2;
  uint16  EVM_CHAIN_ID    = 3;

  // Arbitrum data
  uint16  EVM_L2_CHAIN_ID             = 23;
  address EVM_L2_TOKEN_WETH_TOKEN     = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
  address EVM_L2_TOKEN_BRIDGE_ADDRESS = 0x0b2402144Bb366A632D14B83F244D2e0e21bD39c;
  address WETH_CANONICAL_ADDRESS      = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  address      immutable owner;
  address      immutable admin;
  address      immutable feeRecipient;

  IPermit2     immutable permit2;
  address      immutable oracle;
  ITokenBridge immutable tokenBridge;
  IWETH        immutable gasToken;
  bool         immutable gasErc20TokenizationIsExplicit;

  IERC20Metadata immutable usdt;
  IWormhole      immutable wormholeCore;

  address     tbrImplementation;
  PriceOracle priceOracle;
  TbrExposer  tbrExposer;
  Tbr         tbr;


  constructor() {
    owner         = makeAddr("owner");
    admin         = makeAddr("admin");
    feeRecipient  = makeAddr("feeRecipient");

    permit2       = IPermit2(makeAddr("permit2"));
    oracle        = makeAddr("oracle");
    tokenBridge   = ITokenBridge(vm.envAddress("TEST_TOKEN_BRIDGE_ADDRESS"));
    gasToken      = IWETH(vm.envAddress("TEST_WETH_ADDRESS"));
    gasErc20TokenizationIsExplicit = true;

    usdt          = IERC20Metadata(vm.envAddress("TEST_USDT_ADDRESS"));
    wormholeCore  = IWormhole(vm.envAddress("TEST_WORMHOLE_ADDRESS"));
  }

  function _setUp1() internal virtual { }

  function setUp() public {
    WormholeOverride.setUpOverride(wormholeCore);

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint16(HOME_CHAIN_ID)))
    );

    tbrImplementation = address(new Tbr(
      permit2,
      tokenBridge,
      oracle,
      gasToken,
      gasErc20TokenizationIsExplicit
    ));

    uint8 adminCount = 1;
    tbr = Tbr(payable(new Proxy(
      tbrImplementation,
      abi.encodePacked(
        feeRecipient,
        owner,
        adminCount,
        admin
      )
    )));

    tbrExposer = new TbrExposer(
      permit2,
      tokenBridge,
      oracle,
      gasToken,
      gasErc20TokenizationIsExplicit
    );

    setUpOracle();
    _setUp1();
  }

  /**
   * Used for very basic tests that don't require cross registrations.
   */
  function deployInstrumentedTbr(IWETH aGasToken) internal returns (TbrExposer) {
    return new TbrExposer(
      permit2,
      tokenBridge,
      oracle,
      aGasToken,
      gasErc20TokenizationIsExplicit
    );
  }

  function setUpOracle() internal {
    address assistant = makeAddr("assistant");
    EvmFeeParams evmFeeParams;
    evmFeeParams = evmFeeParams.pricePerTxByte(PricePerTxByte.wrap(1e6));
    evmFeeParams = evmFeeParams.gasPrice(GasPrice.wrap(1e6));
    evmFeeParams = evmFeeParams.gasTokenPrice(GasTokenPrice.wrap(1e12));

    EvmFeeParams evmL2FeeParams;
    evmL2FeeParams = evmL2FeeParams.pricePerTxByte(PricePerTxByte.wrap(1e6));
    evmL2FeeParams = evmL2FeeParams.gasPrice(GasPrice.wrap(1e6));
    evmL2FeeParams = evmL2FeeParams.gasTokenPrice(GasTokenPrice.wrap(1e12));

    SolanaFeeParams solanaFeeParams;
    solanaFeeParams = solanaFeeParams.computationPrice(SolanaComputationPrice.wrap(1e3));
    solanaFeeParams = solanaFeeParams.pricePerAccountByte(PricePerAccountByte.wrap(1e9));
    solanaFeeParams = solanaFeeParams.signaturePrice(SignaturePrice.wrap(1e9));
    solanaFeeParams = solanaFeeParams.gasTokenPrice(GasTokenPrice.wrap(1e12));

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.chainId.selector),
      abi.encode(HOME_CHAIN_ID)
    );

    priceOracle = PriceOracle(address(new Proxy(
      address(new PriceOracle(wormholeCore)),
      abi.encodePacked(
        owner,
        uint8(1),
        admin,
        assistant,
        HOME_CHAIN_ID,
        evmFeeParams,
        EVM_CHAIN_ID,
        evmFeeParams,
        EVM_L2_CHAIN_ID,
        evmL2FeeParams,
        SOLANA_CHAIN_ID,
        solanaFeeParams
      )
    )));
  }
}


library InvokeTbr {
  using BytesParsing for bytes;
  error TbrInvokeDidNotFail(bytes data, uint256 value);

  function invokeStaticTbr(Tbr tbr, bytes memory messages) view internal returns (bytes memory data) {
    bytes memory getCall = abi.encodePacked(tbr.get1959.selector, DISPATCHER_PROTOCOL_VERSION0, messages);

    (bool success, bytes memory result) = address(tbr).staticcall(getCall);
    if (!success) {
      reRevert(result);
    }
    (uint length,) = result.asUint256MemUnchecked(32);
    (data,) = result.sliceMemUnchecked(64, length);
  }

  function invokeTbr(Tbr tbr, bytes memory messages) internal returns (bytes memory data) {
    return invokeTbr(tbr, messages, 0);
  }

  function invokeTbrImplementation(Tbr tbr, bytes memory messages, uint value) internal returns (bool, bytes memory, bytes memory) {
    bytes memory execCall = abi.encodePacked(tbr.exec768.selector, DISPATCHER_PROTOCOL_VERSION0, messages);
    (bool success, bytes memory result) = address(tbr).call{value: value}(execCall);
    return (success, result, execCall);
  }

  function invokeTbr(Tbr tbr, bytes memory messages, uint value) internal returns (bytes memory data) {
    (bool success, bytes memory result, ) = invokeTbrImplementation(tbr, messages, value);
    if (!success) {
      reRevert(result);
    }
    (uint length,) = result.asUint256MemUnchecked(32);
    (data,) = result.sliceMemUnchecked(64, length);
  }

  function expectRevertInvokeTbr(Tbr tbr, bytes memory messages, uint value) internal returns (bytes memory) {
    (bool success, bytes memory result, bytes memory execCall) = invokeTbrImplementation(tbr, messages, value);
    if (success) {
      revert TbrInvokeDidNotFail(execCall, value);
    }
    return result;
  }
}