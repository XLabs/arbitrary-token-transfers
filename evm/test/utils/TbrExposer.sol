// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { Tbr } from "tbr/Tbr.sol";

contract TbrExposer is Tbr {

  constructor(
    address _permit2, 
    address _tokenBridge,
    address _oracle, 
    uint8 _oracleVersion
  ) Tbr(_permit2, _tokenBridge, _oracle, _oracleVersion) {}

  function exposedAddPeer(uint16 chainId, bytes32 peer) public {
    addPeer(chainId, peer);
  }

  function exposedGetPeers(uint16 chainId) public view returns (bytes32[] memory) {
    return getPeers(chainId);
  }

  function exposedSetCanonicalPeer(uint16 chainId, bytes32 peer) public {
    setCanonicalPeer(chainId, peer);
  }

  function exposedGetCanonicalPeer(uint16 chainId) public view returns (bytes32) {
    return getCanonicalPeer(chainId);
  }
}