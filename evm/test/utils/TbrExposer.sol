// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { Tbr } from "tbr/Tbr.sol";
import {ITokenBridge} from "wormhole-sdk/interfaces/ITokenBridge.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import {IPermit2} from "permit2/IPermit2.sol";

contract TbrExposer is Tbr {

  constructor(
    IPermit2 initPermit2,
    ITokenBridge initTokenBridge,
    address oracle,
    IWETH initGasToken,
    bool initGasErc20TokenizationIsExplicit
  ) Tbr(
    initPermit2,
    initTokenBridge,
    oracle,
    initGasToken,
    initGasErc20TokenizationIsExplicit
  ) {}

  function exposedAddPeer(uint16 chainId, bytes32 peer) public {
    _addPeer(chainId, peer);
  }

  function exposedIsPeer(uint16 chainId, bytes32 peer) public view returns (bool) {
    return _isPeer(chainId, peer);
  }

  function exposedSetCanonicalPeer(uint16 chainId, bytes32 peer) public {
    _setCanonicalPeer(chainId, peer);
  }

  function exposedGetCanonicalPeer(uint16 chainId) public view returns (bytes32) {
    return _getCanonicalPeer(chainId);
  }

  function exposedGetTargetChainData(
    uint16 targetChain
  ) public view returns (bytes32, uint32, uint32, bool, bool) {
    return _getTargetChainData(targetChain);
  }

  function exposedSetChainTxSizeSensitive(uint16 chainId, bool txSizeSensitive) public {
    _setChainTxSizeSensitive(chainId, txSizeSensitive);
  }

  function exposedIsChainTxSizeSensitive(uint16 chainId) public view returns (bool) {
    return _isChainTxSizeSensitive(chainId);
  }

  function exposedSetMaxGasDropoff(uint16 chainId, uint32 maxGasDropoff) public {
    _setMaxGasDropoff(chainId, maxGasDropoff);
  }

  function exposedGetMaxGasDropoff(uint16 targetChain) public view returns (uint32) {
    return _getMaxGasDropoff(targetChain);
  }

  function exposedSetPause(uint16 chainId, bool paused) public {
    _setPause(chainId, paused);
  }
  
  function exposedIsPaused(uint16 targetChain) public view returns (bool) {
    return _isPaused(targetChain);
  }

  function exposedTransferEth(address to, uint256 amount) public {
    _transferEth(to, amount);
  }

  function exposedQuoteRelay(
    uint16 chainId,
    uint32 gasDropoff,
    uint32 baseFee,
    bool txSizeSensitive
  ) public view returns (uint256) {
    return _quoteRelay(chainId, gasDropoff, baseFee, txSizeSensitive);
  }

  function exposedSetBaseFee(uint16 chainId, uint32 fee) public {
    _setBaseFee(chainId, fee);
  }

  function exposedGetBaseFee(uint16 chainId) public view returns (uint32) {
    return _getBaseFee(chainId);
  }

  function exposedIsChainSupported(uint16 targetChain) public view returns (bool) {
    return _isChainSupported(targetChain);
  }
}