// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.24;

import "@openzeppelin/token/ERC20/IERC20.sol";
import "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "wormhole-sdk/interfaces/token/IPermit2.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";
import "oracle/IPriceOracle.sol";
import {PriceOracleIntegration} from "oracle/PriceOracleIntegration.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";

struct ChainData {
  /**
   * @notice The canonical peer for the chain, i.e. to whom the relayer will send the messages to
   */
  bytes32 canonicalPeer;
  /**
   * @notice The peers allowed on the target chain, i.e. the relayer will receive the messages from those peers
   */
  mapping(bytes32 => bool) peers;
  /**
   * @notice The maximum gas dropoff is denominated in Twei / Klamport of the target chain native token
   */
  uint32 maxGasDropoff;
  /**
   * @notice If the chain is paused, no outbound transfers will be allowed
   */
  bool isPaused;
  /**
   * @notice If the chain is sensitive to the transaction size, i.e. if commits a transaction to another chain
   */
  bool txSizeSensitive;
}

struct TbrChainState {
  /**
   * @notice The state related to each target chain
   */
  mapping(uint16 => ChainData) data;
}

// keccak256("TbrChainState") - 1
bytes32 constant TBR_CHAIN_STORAGE_SLOT =
  0x076d7575784c7c4eaae6dbc87cd7dc63264c591f7395b7447b536cfc549b21c5;

function tbrChainState(uint16 destinationChain) view returns (ChainData storage) {
  TbrChainState storage state;
  assembly ("memory-safe") {
    state.slot := TBR_CHAIN_STORAGE_SLOT
  }
  return state.data[destinationChain];
}

struct TbrConfigState {
  /**
   * @notice The relayer fee is denominated in Mwei of the source chain native token, i.e. 10^6 wei
   */
  uint32 relayFee;
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

abstract contract TbrBase is PriceOracleIntegration {
  using BytesParsing for bytes;

  IPermit2     internal immutable permit2;
  uint16       internal immutable whChainId;
  ITokenBridge internal immutable tokenBridge;

  constructor(
    address initPermit2,
    address initTokenBridge,
    address oracle,
    uint8 oracleVersion
  ) PriceOracleIntegration(oracle, oracleVersion) {
    permit2 = IPermit2(initPermit2);
    whChainId = oracleChainId();
    tokenBridge = ITokenBridge(initTokenBridge);
  }

  function getTargetChainData(uint16 destinationChain) internal view returns (bytes32, bool, bool, uint32) {
    ChainData storage data = tbrChainState(destinationChain);
    return (data.canonicalPeer, data.isPaused, data.txSizeSensitive, data.maxGasDropoff);
  }

  function isPeer(uint16 destinationChain, bytes32 peer) internal view returns (bool) {
    return tbrChainState(destinationChain).peers[peer];
  }

  function addPeer(uint16 destinationChain, bytes32 peer) internal {
    if (destinationChain == 0 || destinationChain == whChainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = tokenBridge.bridgeContracts(destinationChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(destinationChain);

    ChainData storage data = tbrChainState(destinationChain);
    bool isAlreadyPeer = data.peers[peer];
    if (isAlreadyPeer)
      revert PeerAlreadyRegistered(destinationChain, peer);

    data.peers[peer] = true;
  }

  function isChainTxSizeSensitive(uint16 destinationChain) internal view returns (bool) {
    return tbrChainState(destinationChain).txSizeSensitive;
  }

  function setChainTxSizeSensitive(uint16 destinationChain, bool txSizeSensitive) internal {
    tbrChainState(destinationChain).txSizeSensitive = txSizeSensitive;
  }

  function getCanonicalPeer(uint16 destinationChain) internal view returns (bytes32) {
    return tbrChainState(destinationChain).canonicalPeer;
  }

  function setCanonicalPeer(uint16 destinationChain, bytes32 peer) internal {
    if (destinationChain == 0 || destinationChain == whChainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = tokenBridge.bridgeContracts(destinationChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(destinationChain);
    
    ChainData storage data = tbrChainState(destinationChain);
    bool isAlreadyPeer = data.peers[peer];
    if (!isAlreadyPeer)
      data.peers[peer] = true;
      
    bytes32 currentCanonicalPeer = data.canonicalPeer;
    if (currentCanonicalPeer != peer)
      data.canonicalPeer = peer;
  }

  function isChainSupported(uint16 destinationChain) internal view returns (bool) {
    return getCanonicalPeer(destinationChain) != bytes32(0);
  }

  function getRelayFee() internal view returns (uint32) {
    return tbrConfigState().relayFee;
  }

  function setRelayFee(uint32 fee) internal {
    tbrConfigState().relayFee = fee;
  }

  function getMaxGasDropoff(uint16 destinationChain) internal view returns (uint32) {
    return tbrChainState(destinationChain).maxGasDropoff;
  }

  function setMaxGasDropoff(uint16 destinationChain, uint32 maxGasDropoff) internal {
    tbrChainState(destinationChain).maxGasDropoff = maxGasDropoff;
  }

  /**
   * @notice Check if outbound transfers are paused for a given chain
   */
  function isPaused(uint16 destinationChain) internal view returns (bool) {
    return tbrChainState(destinationChain).isPaused;
  }

  /**
   * @notice Set outbound transfers for a given chain
   */
  function setPause(uint16 destinationChain, bool paused) internal {
    tbrChainState(destinationChain).isPaused = paused;
  }

  function transferEth(address to, uint256 amount) internal {
    (bool success, ) = to.call{value: amount}(new bytes(0));
    if (!success)
      revert EthTransferFailed();
  }
}
