// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;


import "wormhole-sdk/libraries/BytesParsing.sol";
import {TbrTestBase} from "./utils/TbrTestBase.sol";
import {TbrExposer} from "./utils/TbrExposer.sol";

contract OracleIntegrationTest is TbrTestBase {
  using BytesParsing for bytes;
  
  uint32  RELAY_FEE_AMOUNT       = 1000;

  function _setUp1() internal override {
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
    bool txCommitEthereum = false;
    uint256 expectedQuote = 401000001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, ) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 

  function testQuoteRelay_evmTransactionWithTxSizeQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = EVM_CHAIN_ID;
    bool txCommitEthereum = true;
    uint256 expectedQuote = 402000001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, ) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 

  function testQuoteRelay_solanaTransactionQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = SOLANA_CHAIN_ID;
    bool txCommitEthereum = false;
    uint256 expectedQuote = 461001000001000000000;

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore), 
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    (uint256 quote, ) = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 
}