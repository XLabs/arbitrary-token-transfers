// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.24;

import "@openzeppelin/token/ERC20/IERC20.sol";
import "@openzeppelin/token/ERC20/utils/SafeERC20.sol";

import "wormhole-sdk/interfaces/token/IPermit2.sol";

import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "oracle/IOracle.sol";
import {OracleIntegration} from "oracle/OracleIntegration.sol";


struct TbrPeersState {
  /**
   * @notice The peers for each chain ID, the first peer is the canonical peer
   */
  mapping(uint16 => bytes32[]) peers;
}

// keccak256("TbrPeersState") - 1
bytes32 constant TBR_PEERS_STORAGE_SLOT =
  0xd4437fff88edf22117d6a799ad119fdffb5fc9fd69e769d05dee883a088dd657;

function tbrPeersState() pure returns (TbrPeersState storage state) {
  assembly ("memory-safe") {
    state.slot := TBR_PEERS_STORAGE_SLOT
  }
}

struct TbrConfigState {
  /**
   * @notice The relayer fee is denominated in Mwei of the source chain native token, i.e. 10^6 wei
   */
  uint32 relayFee;
  /**
   * @notice The maximum gas dropoff is denominated in Twei of the target chain native token, i.e. 10^12 wei
   */
  mapping(uint16 => uint32) maxGasDropoff;
  /**
   * @notice If true, outbound transfers are paused
   */
  bool outboundTransfersPaused;
}

// keccak256("TbrConfigState") - 1
bytes32 constant TBR_CONFIG_STORAGE_SLOT =
  0x381c9989a46b4c7b62f583a7f0615b9b02ac8cd59f71b4c9eae5187809bcc19b;

function tbrConfigState() pure returns (TbrConfigState storage state) {
  assembly ("memory-safe") {
    state.slot := TBR_CONFIG_STORAGE_SLOT
  }
}

error PeerIsZeroAddress();
error PeerAlreadyRegistered(uint16 chainId, bytes32 peer);
error InvalidChainId();
error EthTransferFailed();

abstract contract TbrBase is OracleIntegration {
  using BytesParsing for bytes;

  IPermit2     internal immutable _permit2;
  uint16       internal immutable _chainId;

  constructor(
    address permit2,
    address oracle,
    uint8 oracleVersion
  ) OracleIntegration(oracle, oracleVersion) {
    _permit2 = IPermit2(permit2);
    _chainId = oracleChainId();
  }

  //the semantic equivalent of a `default: assert(false)` case in a switch statement
  //  used in if/else cascades that model switch statements that must be exhaustive
  //  uses assert() because it can only be reached if there's a bug in the code
  function _assertExhaustive() internal pure {
    assert(false);
  }

  function getPeers(uint16 peersChainId) internal view returns (bytes32[] memory) {
    return tbrPeersState().peers[peersChainId];
  }

  function addPeer(uint16 peerChainId, bytes32 peer) internal {
    if (peerChainId == 0 || peerChainId == _chainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    TbrPeersState storage peersState = tbrPeersState();
    bytes32[] memory currentPeers = peersState.peers[peerChainId];
    
    for (uint i = 0; i < currentPeers.length; i++) {
      if (currentPeers[i] == peer)
        revert PeerAlreadyRegistered(peerChainId, peer);
    }

    peersState.peers[peerChainId].push(peer);
  }

  function getCanonicalPeer(uint16 peerChainId) internal view returns (bytes32) {
    return getPeers(peerChainId)[0];
  }

  function setCanonicalPeer(uint16 peerChainId, bytes32 peer) internal {
    TbrPeersState storage peersState = tbrPeersState();
    bytes32[] memory currentPeers = peersState.peers[peerChainId];
    if (currentPeers.length != 0) {
      currentPeers[currentPeers.length] = currentPeers[0];
      currentPeers[0] = peer;
      peersState.peers[peerChainId] = currentPeers;
    } else {
      peersState.peers[peerChainId][0] = peer;
    }
  }

  function getRelayFee() internal view returns (uint32) {
    return tbrConfigState().relayFee;
  }

  function setRelayFee(uint32 fee) internal {
    tbrConfigState().relayFee = fee;
  }

  function getMaxGasDropoff(uint16 chainId) internal view returns (uint32) {
    return tbrConfigState().maxGasDropoff[chainId];
  }

  function setMaxGasDropoff(uint16 chainId, uint32 maxGasDropoff) internal {
    tbrConfigState().maxGasDropoff[chainId] = maxGasDropoff;
  }

  function getPauseOutboundTransfers() internal view returns (bool) {
    return tbrConfigState().outboundTransfersPaused;
  }

  function setPauseOutboundTransfers(bool paused) internal {
    tbrConfigState().outboundTransfersPaused = paused;
  }

  function transferEth(address to, uint256 amount) internal {
    (bool success, ) = to.call{value: amount}(new bytes(0));
    if (!success)
      revert EthTransferFailed();
  }
}