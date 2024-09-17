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
      initGasToken,
      initGasErc20TokenizationIsExplicit
    );
  }
  
  function testQuoteRelay_evmTransactionQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = EVM_CHAIN_ID;
    bool txCommitEthereum = false;
    uint256 expectedQuote = 400000002000000000;

    uint256 quote = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 

  function testQuoteRelay_evmTransactionWithTxSizeQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = EVM_CHAIN_ID;
    bool txCommitEthereum = true;
    uint256 expectedQuote = 401000002000000000;

    uint256 quote = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 

  function testQuoteRelay_solanaTransactionQuote() public {
    uint32 gasDropoff = 1000;
    uint16 chainId = SOLANA_CHAIN_ID;
    bool txCommitEthereum = false;
    uint256 expectedQuote = 1004000000002000000000;

    uint256 quote = tbrExposer.exposedQuoteRelay(chainId, gasDropoff, RELAY_FEE_AMOUNT, txCommitEthereum);
    assertEq(quote, expectedQuote);
  } 
}