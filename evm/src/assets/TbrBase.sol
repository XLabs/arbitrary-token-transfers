// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.24;

import "@openzeppelin/token/ERC20/IERC20.sol";
import "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "wormhole-sdk/interfaces/token/IPermit2.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "oracle/IOracle.sol";
import {OracleIntegration} from "oracle/OracleIntegration.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";

struct ChainData {
  bytes32 canonicalPeer;
  mapping(bytes32 => bool) peers;
  bool isPaused;
  bool txSizeSensitive;
}

struct TbrPeersState {
  /**
   * @notice The peers for each chain ID, the first peer is the canonical peer
   */
  mapping(uint16 => ChainData) state;
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
error CannotRemoveCanonicalPeer();
error InvalidChainId();
error EthTransferFailed();
error ChainNoSupportedByTokenBridge(uint16 chainId);

abstract contract TbrBase is OracleIntegration {
  using BytesParsing for bytes;

  IPermit2     internal immutable _permit2;
  uint16       internal immutable _chainId;
  ITokenBridge internal immutable _tokenBridge;

  constructor(
    address permit2,
    address tokenBridge,
    address oracle,
    uint8 oracleVersion
  ) OracleIntegration(oracle, oracleVersion) {
    _permit2 = IPermit2(permit2);
    _chainId = oracleChainId();
    _tokenBridge = ITokenBridge(tokenBridge);
  }

  function getTargetChainData(uint16 destinationChain) internal view returns (bytes32, bool, bool) {
    ChainData storage data = tbrPeersState().state[destinationChain];
    return (data.canonicalPeer, data.isPaused, data.txSizeSensitive);
  }

  function isPeer(uint16 destinationChain, bytes32 peer) internal view returns (bool) {
    return tbrPeersState().state[destinationChain].peers[peer];
  }

  function addPeer(uint16 destinationChain, bytes32 peer) internal {
    if (destinationChain == 0 || destinationChain == _chainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = _tokenBridge.bridgeContracts(destinationChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(destinationChain);

    ChainData storage data = tbrPeersState().state[destinationChain];
    bool isAlreadyPeer = data.peers[peer];
    if (isAlreadyPeer)
      revert PeerAlreadyRegistered(destinationChain, peer);

    data.peers[peer] = true;
  }

  function isChainTxSizeSensitive(uint16 chainId) internal view returns (bool) {
    return tbrPeersState().state[chainId].txSizeSensitive;
  }

  function setChainTxSizeSensitive(uint16 chainId, bool txSizeSensitive) internal {
    tbrPeersState().state[chainId].txSizeSensitive = txSizeSensitive;
  }

  function getCanonicalPeer(uint16 destinationChain) internal view returns (bytes32) {
    return tbrPeersState().state[destinationChain].canonicalPeer;
  }

  function setCanonicalPeer(uint16 destinationChain, bytes32 peer) internal {
    if (destinationChain == 0 || destinationChain == _chainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = _tokenBridge.bridgeContracts(destinationChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(destinationChain);
    
    ChainData storage data = tbrPeersState().state[destinationChain];
    bool isAlreadyPeer = data.peers[peer];
    if (!isAlreadyPeer)
      data.peers[peer] = true;
      
    bytes32 currentCanonicalPeer = data.canonicalPeer;
    if (currentCanonicalPeer != peer)
      data.canonicalPeer = peer;
  }

  function isChainSupported(uint16 chainId) internal view returns (bool) {
    return getCanonicalPeer(chainId) != bytes32(0);
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

  /**
   * @notice Check if outbound transfers are paused for a given chain
   */
  function isPaused(uint16 chainId) internal view returns (bool) {
    return tbrPeersState().state[chainId].isPaused;
  }

  /**
   * @notice Set outbound transfers for a given chain
   */
  function setPause(uint16 chainId, bool paused) internal {
    tbrPeersState().state[chainId].isPaused = paused;
  }

  function transferEth(address to, uint256 amount) internal {
    (bool success, ) = to.call{value: amount}(new bytes(0));
    if (!success)
      revert EthTransferFailed();
  }
}
