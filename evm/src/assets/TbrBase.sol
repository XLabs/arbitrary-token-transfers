// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import {ITokenBridge} from "wormhole-sdk/interfaces/ITokenBridge.sol";
import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {IPermit2} from "permit2/IPermit2.sol";
import {IPriceOracle} from "price-oracle/IPriceOracle.sol";
import {PriceOracleIntegration} from "price-oracle/PriceOracleIntegration.sol";

/**
 * Decoding the command failed.
 */
error InvalidCommand(uint8 command, uint256 commandIndex);

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
   * @notice The base fee is denominated in µusd.
   */
  uint32 baseFee;
  /**
   * @notice The maximum gas dropoff is denominated in µ gas token of the target chain native token
   */
  uint32 maxGasDropoff;
  /**
   * @notice If the chain is paused, no outbound transfers will be allowed
   */
  bool paused;
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

function tbrChainState(uint16 targetChain) view returns (ChainData storage) {
  TbrChainState storage state;
  assembly ("memory-safe") {
    state.slot := TBR_CHAIN_STORAGE_SLOT
  }
  return state.data[targetChain];
}

error PeerIsZeroAddress();
error PeerAlreadyRegistered(uint16 chainId, bytes32 peer);
error CannotRemoveCanonicalPeer();
error InvalidChainId();
error ChainNoSupportedByTokenBridge(uint16 chainId);
/**
 * Payment to the target failed.
 */
error PaymentFailure(address target);

abstract contract TbrBase is PriceOracleIntegration {
  using BytesParsing for bytes;

  // 18 decimal precision representation / _TOTAL_FEE_DIVISOR = uint64 total fee
  uint internal constant _TOTAL_FEE_DIVISOR = 1e6;

  IPermit2     internal immutable permit2;
  uint16       internal immutable whChainId;
  ITokenBridge internal immutable tokenBridge;
  IWETH        internal immutable gasToken;
  /**
   * If true, the contract will call `deposit()` or `withdraw()` to convert from the native gas token to the ERC20 token and viceversa.
   */
  bool         internal immutable gasErc20TokenizationIsExplicit;

  constructor(
    IPermit2 initPermit2,
    ITokenBridge initTokenBridge,
    address oracle,
    IWETH initGasToken,
    bool initGasErc20TokenizationIsExplicit
  ) PriceOracleIntegration(oracle) {
    permit2 = initPermit2;
    whChainId = _oracleChainId();
    tokenBridge = initTokenBridge;
    gasToken = initGasToken;
    gasErc20TokenizationIsExplicit = initGasErc20TokenizationIsExplicit;
  }

  function _getTargetChainData(
    uint16 targetChain
  ) internal view returns (bytes32, uint32, uint32, bool, bool) {
    ChainData storage data = tbrChainState(targetChain);
    return (
      data.canonicalPeer,
      data.baseFee,
      data.maxGasDropoff,
      data.paused,
      data.txSizeSensitive
    );
  }

  function _isPeer(uint16 targetChain, bytes32 peer) internal view returns (bool) {
    return tbrChainState(targetChain).peers[peer];
  }

  function _addPeer(uint16 targetChain, bytes32 peer) internal {
    if (targetChain == 0 || targetChain == whChainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = tokenBridge.bridgeContracts(targetChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(targetChain);

    ChainData storage data = tbrChainState(targetChain);
    bool isAlreadyPeer = data.peers[peer];
    if (isAlreadyPeer)
      revert PeerAlreadyRegistered(targetChain, peer);

    data.peers[peer] = true;
  }

  function _isChainTxSizeSensitive(uint16 targetChain) internal view returns (bool) {
    return tbrChainState(targetChain).txSizeSensitive;
  }

  function _setChainTxSizeSensitive(uint16 targetChain, bool txSizeSensitive) internal {
    tbrChainState(targetChain).txSizeSensitive = txSizeSensitive;
  }

  function _getCanonicalPeer(uint16 targetChain) internal view returns (bytes32) {
    return tbrChainState(targetChain).canonicalPeer;
  }

  function _setCanonicalPeer(uint16 targetChain, bytes32 peer) internal {
    if (targetChain == 0 || targetChain == whChainId)
      revert InvalidChainId();

    if (peer == bytes32(0))
      revert PeerIsZeroAddress();

    bytes32 bridgeContractOnPeerChain = tokenBridge.bridgeContracts(targetChain);
    if (bridgeContractOnPeerChain == bytes32(0))
      revert ChainNoSupportedByTokenBridge(targetChain);

    ChainData storage data = tbrChainState(targetChain);
    bool isAlreadyPeer = data.peers[peer];
    if (!isAlreadyPeer)
      data.peers[peer] = true;

    bytes32 currentCanonicalPeer = data.canonicalPeer;
    if (currentCanonicalPeer != peer)
      data.canonicalPeer = peer;
  }

  function _isChainSupported(uint16 targetChain) internal view returns (bool) {
    return _getCanonicalPeer(targetChain) != bytes32(0);
  }

  function _getBaseFee(uint16 targetChain) internal view returns (uint32) {
    return tbrChainState(targetChain).baseFee;
  }

  function _setBaseFee(uint16 targetChain, uint32 baseFee) internal {
    tbrChainState(targetChain).baseFee = baseFee;
  }

  function _getMaxGasDropoff(uint16 targetChain) internal view returns (uint32) {
    return tbrChainState(targetChain).maxGasDropoff;
  }

  function _setMaxGasDropoff(uint16 targetChain, uint32 maxGasDropoff) internal {
    tbrChainState(targetChain).maxGasDropoff = maxGasDropoff;
  }

  /**
   * @notice Check if outbound transfers are paused for a given chain
   */
  function _isPaused(uint16 targetChain) internal view returns (bool) {
    return tbrChainState(targetChain).paused;
  }

  /**
   * @notice Set outbound transfers for a given chain
   */
  function _setPause(uint16 targetChain, bool paused) internal {
    tbrChainState(targetChain).paused = paused;
  }

  function _transferEth(address to, uint256 amount) internal {
    if (amount == 0) return;

    (bool success, ) = to.call{value: amount}(new bytes(0));
    if (!success) revert PaymentFailure(to);
  }
}
