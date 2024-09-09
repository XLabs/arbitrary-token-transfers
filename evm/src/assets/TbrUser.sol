// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TRANSFER_TOKEN_WITH_RELAY_ID} from "./TbrIds.sol";
import {TbrBase, InvalidCommand} from "./TbrBase.sol";

uint8 constant ACQUIRE_PREAPPROVED = 0;
uint8 constant ACQUIRE_PERMIT = 1;
uint8 constant ACQUIRE_PERMIT2TRANSFER = 2;
uint8 constant ACQUIRE_PERMITE2PERMIT = 3;

// Wormhole chain id for Solana
uint16 constant SOLANA_CHAIN = 1;

// How many accounts are created by a relay on Solana.
// Chosen by fair dice roll.
// TODO: measure this.
uint16 constant SOLANA_RELAY_SPAWNED_ACCOUNTS = 4;
// Size of all accounts created during a relay to Solana.
// TODO: measure this.
uint128 constant SOLANA_RELAY_TOTAL_SIZE = 1000;

// Gas cost of a single `complete transfer` method execution.
// TODO: measure this.
uint32 constant EVM_RELAY_GAS_COST = 400_000;
// Size of the transaction in bytes.
// TODO: measure this.
uint64 constant EVM_RELAY_TX_SIZE = 1000;


uint8 constant tbrv3MessageVersion = 0;

/**
 * The token address has no bytecode.
 */
error TokenDoesNotExist(IERC20 token);
/**
 * There are no peers in the destination chain.
 */
error DestinationChainIsNotSupported(uint16 destinationChain);
/**
 * Transfers to the destination chain are paused.
 */
error TransfersToChainArePaused(uint16 destinationChain);
/**
 * The gas dropoff requested exceeds the threshold for this particular chain.
 */
error GasDropoffRequestedExceedsMaximum(uint32 maxGasDropoff, uint256 commandIndex);
/**
 * The attached gas token value does not cover the relay fee.
 */
error FeesInsufficient(uint256 feeReceived, uint256 commandIndex);
/**
 * The acquire mode is not implemented at this time.
 */
error AcquireModeNotImplemented(uint8 acquireMode);

event TransferRequested(address sender, uint64 sequence, uint32 gasDropoff, uint256 fee);

abstract contract TbrUser is TbrBase {
  using BytesParsing for bytes;

  function transferTokenWithRelay(bytes calldata data, uint256 unallocatedBalance, uint256 commandIndex) internal returns (uint256 fee, uint256 offset) {
    // The bounds of the command are determined by the `acquireMode` field.
    // So we take the opportunity to keep it from that check.
    (uint8 acquireMode, uint256 size) = TransferTokenWithRelay.checkTransferTokenBounds(data, commandIndex);
    offset = size;
    // Copy the slice that contains the command
    // TODO: maybe we remove this step in favour of directly accessing the calldata buffer just in time?
    bytes memory transferCommand = data[:size];

    IERC20 token = TransferTokenWithRelay.decodeToken(transferCommand);
    // Check transfer parameters
    // Token address should hold a contract (might be optional but it's best to check separately)
    if (address(token).code.length == 0) {
      revert TokenDoesNotExist(token);
    }
    uint16 destinationChain = TransferTokenWithRelay.decodeDestinationChain(transferCommand);
    (bytes32 peer, bool chainIsPaused, bool txCommitEthereum, uint32 maxGasDropoff) = getTargetChainData(destinationChain);
    if (peer == bytes32(0)) {
      revert DestinationChainIsNotSupported(destinationChain);
    }
    if (chainIsPaused) {
      revert TransfersToChainArePaused(destinationChain);
    }
    uint32 gasDropoff = TransferTokenWithRelay.decodeGasdropoff(transferCommand);
    if (gasDropoff > maxGasDropoff) {
      revert GasDropoffRequestedExceedsMaximum(maxGasDropoff, commandIndex);
    }
    fee = quoteRelay(destinationChain, gasDropoff, txCommitEthereum);
    if (fee > unallocatedBalance) {
      revert FeesInsufficient(msg.value, commandIndex);
    }

    uint256 tokenAmount = TransferTokenWithRelay.decodeTokenAmount(transferCommand);
    // Acquire tokens
    if (acquireMode == ACQUIRE_PREAPPROVED) {
      SafeERC20.safeTransferFrom(token, msg.sender, address(this), tokenAmount);
    } else {
      revert AcquireModeNotImplemented(acquireMode);
    }

    bytes32 recipient = TransferTokenWithRelay.decodeRecipient(transferCommand);
    bool unwrapIntent = TransferTokenWithRelay.decodeUnrwapIntent(transferCommand);
    bytes memory tbrMessage = tbrv3Message(recipient, gasDropoff, unwrapIntent);
    // Perform call to token bridge.
    SafeERC20.safeApprove(token, address(tokenBridge), tokenAmount);
    uint64 sequence = tokenBridge.transferTokensWithPayload(address(token), tokenAmount, destinationChain, recipient, 0, tbrMessage);

    emit TransferRequested(msg.sender, sequence, gasDropoff, fee);
    // Return the fee that must be sent to the fee recipient.
    return (fee, offset);
  }

  function quoteRelay(uint16 destinationChain, uint32 gasDropoff, bool txCommitEthereum) view internal returns (uint256) {
    uint32 relayFee = getRelayFee();
    if (destinationChain == SOLANA_CHAIN) {
      return solanaTransactionQuote(gasDropoff, SOLANA_RELAY_SPAWNED_ACCOUNTS, SOLANA_RELAY_TOTAL_SIZE, relayFee);
    }

    if (txCommitEthereum) {
      return evmTransactionWithTxSizeQuote(destinationChain, gasDropoff, EVM_RELAY_GAS_COST, relayFee, EVM_RELAY_TX_SIZE);
    }

    return evmTransactionQuote(destinationChain, gasDropoff, EVM_RELAY_GAS_COST, relayFee);
  }

  function tbrv3Message(bytes32 recipient, uint32 gasDropoff, bool unwrapIntent) internal pure returns (bytes memory) {
    // 1 byte version
    // 32 byte recipient
    // 4 byte gas dropoff
    // 1 byte unwrap intent
    bytes memory result = abi.encodePacked(
      tbrv3MessageVersion,
      recipient,
      gasDropoff,
      unwrapIntent
    );
    return result;
  }
}

