// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {CHAIN_ID_SOLANA} from "wormhole-sdk/constants/Chains.sol";
import {BytesParsing} from "wormhole-sdk/libraries/BytesParsing.sol";
import {PermitParsing} from "wormhole-sdk/libraries/PermitParsing.sol";
import {fromUniversalAddress} from "wormhole-sdk/Utils.sol";
import {FREE_MEMORY_PTR} from "wormhole-sdk/constants/Common.sol";
import {IERC20Metadata} from "wormhole-sdk/interfaces/token/IERC20Metadata.sol";
import {IERC20Permit} from "wormhole-sdk/interfaces/token/IERC20Permit.sol";
import {SafeERC20} from "wormhole-sdk/libraries/SafeERC20.sol";
import {ISignatureTransfer, IAllowanceTransfer} from "permit2/IPermit2.sol";
import {
  TRANSFER_TOKEN_WITH_RELAY_ID,
  TRANSFER_GAS_TOKEN_WITH_RELAY_ID,
  COMPLETE_TRANSFER_ID,
  RELAY_FEE_ID,
  BASE_RELAYING_CONFIG_ID,
  APPROVE_TOKEN_ID
} from "./TbrIds.sol";
import {TbrBase} from "./TbrBase.sol";
import {GasDropoff, BaseFee} from "price-oracle/PriceOracleIntegration.sol";
import {VaaLib} from "wormhole-sdk/libraries/VaaLib.sol";
import {TokenBridgeMessageLib} from "wormhole-sdk/libraries/TokenBridgeMessages.sol";

uint8 constant TBR_V3_MESSAGE_VERSION = 0;

uint8 constant ACQUIRE_PREAPPROVED = 0;
uint8 constant ACQUIRE_PERMIT = 1;
uint8 constant ACQUIRE_PERMIT2TRANSFER = 2;
uint8 constant ACQUIRE_PERMIT2PERMIT = 3;

// Solana computation units per relay.
uint32 constant SOLANA_RELAY_COMPUTATION_UNITS = 385_000;
// Solana signature count per relay.
// Post VAA -> 3 txs
//   7 Signature  verifications -> 2 signatures
//   6 Signature  verifications -> 2 signatures
//   Core verify signature set  -> 1 signature
// Create user ATA              -> 1 signature
// Redeem tx                    -> 1 signature
uint8 constant SOLANA_RELAY_SIGNATURE_COUNT = 7;
// Size of all accounts created during a relay to Solana.
uint32 constant SOLANA_RELAY_TOTAL_SIZE_OF_ACCOUNTS =
  //signatureSet
  // see here: https://github.com/wormhole-foundation/wormhole/blob/91ec4d1dc01f8b690f0492815407505fb4587520/solana/bridge/program/src/accounts/signature_set.rs#L17
  128 + // signatureSet account overhead
    4 + // signatureSet vec length
   19 + // signatureSet bool vec for 19 guardians
   32 + // vaa hash
    4 + // guardianSet
  // PostedVAA
  // see here: https://github.com/wormhole-foundation/wormhole/blob/91ec4d1dc01f8b690f0492815407505fb4587520/solana/bridge/program/src/accounts/posted_vaa.rs#L39
  // and here: https://github.com/wormhole-foundation/wormhole/blob/91ec4d1dc01f8b690f0492815407505fb4587520/solana/bridge/program/src/accounts/posted_message.rs#L46
  // and here: https://github.com/wormhole-foundation/wormhole/blob/91ec4d1dc01f8b690f0492815407505fb4587520/solana/modules/token_bridge/program/src/messages.rs#L175
  128 + // PostedVaa account overhead
    3 + // discriminator
    1 + // vaa version
    1 + // consistency level
    4 + // vaa timestamp
   32 + // signature account address
    4 + // submission_time (waste)
    4 + // nonce
    8 + // sequence
    2 + // emitterChain
    4 + // payload vec length
    1 + // payload id
   32 + // token amount
   32 + // token origin address
    2 + // token origin chain
   32 + // token bridge recipient address
    2 + // recipient chain
   32 + // from(=peer) address
    1 + // tbrv3 version
   32 + // recipient address
    4 + // gas dropoff
    1 + // unwrap intent*/ +
  //ATA (should sum up to 165)
  // see here https://github.com/solana-labs/solana-program-library/blob/6d92f4537a8dc278285abd66d93e7d49caaca0c5/token/program/src/state.rs#L89
  128 + // ATA account overhead
   32 + // associated mint
   32 + // owner
    8 + // amount
    4 + // COption prefix (0 or 1, 4 bytes, waste) - see https://github.com/solana-labs/solana-program-library/blob/6d92f4537a8dc278285abd66d93e7d49caaca0c5/token/program/src/state.rs#L267
   32 + // delegate COption<Pubkey>
    1 + // account state enum
    4 + // COoption prefix
    8 + // is_native COption<u64>
    8 + // delegated amount
    4 + // COoption prefix
   32;  // close authority COption<Pubkey>

