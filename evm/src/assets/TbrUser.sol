// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {fromUniversalAddress, forwardError} from "wormhole-sdk/Utils.sol";
import {IWETH} from "wormhole-sdk/interfaces/token/IWETH.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TRANSFER_TOKEN_WITH_RELAY_ID, TRANSFER_GAS_TOKEN_WITH_RELAY_ID, COMPLETE_TRANSFER_ID, TB_TRANSFER_WITH_PAYLOAD, RELAY_FEE_ID, BASE_RELAYING_CONFIG_ID} from "./TbrIds.sol";
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
uint8 constant SOLANA_RELAY_SPAWNED_ACCOUNTS = 4;
// Size of all accounts created during a relay to Solana.
// TODO: measure this.
uint32 constant SOLANA_RELAY_TOTAL_SIZE = 1000;

// Gas cost of a single `complete transfer` method execution.
// TODO: measure this.
uint32 constant EVM_RELAY_GAS_COST = 400_000;
// Size of the transaction in bytes.
// TODO: measure this.
uint32 constant EVM_RELAY_TX_SIZE = 1000;


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
/**
 * The incoming TB message was sent from an unknown contract.
 */
error UnrecognizedPeer(uint16 sourceChain, bytes32 sourceAddress, uint256 commandIndex);
/**
 * The complete transfer command was supplied with insufficient gas tokens.
 */
error InsufficientGasDropoff(uint256 commandIndex);
/**
 * The token transfer cannot be completed because the token is not attested on this chain yet.
 */
error TokenNotAttested(bytes32 canonicalToken, uint16 canonicalChain);
/**
 * The gas token in this chain has no supported ERC20 tokenization.
 */
error GasTokenNotSupported();
/**
 * The gas token is only accepted through ERC20 tokenization withdrawals.
 */
error GasTokenOnlyAcceptedViaWithdrawal();
/**
 * The VAA does not contain a Token Bridge "Transfer with payload" message.
 */
error UnexpectedMessage(uint8 payloadId, uint256 commandIndex);

event TransferRequested(address sender, uint64 sequence, uint32 gasDropoff, uint256 fee);