library TransferTokenWithRelay {
  using BytesParsing for bytes;
  //   32 bytes recipient address
  uint256 constant private RECIPIENT_OFFSET = 0;
  //   2 bytes uint chain id
  uint256 constant private CHAIN_OFFSET = RECIPIENT_OFFSET + 32;
  //   20 bytes token address
  uint256 constant private TOKEN_OFFSET = CHAIN_OFFSET + 2;
  //   32 bytes token amount
  uint256 constant private TOKENAMOUNT_OFFSET = CHAIN_OFFSET + 20;
  //   4 bytes uint gasDropoff
  uint256 constant private GASDROPOFF_OFFSET = TOKENAMOUNT_OFFSET + 32;
  //   1 byte boolean unwrapIntent
  uint256 constant private UNWRAPINTENT_OFFSET = GASDROPOFF_OFFSET + 4;
  //   1 byte acquire mode discriminator:
  uint256 constant private ACQUIREMODE_OFFSET = UNWRAPINTENT_OFFSET + 1;
  uint256 constant private MINIMUM_SIZE = ACQUIREMODE_OFFSET + 1;
  //     - 0, "Preapproved"
  //     - 1, "Permit"
  //        32 bytes uint value
  //        32 bytes uint deadline
  //        65 bytes signature
  //     - 2, "Permit2Transfer"
  //        32 bytes uint amount
  //        32 bytes uint nonce
  //        32 bytes uint sigDeadline
  //        65 bytes signature
  //     - 3, "Permit2Permit"
  //        20 bytes uint amount
  //        6 bytes uint expiration
  //        6 bytes uint nonce
  //        32 bytes uint sigDeadline
  //        65 bytes signature

  /**
   * Checks bounds for Transfer Token command and reads the acquire mode.
   */
  function checkTransferTokenBounds(bytes calldata data, uint256 commandIndex) pure internal returns (
    uint8 acquireMode,
    uint256 size
  ) {
    if (data.length < MINIMUM_SIZE) {
      revert InvalidCommand(TRANSFER_TOKEN_WITH_RELAY_ID, commandIndex);
    }

    acquireMode = uint8(data[ACQUIREMODE_OFFSET]);
    if (acquireMode == ACQUIRE_PREAPPROVED) {
      size = MINIMUM_SIZE;
    } else {
      revert AcquireModeNotImplemented(acquireMode);
    }
  }

  /**
   * These functions assume that the bounds check was performed on the data buffer already.
   * See checkTransferTokenBounds.
   */

  function decodeToken(bytes memory transferCommand) internal pure returns (IERC20) {
    (address token,) = transferCommand.asAddressUnchecked(TOKEN_OFFSET);
    return IERC20(token);
  }

  function decodeGasdropoff(bytes memory transferCommand) internal pure returns (uint32) {
    (uint32 gasDropoff,) = transferCommand.asUint32Unchecked(GASDROPOFF_OFFSET);
    return gasDropoff;
  }

  function decodeDestinationChain(bytes memory transferCommand) internal pure returns (uint16) {
    (uint16 chain,) = transferCommand.asUint16Unchecked(CHAIN_OFFSET);
    return chain;
  }

  function decodeTokenAmount(bytes memory transferCommand) internal pure returns (uint256) {
    (uint256 tokenAmount,) = transferCommand.asUint256Unchecked(TOKENAMOUNT_OFFSET);
    return tokenAmount;
  }

  function decodeRecipient(bytes memory transferCommand) internal pure returns (bytes32) {
    (bytes32 tokenAmount,) = transferCommand.asBytes32Unchecked(TOKENAMOUNT_OFFSET);
    return tokenAmount;
  }

  function decodeUnrwapIntent(bytes memory transferCommand) internal pure returns (bool) {
    (bool unwrapIntent,) = transferCommand.asBoolUnchecked(TOKENAMOUNT_OFFSET);
    return unwrapIntent;
  }

}