// Gas cost of a single `complete transfer` method execution.
uint32 constant EVM_RELAY_GAS_COST = 333_164;
// Size of the transaction in bytes.
uint32 constant EVM_RELAY_TX_SIZE = 1212;
// Amount of WEI in a microeth
uint256 constant WEI_PER_MICROETH = 1E12;

/**
 * There are no peers in the target chain.
 */
error TargetChainIsNotSupported(uint16 targetChain);
/**
 * Transfers to the target chain are paused.
 */
error TransfersToChainArePaused(uint16 targetChain);
/**
 * The gas dropoff requested exceeds the threshold for this particular chain.
 */
error GasDropoffRequestedExceedsMaximum(uint32 maxGasDropoff, uint commandIndex);
/**
 * The attached gas token value does not cover the relay fee.
 */
error FeesInsufficient(uint256 feeReceived, uint commandIndex);
/**
 * The acquire mode is not implemented at this time.
 */
error InvalidAcquireMode(uint8 acquireMode);
/**
 * The incoming TBR payload had an unsupported version.
 */
error InvalidMsgVersion(uint8 version, uint commandIndex);
/**
 * The incoming VAA has an invalid length.
 */
error InvalidVaaLength(uint commandIndex);
/**
 * The incoming TB message was sent from an unknown contract.
 */
error UnrecognizedPeer(uint16 sourceChain, bytes32 sourceAddress, uint commandIndex);
/**
 * The complete transfer command was supplied with insufficient gas tokens.
 */
error InsufficientGasDropoff(uint commandIndex);
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
 * The token recipient cannot be the zero address.
 */
error InvalidTokenRecipient();
/**
 * The token amount cannot be zero.
 */
error InvalidTokenAmount();
/**
 * The calculated fee is too large to be handled.
 */
error FeeTooLarge(uint256 totalFee, uint commandIndex);

error PayFailure(uint commandIndex, bytes bubbledUpError);

function pay(
  address payable callee,
  uint256 value,
  uint commandIndex
) {
  bytes4 selector = PayFailure.selector;
  /// @solidity memory-safe-assembly
  assembly {
    let success := call(gas(), callee, value, 0, 0, 0, 0)
    switch success
    case 0 {
      let freeMemory := mload(FREE_MEMORY_PTR)
      mstore(freeMemory, selector)
      mstore(add(freeMemory, 4), commandIndex)
      let returnedDataSize := returndatasize()
      mstore(add(freeMemory, 36), returnedDataSize)
      returndatacopy(add(freeMemory, 68), 0, returnedDataSize)
      let errorSize := add(returnedDataSize, 68)
      revert(freeMemory, errorSize)
    } default {}
  }
}

event TransferRequested(address sender, uint64 sequence, uint32 gasDropoff, uint256 fee);