abstract contract TbrUser is TbrBase {
  function transferGasTokenWithRelay(
    bytes calldata data,
    uint256 unallocatedBalance,
    uint256 commandIndex
  ) internal returns (uint256 fee, uint256 offset) {
    if (address(gasToken) == address(0)) revert GasTokenNotSupported();

    // The bounds of the command are determined by the `acquireMode` field.
    // So we take the opportunity to keep it from that check.
    (
      bytes32 recipient,
      uint16 destinationChain,
      uint256 tokenAmount,
      uint32 gasDropoff,
      uint256 size
    ) = TransferGasTokenWithRelay.parseTransferGasToken(data, commandIndex);
    offset = size;

    // Check transfer parameters
    (bytes32 peer, bool chainIsPaused, bool txCommitEthereum, uint32 maxGasDropoff) = getTargetChainData(destinationChain);
    if (peer == bytes32(0)) {
      revert DestinationChainIsNotSupported(destinationChain);
    }
    if (chainIsPaused) {
      revert TransfersToChainArePaused(destinationChain);
    }
    if (gasDropoff > maxGasDropoff) {
      revert GasDropoffRequestedExceedsMaximum(maxGasDropoff, commandIndex);
    }
    fee = quoteRelay(destinationChain, gasDropoff, txCommitEthereum);
    if (fee + tokenAmount > unallocatedBalance) {
      revert FeesInsufficient(msg.value, commandIndex);
    }

    // Tokenize
    // Celo provides an ERC20 interface for its native token that doesn't require retokenization.
    if (gasErc20TokenizationIsExplicit) {
      gasToken.deposit{value: tokenAmount}();
    }

    bytes memory tbrMessage = tbrv3Message(recipient, gasDropoff, false);
    // Perform call to token bridge.
    SafeERC20.safeApprove(gasToken, address(tokenBridge), tokenAmount);
    uint64 sequence = tokenBridge.transferTokensWithPayload(address(gasToken), tokenAmount, destinationChain, peer, 0, tbrMessage);

    emit TransferRequested(msg.sender, sequence, gasDropoff, fee);
    // Return the fee that must be sent to the fee recipient.
    return (fee, offset);
  }

  function transferTokenWithRelay(
    bytes calldata data,
    uint256 unallocatedBalance,
    uint256 commandIndex
  ) internal returns (uint256 fee, uint256 offset) {
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
    // FIXME?: here we assume that the token transfers the entire amount without any tax or reward acquisition.
    if (acquireMode == ACQUIRE_PREAPPROVED) {
      SafeERC20.safeTransferFrom(token, msg.sender, address(this), tokenAmount);
    } else {
      revert AcquireModeNotImplemented(acquireMode);
    }

    bytes32 recipient = TransferTokenWithRelay.decodeRecipient(transferCommand);
    bool unwrapIntent = TransferTokenWithRelay.decodeUnwrapIntent(transferCommand);
    bytes memory tbrMessage = tbrv3Message(recipient, gasDropoff, unwrapIntent);
    // Perform call to token bridge.
    SafeERC20.safeApprove(token, address(tokenBridge), tokenAmount);
    uint64 sequence = tokenBridge.transferTokensWithPayload(address(token), tokenAmount, destinationChain, peer, 0, tbrMessage);

    emit TransferRequested(msg.sender, sequence, gasDropoff, fee);
    // Return the fee that must be sent to the fee recipient.
    return (fee, offset);
  }

  function quoteRelay(uint16 destinationChain, uint32 gasDropoff, bool txCommitEthereum) view internal returns (uint256) {
    uint32 fee = getRelayFee();
    if (destinationChain == SOLANA_CHAIN) {
      return solanaTransactionQuote(gasDropoff, SOLANA_RELAY_SPAWNED_ACCOUNTS, SOLANA_RELAY_TOTAL_SIZE, fee);
    }

    if (txCommitEthereum) {
      return evmTransactionWithTxSizeQuote(destinationChain, gasDropoff, EVM_RELAY_GAS_COST, fee, EVM_RELAY_TX_SIZE);
    }

    return evmTransactionQuote(destinationChain, gasDropoff, EVM_RELAY_GAS_COST, fee);
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

  /**
   * Redeems a TB transfer VAA.
   * Gas dropoff is reported to dispatcher so that any excedent can be refunded to the sender.
   */
  function completeTransfer(bytes calldata data, uint256 unallocatedBalance, uint256 commandIndex) internal returns (uint256 gasDropoffSpent, uint256 offset) {
    (bytes memory vaa, uint256 size, uint256 bodyOffset) = CompleteTransfer.extractVaa(data, commandIndex);
    offset = size;

    // Check that this is a known peer
    (bytes32 sourceAddress, uint16 sourceChain) = CompleteTransfer.decodeSource(vaa, bodyOffset);
    if (!isPeer(sourceChain, sourceAddress)) {
      revert UnrecognizedPeer(sourceChain, sourceAddress, commandIndex);
    }

    // TODO: evaluate whether to define the token amount received based on balance difference before and after transferring tokens from the TB.
    // Some tokens might implement distributed supply expansion / contraction. Doing the above would let us support those.

    // Perform redeem in TB
    // TODO: ignore return value? The gas savings might be very low.
    tokenBridge.completeTransferWithPayload(vaa);

    (address destination, uint256 tokenAmount, uint256 gasDropoff, bool unwrapIntent) = CompleteTransfer.decodeUserParams(vaa, bodyOffset);

    if (gasDropoff > unallocatedBalance) {
      revert InsufficientGasDropoff(commandIndex);
    }

    // If an unwrap is desired, unwrap and call destination with full amount
    if (unwrapIntent && gasErc20TokenizationIsExplicit) {
      gasToken.withdraw(tokenAmount);

      // Transfer full amount
      deliverGasToken(destination, gasDropoff + tokenAmount);
      return (gasDropoff, offset);
    }

    IERC20 token = deriveToken(vaa, bodyOffset);
    // Otherwise, transfer tokens and perform gas dropoff
    SafeERC20.safeTransfer(token, destination, tokenAmount);
    // Transfer gas dropoff
    deliverGasToken(destination, gasDropoff);
  }

  function deriveToken(bytes memory vaa, uint256 bodyOffset) view internal returns (IERC20 token) {
    (bytes32 canonicalToken, uint16 canonicalChain) = CompleteTransfer.decodeToken(vaa, bodyOffset);
    // TODO: compute the derived address here to avoid doing a call to the token bridge.
    // The gas savings shouldn't be that big so it's low priority.
    token = IERC20(tokenBridge.wrappedAsset(canonicalChain, canonicalToken));
    if (address(token) == address(0)) revert TokenNotAttested(canonicalToken, canonicalChain);
  }

  function deliverGasToken(address destination, uint256 amount/*, uint256 commandIndex*/) internal {
    // FIXME: we need to put an upper bound on the read bytes to ensure that the contract doesn't run out of gas.
    // The error should be wrapped in our own error too. It should also indicate the command that failed.
    (bool success, bytes memory result) = destination.call{value: amount}("");
    if (!success) forwardError(result);
  }

  /**
   * Returns the relay fee in gas token Mwei.
   */
  function relayFee(bytes calldata data, uint256 commandIndex) view internal returns(bytes memory result, uint256 offset) {
    uint16 chainId;
    uint32 gasDropoff;
    (chainId, gasDropoff, offset) = RelayFee.parseRelayFeeArgs(data, commandIndex);
    (, bool chainIsPaused, bool txCommitEthereum, uint32 maxGasDropoff) = getTargetChainData(chainId);

    if (gasDropoff > maxGasDropoff) revert GasDropoffRequestedExceedsMaximum(maxGasDropoff, commandIndex);

    uint64 fee = uint64(quoteRelay(chainId, gasDropoff, txCommitEthereum) / (10 ** 6));
    result = abi.encodePacked(chainIsPaused, fee);
  }

  function baseRelayingConfig(bytes calldata data, uint256 commandIndex) view internal returns(bytes memory result, uint256 offset) {
    uint16 chainId;
    (chainId, offset) = BaseRelayingConfig.parseBaseRelayingConfigArgs(data, commandIndex);
    (bytes32 peer, bool chainIsPaused, bool txCommitEthereum, uint32 maxGasDropoff) = getTargetChainData(chainId);
    uint32 baseFee = getRelayFee();

    result = abi.encodePacked(peer, chainIsPaused, txCommitEthereum, maxGasDropoff, baseFee);
  }


  receive() external payable {
    // NOTE: all values retrieved here need to be immutables to avoid going over the 2300 gas stipend
    if (!gasErc20TokenizationIsExplicit) {
      revert GasTokenNotSupported();
    }

    if (msg.sender != address(gasToken)) {
      revert GasTokenOnlyAcceptedViaWithdrawal();
    }
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
  uint256 constant private TOKEN_AMOUNT_OFFSET = TOKEN_OFFSET + 20;
  //   4 bytes uint gasDropoff
  uint256 constant private GAS_DROPOFF_OFFSET = TOKEN_AMOUNT_OFFSET + 32;
  //   1 byte boolean unwrapIntent
  uint256 constant private UNWRAPINTENT_OFFSET = GAS_DROPOFF_OFFSET + 4;
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
    (uint32 gasDropoff,) = transferCommand.asUint32Unchecked(GAS_DROPOFF_OFFSET);
    return gasDropoff;
  }

  function decodeDestinationChain(bytes memory transferCommand) internal pure returns (uint16) {
    (uint16 chain,) = transferCommand.asUint16Unchecked(CHAIN_OFFSET);
    return chain;
  }

  function decodeTokenAmount(bytes memory transferCommand) internal pure returns (uint256) {
    (uint256 tokenAmount,) = transferCommand.asUint256Unchecked(TOKEN_AMOUNT_OFFSET);
    return tokenAmount;
  }

  function decodeRecipient(bytes memory transferCommand) internal pure returns (bytes32) {
    (bytes32 tokenAmount,) = transferCommand.asBytes32Unchecked(RECIPIENT_OFFSET);
    return tokenAmount;
  }

  function decodeUnwrapIntent(bytes memory transferCommand) internal pure returns (bool) {
    (bool unwrapIntent,) = transferCommand.asBoolUnchecked(UNWRAPINTENT_OFFSET);
    return unwrapIntent;
  }
}

library TransferGasTokenWithRelay {
  using BytesParsing for bytes;
  //   32 bytes recipient address
  uint256 constant private RECIPIENT_OFFSET = 0;
  //   2 bytes uint chain id
  uint256 constant private CHAIN_OFFSET = RECIPIENT_OFFSET + 32;
  //   32 bytes uint gas token amount
  uint256 constant private TOKEN_AMOUNT_OFFSET = CHAIN_OFFSET + 2;
  //   4 bytes uint gasDropoff
  uint256 constant private GAS_DROPOFF_OFFSET = TOKEN_AMOUNT_OFFSET + 32;
  uint256 constant private TRANSFER_GAS_TOKEN_SIZE = GAS_DROPOFF_OFFSET + 4;

  /**
   * Checks bounds for Transfer Gas Token command and parses all arguments.
   */
  function parseTransferGasToken(bytes calldata data, uint256 commandIndex) pure internal returns (
    bytes32 recipient,
    uint16 chainId,
    uint256 tokenAmount,
    uint32 gasDropoff,
    uint256 size
  ) {
    size = TRANSFER_GAS_TOKEN_SIZE;
    if (data.length < size) {
      revert InvalidCommand(TRANSFER_GAS_TOKEN_WITH_RELAY_ID, commandIndex);
    }

    bytes memory transferCommand = data[:size];
    (recipient,) = transferCommand.asBytes32Unchecked(RECIPIENT_OFFSET);
    (chainId,) = transferCommand.asUint16Unchecked(CHAIN_OFFSET);
    (tokenAmount,) = transferCommand.asUint256Unchecked(TOKEN_AMOUNT_OFFSET);
    (gasDropoff,) = transferCommand.asUint32Unchecked(GAS_DROPOFF_OFFSET);
  }
}

library CompleteTransfer {
  using BytesParsing for bytes;
  // The complete transfer command just has a single parameter: a VAA.
  // So here we have constants and code that helps parse the relevant parts of a VAA.
  //   2 bytes uint vaa length
  uint256 constant private VAA_LENGTH_OFFSET = 0;
  uint256 constant private VAA_OFFSET = VAA_LENGTH_OFFSET + 2;

  // start of VAA header

  //   1 byte uint vaa version, should be 0
  uint256 constant private VAA_VERSION_OFFSET = 0;
  //   4 bytes uint guardian set
  uint256 constant private GUARDIAN_SET_OFFSET = VAA_VERSION_OFFSET + 1;
  //   1 byte signature array length
  uint256 constant private SIGNATURE_ARRAY_LENGTH_OFFSET = GUARDIAN_SET_OFFSET + 4;

  uint256 constant private FIRST_SIGNATURE_OFFSET = SIGNATURE_ARRAY_LENGTH_OFFSET + 1;
  // Layout of each signature:
  //   1 byte uint guardian index
  uint256 constant private GUARDIAN_INDEX_OFFSET = 0;
  //   65 bytes signature
  uint256 constant private SIGNATURE_OFFSET = GUARDIAN_INDEX_OFFSET + 1;
  uint256 constant SIGNATURE_SIZE = 66;

  // end of VAA header
  // start of VAA body

  //   4 bytes uint timestamp
  uint256 constant private TIMESTAMP_OFFSET = 0;
  //   4 bytes uint nonce
  uint256 constant private NONCE_OFFSET = TIMESTAMP_OFFSET + 4;
  //   2 bytes uint source chain id
  uint256 constant private SOURCE_CHAIN_OFFSET = NONCE_OFFSET + 4;
  //   32 bytes emitter address
  uint256 constant private EMITTER_ADDRESS_OFFSET = SOURCE_CHAIN_OFFSET + 2;
  //   8 bytes uint sequence
  uint256 constant private SEQUENCE_OFFSET = EMITTER_ADDRESS_OFFSET + 32;
  //   1 byte uint consistency level
  uint256 constant private CONSISTENCY_LEVEL_OFFSET = SEQUENCE_OFFSET + 8;

  // Start of custom VAA payload
  // See https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/main/core/definitions/src/protocols/tokenBridge/tokenBridgeLayout.ts#L49
  //   1 byte uint payload id
  //     - 1, "Transfer" -> reject
  //     - 2, "AttestMeta" -> reject
  //     - 3, "TransferWithPayload"
  uint256 constant private PAYLOAD_ID_OFFSET = CONSISTENCY_LEVEL_OFFSET + 1;
  // These correspond to "TransferWithPayload" layout
  //   32 bytes uint amount
  uint256 constant private AMOUNT_OFFSET = PAYLOAD_ID_OFFSET + 1;
  //   32 bytes token address
  uint256 constant private TOKEN_ADDRESS_OFFSET = AMOUNT_OFFSET + 32;
  //   2 bytes uint canonical token chain id
  uint256 constant private TOKEN_CHAIN_OFFSET = TOKEN_ADDRESS_OFFSET + 32;
  //   32 bytes TB destination address
  uint256 constant private TB_DESTINATION_ADDRESS_OFFSET = TOKEN_CHAIN_OFFSET + 2;
  //   2 bytes uint TB destination chain
  uint256 constant private TB_DESTINATION_CHAIN_OFFSET = TB_DESTINATION_ADDRESS_OFFSET + 32;
  //   32 bytes source address
  uint256 constant private SOURCE_ADDRESS_OFFSET = TB_DESTINATION_CHAIN_OFFSET + 2;

  // Start of nested TB custom payload
  // Here goes the TBRv3 message
  //   1 byte uint message version
  uint256 constant private TBR_VERSION_OFFSET = SOURCE_ADDRESS_OFFSET + 32;
  //   32 bytes user address that receives the tokens
  uint256 constant private TOKEN_RECIPIENT_OFFSET = TBR_VERSION_OFFSET + 1;
  //   4 bytes uint gas dropoff requested
  uint256 constant private GAS_DROPOFF_OFFSET = TOKEN_RECIPIENT_OFFSET + 32;
  //   1 byte boolean unwrap intent
  uint256 constant private UNWRAP_INTENT_OFFSET = GAS_DROPOFF_OFFSET + 4;

  // End of nested TB custom payload and VAA payload
  uint256 constant private VAA_BODY_SIZE = UNWRAP_INTENT_OFFSET + 1;

  /**
   * The CompleteTransfer command has a single argument: the VAA.
   * So we return the offset past the end of the command here too.
   */
  function extractVaa(bytes calldata data, uint256 commandIndex) pure internal returns(bytes memory, uint256, uint256) {
    uint256 vaaLength = uint256(uint8(data[VAA_LENGTH_OFFSET]));

    // We copy the whole VAA because we need to forward it to the token bridge.
    bytes memory vaa = data[VAA_VERSION_OFFSET:vaaLength];

    (uint256 signatures,) = vaa.asUint8Unchecked(SIGNATURE_ARRAY_LENGTH_OFFSET);
    // uint256 signatures = uint256();
    uint256 signatureArraySize = signatures * SIGNATURE_SIZE;
    uint256 bodyOffset = FIRST_SIGNATURE_OFFSET + signatureArraySize;
    uint256 expectedLength = bodyOffset + VAA_BODY_SIZE;
    uint256 totalSize = VAA_OFFSET + vaaLength;
    if (vaaLength != expectedLength || totalSize > data.length) {
      revert InvalidCommand(COMPLETE_TRANSFER_ID, commandIndex);
    }

    // Checking that the emitter is the token bridge is possible at this point but isn't really worth it since this is something
    // checked by the token bridge itself when processing the VAA.

    (uint8 payloadId,) = vaa.asUint8Unchecked(bodyOffset + PAYLOAD_ID_OFFSET);
    if (payloadId != TB_TRANSFER_WITH_PAYLOAD) {
      revert UnexpectedMessage(payloadId, commandIndex);
    }

    return (vaa, totalSize, bodyOffset);
  }

  // These functions assume that the length check in `extractVaa` was performed

  function decodeSource(bytes memory vaa, uint256 bodyOffset) pure internal returns(bytes32 sourceAddress, uint16 sourceChain) {
    (sourceAddress,) = vaa.asBytes32Unchecked(bodyOffset + SOURCE_ADDRESS_OFFSET);
    (sourceChain,) = vaa.asUint16Unchecked(bodyOffset + SOURCE_CHAIN_OFFSET);
  }

  function decodeToken(bytes memory vaa, uint256 bodyOffset) pure internal returns(bytes32 canonicalToken, uint16 canonicalChain) {
    (canonicalToken,) = vaa.asBytes32Unchecked(bodyOffset + TOKEN_ADDRESS_OFFSET);
    (canonicalChain,) = vaa.asUint16Unchecked(bodyOffset + TOKEN_CHAIN_OFFSET);
  }

  function decodeUserParams(bytes memory vaa, uint256 bodyOffset) pure internal returns(
    address destination,
    uint256 tokenAmount,
    uint256 gasDropoff,
    bool unwrapIntent
  ) {
    (bytes32 destinationUniversal,) = vaa.asBytes32Unchecked(bodyOffset + TOKEN_RECIPIENT_OFFSET);
    destination = fromUniversalAddress(destinationUniversal);
    (tokenAmount,) = vaa.asUint256Unchecked(bodyOffset + AMOUNT_OFFSET);
    (gasDropoff,) = vaa.asUint32Unchecked(bodyOffset + GAS_DROPOFF_OFFSET);
    (unwrapIntent,) = vaa.asBoolUnchecked(bodyOffset + UNWRAP_INTENT_OFFSET);
  }
}

library RelayFee {
  using BytesParsing for bytes;

  // 2 bytes uint chain id
  uint256 constant private CHAIN_OFFSET = 0;
  // 4 bytes uint gas dropoff
  uint256 constant private GAS_DROPOFF_OFFSET = CHAIN_OFFSET + 2;
  uint256 constant private RELAY_FEE_SIZE = GAS_DROPOFF_OFFSET + 4;

  function parseRelayFeeArgs(bytes calldata data, uint256 commandIndex) pure internal returns(uint16 chainId, uint32 gasDropoff, uint256 consumedBytes) {
    consumedBytes = RELAY_FEE_SIZE;
    if (data.length < consumedBytes) revert InvalidCommand(RELAY_FEE_ID, commandIndex);

    bytes memory relayFeeQuery = data[:consumedBytes];
    (chainId,) = relayFeeQuery.asUint16Unchecked(CHAIN_OFFSET);
    (gasDropoff,) = relayFeeQuery.asUint32Unchecked(GAS_DROPOFF_OFFSET);
  }
}

library BaseRelayingConfig {
  using BytesParsing for bytes;

  // 2 bytes uint chain id
  uint256 constant private CHAIN_OFFSET = 0;
  uint256 constant private BASE_RELAYING_CONFIG_SIZE = CHAIN_OFFSET + 2;

  function parseBaseRelayingConfigArgs(bytes calldata data, uint256 commandIndex) pure internal returns(uint16 chainId, uint256 consumedBytes) {
    consumedBytes = BASE_RELAYING_CONFIG_SIZE;
    if (data.length < consumedBytes) revert InvalidCommand(BASE_RELAYING_CONFIG_ID, commandIndex);

    bytes memory BaseRelayingConfigQuery = data[:consumedBytes];
    (chainId,) = BaseRelayingConfigQuery.asUint16Unchecked(CHAIN_OFFSET);
  }
}