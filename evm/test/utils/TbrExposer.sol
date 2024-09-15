// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { Tbr } from "tbr/Tbr.sol";
import {IPermit2} from "wormhole-sdk/interfaces/token/IPermit2.sol";
import {ITokenBridge} from "wormhole-sdk/interfaces/ITokenBridge.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";

contract TbrExposer is Tbr {

  constructor(
    IPermit2 initPermit2,
    ITokenBridge initTokenBridge,
    address oracle,
    uint8 oracleVersion,
    IWETH initGasToken,
    bool initGasErc20TokenizationIsExplicit
  ) Tbr(
    initPermit2, 
    initTokenBridge, 
    oracle, 
    oracleVersion, 
    initGasToken, 
    initGasErc20TokenizationIsExplicit
  ) {}

  function exposedAddPeer(uint16 chainId, bytes32 peer) public {
    addPeer(chainId, peer);
  }

  function exposedIsPeer(uint16 chainId, bytes32 peer) public view returns (bool) {
    return isPeer(chainId, peer);
  }

  function exposedSetCanonicalPeer(uint16 chainId, bytes32 peer) public {
    setCanonicalPeer(chainId, peer);
  }

  function exposedGetCanonicalPeer(uint16 chainId) public view returns (bytes32) {
    return getCanonicalPeer(chainId);
  }

  function exposedGetTargetChainData(uint16 destinationChain) public view returns (bytes32, bool, bool, uint32) {
    return getTargetChainData(destinationChain);
  }

  function exposedSetChainTxSizeSensitive(uint16 chainId, bool txSizeSensitive) public {
    setChainTxSizeSensitive(chainId, txSizeSensitive);
  }

  function exposedIsChainTxSizeSensitive(uint16 chainId) public view returns (bool) {
    return isChainTxSizeSensitive(chainId);
  }

  function exposedSetMaxGasDropoff(uint16 chainId, uint32 maxGasDropoff) public {
    setMaxGasDropoff(chainId, maxGasDropoff);
  }

  function exposedGetMaxGasDropoff(uint16 destinationChain) public view returns (uint32) {
    return getMaxGasDropoff(destinationChain);
  }

  function exposedSetPause(uint16 chainId, bool paused) public {
    setPause(chainId, paused);
  }
  
  function exposedIsPaused(uint16 destinationChain) public view returns (bool) {
    return isPaused(destinationChain);
  }

  function exposedTransferEth(address to, uint256 amount) public {
    transferEth(to, amount);
  }

  function exposedQuoteRelay(uint16 chainId, uint32 gasDropoff, bool txCommitEthereum) public view returns (uint256) {
    return quoteRelay(chainId, gasDropoff, txCommitEthereum);
  }

  function exposedSetRelayFee(uint32 fee) public {
    setRelayFee(fee);
  }

  function exposedGetRelayFee() public view returns (uint32) {
    return getRelayFee();
  }

  function exposedIsChainSupported(uint16 destinationChain) public view returns (bool) {
    return isChainSupported(destinationChain);
  }
}