abstract contract TbrUser is TbrBase {
  using BytesParsing for bytes;

  function _transferTokenWithRelay(
    bytes calldata data,
    uint offset,
    uint256 unallocatedBalance,
    uint commandIndex
  ) internal returns (uint256, uint256, uint256) {
    uint16 targetChain; bytes32 recipient; uint32 gasDropoff; uint256 tokenAmount;
    (targetChain, recipient, gasDropoff, tokenAmount, offset) = _parseSharedParams(data, offset);
    address rawToken; bool unwrapIntent;
    (rawToken,     offset) = data.asAddressCdUnchecked(offset);
    (unwrapIntent, offset) = data.asBoolCdUnchecked(offset);
    IERC20Metadata token = IERC20Metadata(rawToken);
    (bytes32 peer, uint256 finalTokenAmount, uint256 fee, uint256 wormholeFee) =
      _getAndCheckTransferParams(targetChain, recipient, token, tokenAmount, gasDropoff, commandIndex);

    offset = _acquireTokens(data, offset, token, finalTokenAmount);

    if (fee + wormholeFee > unallocatedBalance)
      revert FeesInsufficient(msg.value, commandIndex);

    _bridgeOut(token, targetChain, peer, recipient, finalTokenAmount, gasDropoff, unwrapIntent, fee, wormholeFee);

    // Return the fee that must be sent to the fee recipient.
    // TODO: should we return the sequence to the caller too?
    // We shouldn't do so until we can efficiently allocate the memory for the result though.
    return (fee, wormholeFee, offset);
  }

  function _transferGasTokenWithRelay(
    bytes calldata data,
    uint offset,
    uint256 unallocatedBalance,
    uint commandIndex
  ) internal returns (uint256, uint256, uint256) {
    if (address(gasToken) == address(0))
      revert GasTokenNotSupported();

    uint16 targetChain; bytes32 recipient; uint32 gasDropoff; uint256 tokenAmount;
    (targetChain, recipient, gasDropoff, tokenAmount, offset) = _parseSharedParams(data, offset);

    (bytes32 peer, uint256 finalTokenAmount, uint256 fee, uint256 wormholeFee) =
      _getAndCheckTransferParams(
        targetChain,
        recipient,
        IERC20Metadata(address(gasToken)),
        tokenAmount,
        gasDropoff,
        commandIndex
      );

    if (fee + finalTokenAmount + wormholeFee > unallocatedBalance)
      revert FeesInsufficient(msg.value, commandIndex);

    // Tokenize
    // Celo provides an ERC20 interface for its native token that doesn't require retokenization.
    if (gasErc20TokenizationIsExplicit)
      gasToken.deposit{value: finalTokenAmount}();

    IERC20Metadata token = IERC20Metadata(address(gasToken));
    _bridgeOut(
      token,
      targetChain,
      peer,
      recipient,
      finalTokenAmount,
      gasDropoff,
      false,
      fee,
      wormholeFee
    );

    // Return the fee that must be sent to the fee recipient.
    return (fee, finalTokenAmount + wormholeFee, offset);
  }

  function _parseSharedParams(
    bytes calldata data,
    uint offset
  ) internal pure returns (
    uint16  targetChain,
    bytes32 recipient,
    uint32  gasDropoff,
    uint256 inputAmount,
    uint    //offset
  ) {
    (targetChain, offset) = data.asUint16CdUnchecked(offset);
    (recipient,   offset) = data.asBytes32CdUnchecked(offset);
    (gasDropoff,  offset) = data.asUint32CdUnchecked(offset);
    (inputAmount, offset) = data.asUint256CdUnchecked(offset);
    return (targetChain, recipient, gasDropoff, inputAmount, offset);
  }

  //TODO this also needs to go into a shared library of some kind
  function _acquireTokens(
    bytes calldata data,
    uint offset,
    IERC20Metadata token,
    uint256 finalTokenAmount
  ) internal returns (uint) {
    // Acquire tokens
    uint8 acquireMode;
    (acquireMode, offset) = data.asUint8CdUnchecked(offset);
    if (acquireMode == ACQUIRE_PREAPPROVED)
      SafeERC20.safeTransferFrom(token, msg.sender, address(this), finalTokenAmount);
    else if (acquireMode == ACQUIRE_PERMIT) {
      uint256 value; uint256 deadline; bytes32 r; bytes32 s; uint8 v;
      (value, deadline, r, s, v, offset) =
        PermitParsing.decodePermitCdUnchecked(data, offset);
      //allow failure to prevent front-running griefing attacks
      //  (i.e. getting permit from mempool and submitting it to the token contract directly)
      try
        IERC20Permit(address(token)).permit(msg.sender, address(this), value, deadline, v, r, s) {}
      catch {}

      // We only acquire the normalized `finalTokenAmount`
      SafeERC20.safeTransferFrom(token, msg.sender, address(this), finalTokenAmount);
    }
    else if (acquireMode == ACQUIRE_PERMIT2TRANSFER) {
      uint256 amount; uint256 nonce; uint256 sigDeadline; bytes memory signature;
      (amount, nonce, sigDeadline, signature, offset) =
        PermitParsing.decodePermit2TransferCdUnchecked(data, offset);

      permit2.permitTransferFrom(
        ISignatureTransfer.PermitTransferFrom({
          permitted: ISignatureTransfer.TokenPermissions(address(token), amount),
          nonce: nonce,
          deadline: sigDeadline
        }),
        ISignatureTransfer.SignatureTransferDetails({
          to: address(this),
          requestedAmount: finalTokenAmount
        }),
        msg.sender,
        signature
      );
    }
    else if (acquireMode == ACQUIRE_PERMIT2PERMIT) {
      uint160 amount; uint48 expiration; uint48 nonce; uint256 sigDeadline; bytes memory signature;
      (amount, expiration, nonce, sigDeadline, signature, offset) =
        PermitParsing.decodePermit2PermitCdUnchecked(data, offset);
      //allow failure to prevent front-running griefing attacks
      try
        permit2.permit(
          msg.sender,
          IAllowanceTransfer.PermitSingle({
            details: IAllowanceTransfer.PermitDetails(
              address(token),
              amount,
              expiration,
              nonce
            ),
            spender: address(this),
            sigDeadline: sigDeadline
          }),
          signature
        ) {}
      catch {}
      permit2.transferFrom(msg.sender, address(this), uint160(finalTokenAmount), address(token));
    }
    else
      revert InvalidAcquireMode(acquireMode);

    return offset;
  }

  function _getAndCheckTransferParams(
    uint16 targetChain,
    bytes32 recipient,
    IERC20Metadata token,
    uint256 tokenAmount,
    uint32 gasDropoff,
    uint commandIndex
  ) internal view returns (bytes32, uint256, uint256, uint256) {
    (bytes32 peer, uint32 baseFee, uint32 maxGasDropoff, bool paused) =
      _getTargetChainData(targetChain);

    if (peer == bytes32(0))
      revert TargetChainIsNotSupported(targetChain);

    if (paused)
      revert TransfersToChainArePaused(targetChain);

    if (gasDropoff > maxGasDropoff)
      revert GasDropoffRequestedExceedsMaximum(maxGasDropoff, commandIndex);

    if (recipient == bytes32(0))
      revert InvalidTokenRecipient();

    uint8 decimals = token.decimals();
    uint256 cleanedTokenAmount = deNormalizeAmount(
      normalizeAmount(tokenAmount, decimals),
      decimals
    );

    if (cleanedTokenAmount == 0)
      revert InvalidTokenAmount();

    (uint256 fee, uint256 wormholeFee) = _quoteRelay(targetChain, gasDropoff, baseFee);

    return (peer, cleanedTokenAmount, fee, wormholeFee);
  }

  function normalizeAmount(uint256 amount, uint8 decimals) internal pure returns(uint256) { unchecked {
    if (decimals > 8) {
      amount /= 10 ** (decimals - 8);
    }
    return amount;
  }}

  function deNormalizeAmount(uint256 amount, uint8 decimals) internal pure returns(uint256) { unchecked {
    if (decimals > 8) {
      amount *= 10 ** (decimals - 8);
    }
    return amount;
  }}

  /**
   * @return fee in gas tokens with 18 decimals (i.e. wei)
   * @return wormhole fee in gas tokens with 18 decimals (i.e. wei)
   */
  function _quoteRelay(
    uint16 targetChain,
    uint32 gasDropoff,
    uint32 baseFee
  ) view internal returns (uint256, uint256) {
    uint wormholeFee = wormholeCore.messageFee();
    if (targetChain == CHAIN_ID_SOLANA)
      return (
        _solanaTransactionQuote(
          GasDropoff.wrap(gasDropoff),
          SOLANA_RELAY_COMPUTATION_UNITS,
          SOLANA_RELAY_TOTAL_SIZE_OF_ACCOUNTS,
          SOLANA_RELAY_SIGNATURE_COUNT,
          BaseFee.wrap(baseFee)
        ),
        wormholeFee
      );

    return (
        _evmTransactionQuote(
          targetChain,
          GasDropoff.wrap(gasDropoff),
          EVM_RELAY_GAS_COST,
          BaseFee.wrap(baseFee),
          EVM_RELAY_TX_SIZE
        ),
        wormholeFee
    );
  }

  function _bridgeOut(
    IERC20Metadata token,
    uint16 targetChain,
    bytes32 peer,
    bytes32 recipient,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent,
    uint256 fee,
    uint256 wormholeFee
  ) private {
    bytes memory tbrMessage = _tbrv3Message(recipient, gasDropoff, unwrapIntent);
    // Perform call to token bridge. This requires previous approval of the tokens.
    uint64 sequence = tokenBridge.transferTokensWithPayload{value: wormholeFee}(
      address(token),
      tokenAmount,
      targetChain,
      peer,
      0,
      tbrMessage
    );

    emit TransferRequested(msg.sender, sequence, gasDropoff, fee);
  }

  function _approveToken(
    bytes calldata data,
    uint offset
  ) internal returns (uint256) { unchecked {
    address token;
    uint retOffset;
    (token, retOffset) = data.asAddressCdUnchecked(offset);

    SafeERC20.forceApprove(IERC20Metadata(token), address(tokenBridge), type(uint256).max);

    return retOffset;
  }}

  function _tbrv3Message(
    bytes32 recipient,
    uint32 gasDropoff,
    bool unwrapIntent
  ) internal pure returns (bytes memory) {
    // From low byte offset to high byte offset:
    // 1 byte version
    // 32 byte recipient
    // 4 byte gas dropoff, in µToken units.
    // 1 byte unwrap intent
    return abi.encodePacked(
      TBR_V3_MESSAGE_VERSION,
      recipient,
      gasDropoff,
      unwrapIntent
    );
  }

  function _allowanceTokenBridge(
    bytes calldata data,
    uint offset
  ) internal view returns (bytes memory, uint) {
    address token; uint retOffset;
    (token, retOffset) = data.asAddressCdUnchecked(offset);
    uint256 allowance = _allowanceTokenBridgeImpl(token);

    return (abi.encodePacked(allowance), retOffset);
  }

  function _allowanceTokenBridgeImpl(
    address token
  ) internal view returns (uint256) {
    return IERC20Metadata(token).allowance(address(this), address(tokenBridge));
  }

  function _completeTransfer(
    bytes calldata data,
    uint offset,
    uint256 unallocatedBalance,
    uint commandIndex
  ) internal returns (uint256, uint) { unchecked {
    ( bytes calldata vaa,
      uint16 peerChain,
      bytes32 peerAddress,
      uint16 tokenOriginChain,
      bytes32 tokenOriginAddress,
      address recipient,
      uint256 tbNormalizedTokenAmount,
      uint32 gasDropoff,
      bool unwrapIntent,
      uint retOffset
    ) = _parseRedeem(data, offset, commandIndex);

    if (!_isPeer(peerChain, peerAddress))
      revert UnrecognizedPeer(peerChain, peerAddress, commandIndex);

    // If the recipient redeems manually it doesn't need the gasDropoff
    if (msg.sender == recipient)
      gasDropoff = 0;

    // The dropoff in the message is measured in microeth so we should convert it to wei first
    uint256 gasDropoffInWei = gasDropoff * WEI_PER_MICROETH;

    if (gasDropoffInWei > unallocatedBalance)
      revert InsufficientGasDropoff(commandIndex);

    // Some tokens might implement distributed supply expansion / contraction.
    // We don't treat those specially so they are not supported and may break.

    // Perform redeem in TB
    tokenBridge.completeTransferWithPayload(vaa);

    address token;
    if (whChainId != tokenOriginChain) {
      token = tokenBridge.wrappedAsset(tokenOriginChain, tokenOriginAddress);
    } else {
      token = fromUniversalAddress(tokenOriginAddress);
    }

    uint8 decimals = IERC20Metadata(token).decimals();
    uint256 tokenAmount = deNormalizeAmount(tbNormalizedTokenAmount, decimals);

    // If an unwrap is desired, unwrap and call recipient with full amount
    uint totalGasTokenAmount = gasDropoffInWei;
    if (address(gasToken) == token && unwrapIntent && gasErc20TokenizationIsExplicit) {
      gasToken.withdraw(tokenAmount);

      totalGasTokenAmount += tokenAmount;
    }
    else {
      // Otherwise, transfer tokens and perform gas dropoff
      SafeERC20.safeTransfer(IERC20Metadata(token), recipient, tokenAmount);
    }
    if (totalGasTokenAmount > 0) {
      // FIXME: we need to put an upper bound on the read bytes to ensure that the contract doesn't run out of gas.
      pay(payable(recipient), totalGasTokenAmount, commandIndex);
    }

    return (gasDropoffInWei, retOffset);
  }}

  /**
   * Returns the relay fee in gas token Mwei.
   */
  function _relayFee(
    bytes calldata data,
    uint offset,
    uint commandIndex
  ) internal view returns(bytes memory, uint256) {
    uint16 chainId;
    uint32 gasDropoff;
    (chainId,    offset) = data.asUint16CdUnchecked(offset);
    (gasDropoff, offset) = data.asUint32CdUnchecked(offset);

    (, uint32 baseFee, uint32 maxGasDropoff, bool paused) =
      _getTargetChainData(chainId);

    if (gasDropoff > maxGasDropoff)
      revert GasDropoffRequestedExceedsMaximum(maxGasDropoff, commandIndex);

    (uint relayFee, uint wormholeFee) = _quoteRelay(chainId, gasDropoff, baseFee);
    uint totalFee = (relayFee + wormholeFee) / _TOTAL_FEE_DIVISOR;
    // We need to round up to ensure that the quoted relay fee is able to cover the remainder.
    if ((relayFee + wormholeFee) % _TOTAL_FEE_DIVISOR > 0)
      ++totalFee;
    if (totalFee > type(uint64).max)
      revert FeeTooLarge(totalFee, commandIndex);

    return (abi.encodePacked(paused, uint64(totalFee)), offset);
  }

  function _baseRelayingConfig(
    bytes calldata data,
    uint offset,
    uint
  ) internal view returns(bytes memory, uint256) {
    uint16 chainId;
    (chainId, offset) = data.asUint16CdUnchecked(offset);
    (bytes32 peer, uint32 baseFee, uint32 maxGasDropoff, bool paused) =
      _getTargetChainData(chainId);

    return (abi.encodePacked(peer, baseFee, maxGasDropoff, paused), offset);
  }

  function _parseRedeem(
    bytes calldata data,
    uint offset,
    uint commandIndex
  ) internal pure returns(
    bytes calldata vaa,
    uint16 peerChain,
    bytes32 peerAddress,
    uint16 tokenOriginChain,
    bytes32 tokenOriginAddress,
    address recipient,
    uint256 tbNormalizedTokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent,
    uint retOffset
  ) { unchecked {
    (vaa, retOffset) = data.sliceUint16PrefixedCdUnchecked(offset);
    bytes calldata vaaPayload;
    (peerChain, vaaPayload) = VaaLib.decodeEmitterChainAndPayloadCdUnchecked(vaa);
    // Note that the token amount is expressed in at most 8 decimals so
    // you need to denormalize this amount before calling transfer functions on the token.

    bytes calldata payload;
    ( tbNormalizedTokenAmount, 
      tokenOriginAddress, 
      tokenOriginChain, 
      peerAddress, 
      payload
    ) = TokenBridgeMessageLib.decodeTransferWithPayloadEssentialsCd(vaaPayload);

    uint payloadOffset = 0;
    uint8 tbrV3Version;
    (tbrV3Version, payloadOffset) = payload.asUint8CdUnchecked(payloadOffset);
    if (tbrV3Version != TBR_V3_MESSAGE_VERSION)
      revert InvalidMsgVersion(tbrV3Version, commandIndex);

    bytes32 universalRecipient;
    (universalRecipient, payloadOffset) = payload.asBytes32CdUnchecked(payloadOffset);
    recipient = fromUniversalAddress(universalRecipient);
    (gasDropoff, payloadOffset) = payload.asUint32CdUnchecked(payloadOffset);
    (unwrapIntent, payloadOffset) = payload.asBoolCdUnchecked(payloadOffset);
    if (payloadOffset != payload.length)
      revert InvalidVaaLength(commandIndex);
  }}

  receive() external payable {
    // NOTE: all values retrieved here need to be immutables to avoid going over the 2300 gas stipend
    if (!gasErc20TokenizationIsExplicit)
      revert GasTokenNotSupported();

    if (msg.sender != address(gasToken))
      revert GasTokenOnlyAcceptedViaWithdrawal();
  }
}