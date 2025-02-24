// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;


import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import { TbrExposer } from "./utils/TbrExposer.sol";

contract OracleIntegrationTest is TbrTestBase {
  using BytesParsing for bytes;
  
  uint32  RELAY_FEE_AMOUNT = 1000;

  function _setUp1() internal override {
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(wormholeCore.chainId.selector), 
      abi.encode(EVM_CHAIN_ID)
    );

    tbrExposer = new TbrExposer(
      permit2,
      tokenBridge,
      address(priceOracle),
      gasToken,
      gasErc20TokenizationIsExplicit
    );
  }
  
  function testQuoteRelay_evmTransactionQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = EVM_CHAIN_ID;
    uint256 expectedQuote = 402211001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, uint256 wormholeFee) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT);
    assertEq(quote, expectedQuote);
    assertEq(fakeWormholeFee, wormholeFee);
  } 

  function testQuoteRelay_evmTransactionWithTxSizeQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = EVM_L2_CHAIN_ID;
    uint256 expectedQuote = 402211001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, uint256 wormholeFee) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT);
    assertEq(quote, expectedQuote);
    assertEq(fakeWormholeFee, wormholeFee);
  } 

  function testQuoteRelay_solanaTransactionQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = SOLANA_CHAIN_ID;
    uint256 expectedQuote = 465001001001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, uint256 wormholeFee) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT);
    assertEq(quote, expectedQuote);
    assertEq(fakeWormholeFee, wormholeFee);
  } 
}