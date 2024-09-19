// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer, IAllowanceTransfer} from "permit2/IPermit2.sol";
import {IPriceOracle} from "price-oracle/IPriceOracle.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";

import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrUser.sol";
import "tbr/assets/TbrUser.sol";
import "tbr/assets/TbrIds.sol";

import {TbrTestBase} from "./utils/TbrTestBase.sol";
import {makeBytes32} from "./utils/utils.sol";

contract UserTest is TbrTestBase {
  using BytesParsing for bytes;
  
  bytes32 SOLANA_CANONICAL_PEER  = makeBytes32("SOLANA_CANONICAL_PEER");
  bytes32 EVM_CANONICAL_PEER     = makeBytes32("EVM_CANONICAL_PEER");
  uint32  MAX_GAS_DROPOFF_AMOUNT = 10000;
  uint32  RELAY_FEE_AMOUNT       = 1000;

  receive() external payable {}

  function executeGovernanceCommand(bytes memory command) internal {
    uint8 commandCount = 1;

    vm.prank(owner);
    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        GOVERNANCE_ID, 
        commandCount, 
        command
      )
    );
  }

  function _setUp1() internal override {
    // Solana chain setup
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_CANONICAL_PEER, SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER)
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_MAX_GAS_DROPOFF, SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT)
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_TX_SIZE_SENSITIVE, SOLANA_CHAIN_ID, bool(false))
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_BASE_FEE, SOLANA_CHAIN_ID, RELAY_FEE_AMOUNT)
    );

    // EVM chain setup
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_CANONICAL_PEER, EVM_CHAIN_ID, EVM_CANONICAL_PEER)
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_MAX_GAS_DROPOFF, EVM_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT)
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_TX_SIZE_SENSITIVE, EVM_CHAIN_ID, bool(true))
    );
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_BASE_FEE, EVM_CHAIN_ID, RELAY_FEE_AMOUNT)
    );
  }

  function testTransferTokenWithRelay(
    uint256 tokenAmount, 
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    vm.assume(tokenAmount > 0 && tokenAmount <= type(uint56).max);
    vm.assume(recipient != bytes32(0));
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);
    vm.assume(unallocatedBalance >= feeQuote);
    deal(address(this), unallocatedBalance);
    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.safeApprove(usdt, address(tbr), tokenAmount);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    bytes memory tbrMessage = abi.encodePacked(
      TBR_V3_MESSAGE_VERSION,
      recipient,
      gasDropoff,
      unwrapIntent
    );
    uint initialFeeRecipientBalance = address(feeRecipient).balance;
    uint initialCallerBalance = address(this).balance;

    uint64 sequence = 1;
    vm.mockCall(
      address(wormhole), 
      abi.encodeWithSelector(wormhole.publishMessage.selector), 
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.approve.selector),
      1
    );

    vm.expectCall(
      address(tokenBridge),
      abi.encodeWithSelector(
        tokenBridge.transferTokensWithPayload.selector,
        address(usdt),
        tokenAmount,
        targetChain,
        SOLANA_CANONICAL_PEER,
        0,
        tbrMessage
      ),
      1
    );

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount,
        address(usdt),
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      unallocatedBalance
    );

    assertEq(address(this).balance, initialCallerBalance - feeQuote);
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote);
  }

  function testTransferTokenWithRelay_FeesInsufficient(    
    uint256 tokenAmount, 
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    vm.assume(tokenAmount > 0);
    vm.assume(recipient != bytes32(0));
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);
    vm.assume(unallocatedBalance < feeQuote);
    deal(address(this), unallocatedBalance);
    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.safeApprove(usdt, address(tbr), tokenAmount);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    uint commandIndex = 0;

    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.expectRevert(
      abi.encodeWithSelector(FeesInsufficient.selector, unallocatedBalance, commandIndex)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount,
        address(usdt),
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      unallocatedBalance
    );
  }

  function testTransferGasTokenWithRelay(
    uint256 tokenAmount, 
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    tokenAmount = bound(tokenAmount, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    vm.assume(recipient != bytes32(0));
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);
    vm.assume(unallocatedBalance >= feeQuote + tokenAmount);
    deal(address(this), unallocatedBalance);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    bytes memory tbrMessage = abi.encodePacked(
      TBR_V3_MESSAGE_VERSION,
      recipient,
      gasDropoff,
      unwrapIntent
    );
    uint initialFeeRecipientBalance = address(feeRecipient).balance;
    uint initialCallerBalance = address(this).balance;

    uint64 sequence = 1;
    vm.mockCall(
      address(wormhole), 
      abi.encodeWithSelector(wormhole.publishMessage.selector), 
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.expectCall(
      address(tokenBridge),
      abi.encodeWithSelector(
        tokenBridge.transferTokensWithPayload.selector,
        address(gasToken),
        tokenAmount,
        targetChain,
        SOLANA_CANONICAL_PEER,
        0,
        tbrMessage
      ),
      1
    );

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_GAS_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount
      ),
      unallocatedBalance
    );

    assertEq(address(this).balance, initialCallerBalance - (feeQuote + tokenAmount));
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote);
  }

  function testTransferGasTokenWithRelay_FeesInsufficient(    
    uint256 tokenAmount, 
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    tokenAmount = bound(tokenAmount, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    vm.assume(recipient != bytes32(0));
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);
    vm.assume(unallocatedBalance < feeQuote + tokenAmount);
    deal(address(this), unallocatedBalance);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.expectRevert(
      abi.encodeWithSelector(FeesInsufficient.selector, unallocatedBalance, commandIndex)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_GAS_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount
      ),
      unallocatedBalance
    );
  }  

  function testParseSharedParams(
    uint16 targetChain,
    bytes32 recipient,
    uint32 gasDropoff,
    uint256 inputAmount
  ) public view {
    uint offset = 0;
    bytes memory data = abi.encodePacked(
      targetChain,
      recipient,
      gasDropoff,
      inputAmount
    );

    uint16 targetChain_;
    bytes32 recipient_;
    uint32 gasDropoff_;
    uint256 inputAmount_;
    uint offset_;
    (targetChain_, recipient_, gasDropoff_, inputAmount_, offset_) = tbrExposer.exposed_parseSharedParams(data, offset);

    // uint16 + bytes32 + uint32 + uint256
    uint expectedOffset = offset + 2 + 32 + 4 + 32; 
    assertEq(targetChain_, targetChain);
    assertEq(recipient_, recipient);
    assertEq(inputAmount_, inputAmount);
    assertEq(gasDropoff_, gasDropoff);
    assertEq(offset_, expectedOffset);
  }

  function testAcquireTokens_ACQUIRE_PREAPPROVED(uint256 tokenAmount) public {
    uint offset = 0;
    bytes memory data = abi.encodePacked(ACQUIRE_PREAPPROVED);

    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.safeApprove(usdt, address(tbrExposer), tokenAmount);

    vm.mockCall(
      address(usdt), 
      abi.encodeWithSelector(usdt.transferFrom.selector), 
      abi.encode()
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.transferFrom.selector)
    );

    uint offset_ = tbrExposer.exposed_acquireTokens(
      data, 
      offset, 
      usdt, 
      tokenAmount
    );

    // uint8
    uint expectedOffset = offset + 1;
    assertEq(offset_, expectedOffset);
  }

  function testAcquireTokens_ACQUIRE_PERMIT(
    uint256 tokenAmount,
    uint256 value, 
    uint256 deadline, 
    bytes32 r, 
    bytes32 s, 
    uint8 v
  ) public {
    uint offset = 0;
    bytes memory data = abi.encodePacked(
      ACQUIRE_PERMIT,
      value,
      deadline,
      r,
      s,
      v
    );

    vm.mockCall(
      address(usdt), 
      abi.encodeWithSelector(IERC20Permit.permit.selector), 
      abi.encode()
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(
        IERC20Permit.permit.selector,
        address(this),
        address(tbrExposer),
        value,
        deadline,
        v,
        r,
        s
      )
    );

    vm.mockCall(
      address(usdt), 
      abi.encodeWithSelector(usdt.transferFrom.selector), 
      abi.encode()
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.transferFrom.selector)
    );

    uint offset_ = tbrExposer.exposed_acquireTokens(
      data, 
      offset, 
      usdt, 
      tokenAmount
    );

    // uint8 + uint256 + uint256 + bytes32 + bytes32 + uint8
    uint expectedOffset = offset + 1 + 32 + 32 + 32 + 32 + 1;
    assertEq(offset_, expectedOffset);
  }

  function testAcquireTokens_ACQUIRE_PERMIT2TRANSFER(
    uint256 tokenAmount,
    uint256 amount,
    uint256 nonce,
    uint256 sigDeadline,
    bytes memory signature
  ) public {
    vm.assume(signature.length == 65);
    uint offset = 0;
    bytes memory data = abi.encodePacked(
      ACQUIRE_PERMIT2TRANSFER,
      amount,
      nonce,
      sigDeadline,
      signature
    );

    bytes4 permitTransferFromSelector = bytes4(
      keccak256("permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)")
    );

    vm.mockCall(
      address(permit2), 
      abi.encodeWithSelector(permitTransferFromSelector), 
      abi.encode()
    );

    vm.expectCall(
      address(permit2),
      abi.encodeWithSelector(
        permitTransferFromSelector,
        ISignatureTransfer.PermitTransferFrom({
          permitted: ISignatureTransfer.TokenPermissions(address(usdt), amount),
          nonce: nonce,
          deadline: sigDeadline
        }),
        ISignatureTransfer.SignatureTransferDetails(address(tbrExposer), tokenAmount),
        address(this),
        signature
      )
    );

    uint offset_ = tbrExposer.exposed_acquireTokens(
      data, 
      offset, 
      usdt, 
      tokenAmount
    );

    // uint8 + uint256 + uint256 + uint256 + bytes
    uint expectedOffset = offset + 1 + 32 + 32 + 32 + 65;
    assertEq(offset_, expectedOffset);
  }

  function testAcquireTokens_ACQUIRE_PERMIT2PERMIT(
    uint256 tokenAmount,
    uint160 amount, 
    uint48 expiration, 
    uint48 nonce, 
    uint256 sigDeadline, 
    bytes memory signature
  ) public {
    vm.assume(signature.length == 65);
    uint offset = 0;
    bytes memory data = abi.encodePacked(
      ACQUIRE_PERMIT2PERMIT,
      amount,
      expiration,
      nonce,
      sigDeadline,
      signature
    );

    bytes4 permitSelector = bytes4(
      keccak256("permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)")
    );

    vm.mockCall(
      address(permit2), 
      abi.encodeWithSelector(permitSelector), 
      abi.encode()
    );

    vm.expectCall(
      address(permit2),
      abi.encodeWithSelector(
        permitSelector,
        address(this),
        IAllowanceTransfer.PermitSingle({
          details: IAllowanceTransfer.PermitDetails(
            address(usdt),
            amount,
            expiration,
            nonce
          ),
          spender: address(tbrExposer),
          sigDeadline: sigDeadline
        }),
        signature
      )
    );

    bytes4 transferFromSelector = bytes4(
      keccak256("transferFrom(address,address,uint160,address)")
    );

    vm.mockCall(
      address(permit2), 
      abi.encodeWithSelector(transferFromSelector), 
      abi.encode()
    );

    vm.expectCall(
      address(permit2),
      abi.encodeWithSelector(
        transferFromSelector,
        address(this),
        address(tbrExposer), 
        uint160(tokenAmount), 
        address(usdt)
      )
    );

    uint offset_ = tbrExposer.exposed_acquireTokens(
      data, 
      offset, 
      usdt, 
      tokenAmount
    );

    // uint8 + uint160 + uint48 + uint48 + uint256 + bytes
    uint expectedOffset = offset + 1 + 20 + 6 + 6 + 32 + 65;
    assertEq(offset_, expectedOffset);
  }

  function testAcquireTokens_InvalidAcquireMode(
    uint256 tokenAmount,
    uint8 acquireMode
  ) public {
    vm.assume(acquireMode != ACQUIRE_PREAPPROVED);
    vm.assume(acquireMode != ACQUIRE_PERMIT);
    vm.assume(acquireMode != ACQUIRE_PERMIT2TRANSFER);
    vm.assume(acquireMode != ACQUIRE_PERMIT2PERMIT);

    uint offset = 0;
    bytes memory data = abi.encodePacked(acquireMode );

    vm.expectRevert(
      abi.encodeWithSelector(
        InvalidAcquireMode.selector, acquireMode
      )
    );

    tbrExposer.exposed_acquireTokens(
      data, 
      offset, 
      usdt, 
      tokenAmount
    );
  }

  function testGetAndCheckTransferParams(
    bytes32 recipient, 
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    vm.assume(recipient != bytes32(0));
    vm.assume(tokenAmount > 0);
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    // Mock the quote returned by the oracle
    uint feeQuote = 100;
    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    (bytes32 peer, uint256 fee) = tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );

    assertEq(peer, SOLANA_CANONICAL_PEER);
    assertEq(fee, feeQuote);
  }

  function testGetAndCheckTransferParams_TargetChainNotSupported(
    bytes32 recipient, 
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    vm.assume(recipient != bytes32(0));
    vm.assume(tokenAmount > 0);
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(
      abi.encodeWithSelector(TargetChainIsNotSupported.selector, targetChain)
    );

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );
  }

  function testGetAndCheckTransferParams_TransfersToChainArePaused(   
    bytes32 recipient, 
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    vm.assume(recipient != bytes32(0));
    vm.assume(tokenAmount > 0);
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);
    tbrExposer.exposedSetPause(SOLANA_CHAIN_ID, true);

    vm.expectRevert(
      abi.encodeWithSelector(TransfersToChainArePaused.selector, targetChain)
    );

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );
  }

  function testGetAndCheckTransferParams_GasDropoffExceedsMaximum(
    bytes32 recipient, 
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    vm.assume(recipient != bytes32(0));
    vm.assume(tokenAmount > 0);
    vm.assume(gasDropoff > MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(
      abi.encodeWithSelector(
        GasDropoffRequestedExceedsMaximum.selector, MAX_GAS_DROPOFF_AMOUNT, commandIndex
      )
    );

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );
  }

  function testGetAndCheckTransferParams_InvalidTokenRecipient(
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    vm.assume(tokenAmount > 0);
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;
    bytes32 recipient = bytes32(0);

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(InvalidTokenRecipient.selector);

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );
  }

  function testGetAndCheckTransferParams_InvalidTokenAmount(
    bytes32 recipient, 
    uint32 gasDropoff
  ) public {
    vm.assume(recipient != bytes32(0));
    vm.assume(gasDropoff < MAX_GAS_DROPOFF_AMOUNT);

    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;
    uint256 tokenAmount = 0;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(InvalidTokenAmount.selector);

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain, 
      recipient, 
      tokenAmount, 
      gasDropoff, 
      commandIndex
    );
  }

  function testRelayFee(uint32 gasDropoff) public {
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    uint256 feeQuote = 1e6;
    uint64 expectedFee = uint64(feeQuote) / 1e6;

    // Mock the quote returned by the oracle
    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    bytes memory response = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff
      )
    );

    uint offset;
    bool isPaused;
    uint64 fee;
    (isPaused, offset) = response.asBoolUnchecked(offset);
    (fee, offset) = response.asUint64Unchecked(offset);
    assertEq(isPaused, false);
    assertEq(fee, expectedFee);
  }

  function testRelayFee_GasDropoffExceedsMaximum() public {
    uint32 gasDropoff = MAX_GAS_DROPOFF_AMOUNT + 1;
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(
        GasDropoffRequestedExceedsMaximum.selector, 
        MAX_GAS_DROPOFF_AMOUNT, 
        commandIndex
      )
    );

    invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff
      )
    );
  }

  function testBaseRelayingConfig() public {
    bytes memory response = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        BASE_RELAYING_CONFIG_ID,
        SOLANA_CHAIN_ID
      )
    );

    uint offset;
    bytes32 peer;
    bool chainIsPaused;
    bool txSizeSensitive;
    uint32 maxGasDropoff;
    uint32 baseFee;
    (peer, offset) = response.asBytes32Unchecked(offset);
    (baseFee, offset) = response.asUint32Unchecked(offset);
    (maxGasDropoff, offset) = response.asUint32Unchecked(offset);
    (chainIsPaused, offset) = response.asBoolUnchecked(offset);
    (txSizeSensitive, offset) = response.asBoolUnchecked(offset);

    assertEq(peer, SOLANA_CANONICAL_PEER);
    assertEq(baseFee, RELAY_FEE_AMOUNT);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(chainIsPaused, false);
    assertEq(txSizeSensitive, false);

    response = invokeTbr(
      abi.encodePacked(
        tbr.get1959.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        BASE_RELAYING_CONFIG_ID,
        EVM_CHAIN_ID
      )
    );

    offset = 0;
    (peer, offset) = response.asBytes32Unchecked(offset);
    (baseFee, offset) = response.asUint32Unchecked(offset);
    (maxGasDropoff, offset) = response.asUint32Unchecked(offset);
    (chainIsPaused, offset) = response.asBoolUnchecked(offset);
    (txSizeSensitive, offset) = response.asBoolUnchecked(offset);

    assertEq(peer, EVM_CANONICAL_PEER);
    assertEq(baseFee, RELAY_FEE_AMOUNT);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(chainIsPaused, false);
    assertEq(txSizeSensitive, true);
  }
}