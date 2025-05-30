// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { ISignatureTransfer, IAllowanceTransfer } from "permit2/IPermit2.sol";
import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrUser.sol";
import "tbr/assets/TbrIds.sol";
import { ITokenBridge } from "wormhole-sdk/interfaces/ITokenBridge.sol";
import { IERC20 } from "wormhole-sdk/interfaces/token/IERC20.sol";
import { IWETH } from "wormhole-sdk/interfaces/token/IWETH.sol";
import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { SafeERC20 } from "wormhole-sdk/libraries/SafeERC20.sol";
import { IPriceOracle } from "price-oracle/IPriceOracle.sol";
import { toUniversalAddress } from "wormhole-sdk/Utils.sol";
import { CHAIN_ID_ETHEREUM } from "wormhole-sdk/constants/Chains.sol";

import { TbrTestBase, InvokeTbr } from "./utils/TbrTestBase.sol";
import { Tbr } from "tbr/Tbr.sol";
import { craftTbrV3Vaa, deNormalizeAmount, discardInsignificantBits, ERC20Mock, makeBytes32 } from "./utils/utils.sol";

// USDC in Ethereum mainnet
address constant usdcAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

contract UserTest is TbrTestBase {
  using BytesParsing for bytes;
  using InvokeTbr for Tbr;

  bytes32 SOLANA_CANONICAL_PEER  = makeBytes32("SOLANA_CANONICAL_PEER");
  bytes32 EVM_CANONICAL_PEER     = makeBytes32("EVM_CANONICAL_PEER");
  bytes32 EVM_L2_CANONICAL_PEER  = makeBytes32("EVM_L2_CANONICAL_PEER");
  uint32  MAX_GAS_DROPOFF_AMOUNT = 10000;
  uint32  RELAY_FEE_AMOUNT       = 1000;

  error TestErrorForRecipient(uint256 id);

  receive() external payable {}

  function executeConfigCommand(bytes memory command) internal {
    uint8 commandCount = 1;

    vm.prank(owner);
    tbr.invokeTbr(
      abi.encodePacked(
        CONFIG_ID,
        commandCount,
        command
      )
    );
  }

  function _setUp1() internal override {
    // Solana chain setup
    executeConfigCommand(
      abi.encodePacked(UPDATE_CANONICAL_PEER_ID, SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_MAX_GAS_DROPOFF_ID, SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_BASE_FEE_ID, SOLANA_CHAIN_ID, RELAY_FEE_AMOUNT)
    );

    // EVM chain setup
    executeConfigCommand(
      abi.encodePacked(UPDATE_CANONICAL_PEER_ID, EVM_CHAIN_ID, EVM_CANONICAL_PEER)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_MAX_GAS_DROPOFF_ID, EVM_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_BASE_FEE_ID, EVM_CHAIN_ID, RELAY_FEE_AMOUNT)
    );

    // EVM L2 chain setup
    executeConfigCommand(
      abi.encodePacked(UPDATE_CANONICAL_PEER_ID, EVM_L2_CHAIN_ID, EVM_L2_CANONICAL_PEER)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_MAX_GAS_DROPOFF_ID, EVM_L2_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT)
    );
    executeConfigCommand(
      abi.encodePacked(UPDATE_BASE_FEE_ID, EVM_L2_CHAIN_ID, RELAY_FEE_AMOUNT)
    );
  }

  function testGasTokenAllowance() public view {
    bytes memory result = tbr.invokeStaticTbr(
      abi.encodePacked(
        GAS_TOKEN_ALLOWANCE_TOKEN_BRIDGE_ID
      )
    );

    (uint256 allowance, ) = result.asUint256MemUnchecked(0);
    assertEq(allowance, 0);
    assertEq(result.length, 32);
  }

  function testTransferTokenWithRelaySimple(
    uint256 tokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance,
    uint256 wormholeFee
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    wormholeFee = bound(wormholeFee, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    tokenAmount = bound(tokenAmount, 1, type(uint56).max);
    vm.assume(recipient != bytes32(0));
    gasDropoff = uint32(bound(gasDropoff, 0, MAX_GAS_DROPOFF_AMOUNT));
    unallocatedBalance = bound(unallocatedBalance, feeQuote + wormholeFee, (feeQuote + wormholeFee) * 10);
    deal(address(this), unallocatedBalance);
    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.forceApprove(usdt, address(tbr), tokenAmount);

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
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(wormholeFee))
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.approve.selector),
      1
    );

    vm.expectCall(
      address(tokenBridge),
      wormholeFee,
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

    vm.expectEmit(address(usdt));
    emit IERC20.Approval(address(tbr), address(tokenBridge), type(uint256).max);

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    tbr.invokeTbr(
      abi.encodePacked(
        APPROVE_TOKEN_ID,
        usdt,
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount,
        usdt,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      unallocatedBalance
    );

    assertEq(address(this).balance, initialCallerBalance - feeQuote - wormholeFee);
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote);
  }

  function testTransferTokenWithRelay_InsufficientAllowance(
    uint256 tokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance,
    uint256 wormholeFee
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    wormholeFee = bound(wormholeFee, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    tokenAmount = bound(tokenAmount, 1, type(uint56).max);
    vm.assume(recipient != bytes32(0));
    gasDropoff = uint32(bound(gasDropoff, 0, MAX_GAS_DROPOFF_AMOUNT));
    unallocatedBalance = bound(unallocatedBalance, feeQuote + wormholeFee, (feeQuote + wormholeFee) * 10);
    deal(address(this), unallocatedBalance);
    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.forceApprove(usdt, address(tbr), tokenAmount);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    bytes memory tbrMessage = abi.encodePacked(
      TBR_V3_MESSAGE_VERSION,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    uint64 sequence = 1;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(wormholeFee))
    );

    vm.expectCall(
      address(tokenBridge),
      wormholeFee,
      abi.encodeWithSelector(
        tokenBridge.transferTokensWithPayload.selector,
        usdt,
        tokenAmount,
        targetChain,
        SOLANA_CANONICAL_PEER,
        0,
        tbrMessage
      ),
      1
    );

    vm.expectRevert("SafeERC20: low-level call failed");
    tbr.invokeTbr(
      abi.encodePacked(
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount,
        usdt,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      unallocatedBalance
    );
  }

  function testTransferTokenWithRelayDoubleTransfer(
    uint256 firstTokenAmount,
    uint256 secondTokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance,
    uint256 wormholeFee,
    uint8 decimals
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    wormholeFee = bound(wormholeFee, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    decimals = uint8(bound(decimals, 0, 26));
    uint8 minDecimals = decimals > 8 ? decimals - 8 : 0;
    firstTokenAmount = bound(firstTokenAmount, 10 ** minDecimals, 2 ** 62);
    secondTokenAmount = bound(secondTokenAmount, 10 ** minDecimals, 2 ** 62);
    vm.assume(recipient != bytes32(0));
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    unallocatedBalance = bound(unallocatedBalance, (feeQuote + wormholeFee) * 2, (feeQuote + wormholeFee) * 10);
    deal(address(this), unallocatedBalance);


    ERC20Mock token = new ERC20Mock("test token", "TST", decimals);
    deal(address(token), address(this), firstTokenAmount + secondTokenAmount);
    SafeERC20.forceApprove(IERC20Metadata(address(token)), address(tbr), firstTokenAmount + secondTokenAmount);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    uint initialFeeRecipientBalance = address(feeRecipient).balance;
    uint initialCallerBalance = address(this).balance;

    // First transfer

    uint64 sequence = 1;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(wormholeFee))
    );

    vm.expectEmit(address(token));
    emit IERC20.Approval(address(tbr), address(tokenBridge), type(uint256).max);

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    tbr.invokeTbr(
      abi.encodePacked(
        APPROVE_TOKEN_ID,
        token,
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        firstTokenAmount,
        token,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      feeQuote + wormholeFee
    );

    // Second transfer

    sequence = 2;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(wormholeFee))
    );

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    tbr.invokeTbr(
      abi.encodePacked(
        TRANSFER_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        secondTokenAmount,
        token,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      feeQuote + wormholeFee
    );

    assertEq(address(this).balance, initialCallerBalance - (feeQuote + wormholeFee) * 2);
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote * 2);
  }

  function testTransferTokenWithRelay_FeesInsufficient(
    uint256 tokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 wormholeFee,
    uint256 unallocatedBalance
  ) public {
    // use a bound max value in order to prevent overflow
    uint boundMaxValue = 1e12;
    wormholeFee = bound(wormholeFee, 1, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    tokenAmount = bound(tokenAmount, 1, type(uint256).max);
    vm.assume(recipient != bytes32(0));
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    unallocatedBalance = bound(unallocatedBalance, 0, feeQuote + wormholeFee - 1);
    deal(address(this), unallocatedBalance);
    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.forceApprove(usdt, address(tbr), tokenAmount);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    uint commandIndex = 0;

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(wormholeFee))
    );

    vm.expectRevert(
      abi.encodeWithSelector(FeesInsufficient.selector, unallocatedBalance, commandIndex)
    );

    tbr.invokeTbr(
      abi.encodePacked(
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

  function testTransferGasTokenWithRelaySimple(
    uint256 tokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    // use a bound max value in order to prevent overflow
    uint8 decimals = IERC20Metadata(address(gasToken)).decimals();
    uint8 minDecimals = decimals <= 8 ? 0 : decimals - 8;
    uint boundMaxValue = 10 ** (minDecimals + 6);
    tokenAmount = bound(tokenAmount, 10 ** minDecimals, boundMaxValue);
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    unallocatedBalance = bound(unallocatedBalance, feeQuote + tokenAmount, (feeQuote + tokenAmount) * 5);
    vm.assume(recipient != bytes32(0));
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
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    uint256 finalTokenAmount = discardInsignificantBits(tokenAmount, IERC20Metadata(address(gasToken)).decimals());
    vm.expectCall(
      address(tokenBridge),
      abi.encodeWithSelector(
        tokenBridge.transferTokensWithPayload.selector,
        address(gasToken),
        finalTokenAmount,
        targetChain,
        SOLANA_CANONICAL_PEER,
        0,
        tbrMessage
      ),
      1
    );

    vm.expectEmit(address(gasToken));
    emit IERC20.Approval(address(tbr), address(tokenBridge), type(uint256).max);

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    tbr.invokeTbr(
      abi.encodePacked(
        APPROVE_TOKEN_ID,
        gasToken,
        TRANSFER_GAS_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount
      ),
      unallocatedBalance
    );


    uint256 dust = tokenAmount - finalTokenAmount;
    assertEq(address(this).balance, initialCallerBalance + dust - feeQuote - tokenAmount, "balance of caller is incorrect");
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote, "balance of fee recipient is incorrect");
  }

  function testTransferGasTokenWithRelay_InsufficientAllowance(
    uint256 tokenAmount,
    uint32 gasDropoff,
    bytes32 recipient,
    uint256 feeQuote,
    uint256 unallocatedBalance
  ) public {
    // use a bound max value in order to prevent overflow
    uint8 decimals = IERC20Metadata(address(gasToken)).decimals();
    uint8 minDecimals = decimals <= 8 ? 0 : decimals - 8;
    uint boundMaxValue = 10 ** (minDecimals + 6);
    tokenAmount = bound(tokenAmount, 10 ** minDecimals, boundMaxValue);
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    unallocatedBalance = bound(unallocatedBalance, feeQuote + tokenAmount, (feeQuote + tokenAmount) * 5);
    vm.assume(recipient != bytes32(0));
    deal(address(this), unallocatedBalance);

    uint16 targetChain = SOLANA_CHAIN_ID;
    bool unwrapIntent = false;
    bytes memory tbrMessage = abi.encodePacked(
      TBR_V3_MESSAGE_VERSION,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    uint64 sequence = 1;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(wormholeCore.publishMessage.selector),
      abi.encode(sequence)
    );

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    uint256 finalTokenAmount = discardInsignificantBits(tokenAmount, IERC20Metadata(address(gasToken)).decimals());
    vm.expectCall(
      address(tokenBridge),
      abi.encodeWithSelector(
        tokenBridge.transferTokensWithPayload.selector,
        address(gasToken),
        finalTokenAmount,
        targetChain,
        SOLANA_CANONICAL_PEER,
        0,
        tbrMessage
      ),
      1
    );

    vm.expectRevert("SafeERC20: low-level call failed");
    tbr.invokeTbr(
      abi.encodePacked(
        TRANSFER_GAS_TOKEN_WITH_RELAY_ID,
        targetChain,
        recipient,
        gasDropoff,
        tokenAmount
      ),
      unallocatedBalance
    );
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
    tokenAmount = bound(tokenAmount, 1e10, boundMaxValue);
    feeQuote = bound(feeQuote, 1, boundMaxValue);
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    uint256 upperBoundForBalance = feeQuote + discardInsignificantBits(tokenAmount, IERC20Metadata(address(gasToken)).decimals()) - 1;
    unallocatedBalance = bound(unallocatedBalance, 1, upperBoundForBalance);
    vm.assume(recipient != bytes32(0));
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

    tbr.invokeTbr(
      abi.encodePacked(
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
    SafeERC20.forceApprove(usdt, address(tbrExposer), tokenAmount);

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

    uint feeQuote = 100;
    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    (bytes32 peer, uint256 finalTokenAmount, uint256 fee, uint256 wormholeFee) = tbrExposer.exposed_getAndCheckTransferParams(
      targetChain,
      recipient,
      usdt,
      tokenAmount,
      gasDropoff,
      commandIndex
    );

    uint256 expectedTokenAmount = discardInsignificantBits(tokenAmount, usdt.decimals());

    assertEq(peer, SOLANA_CANONICAL_PEER);
    assertEq(fee, feeQuote);
    assertEq(wormholeFee, fakeWormholeFee);
    assertEq(finalTokenAmount, expectedTokenAmount);
  }

  function testGetAndCheckTransferParams_TargetChainNotSupported(
    bytes32 recipient,
    uint256 tokenAmount,
    uint32 gasDropoff
  ) public {
    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(TargetChainIsNotSupported.selector, targetChain)
    );

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain,
      recipient,
      usdt,
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
    uint16 targetChain = SOLANA_CHAIN_ID;
    uint commandIndex = 0;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetPause(SOLANA_CHAIN_ID, true);

    vm.expectRevert(
      abi.encodeWithSelector(TransfersToChainArePaused.selector, targetChain)
    );

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain,
      recipient,
      usdt,
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
      usdt,
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

    uint commandIndex = 0;
    bytes32 recipient = bytes32(0);
    uint16 targetChain = SOLANA_CHAIN_ID;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(InvalidTokenRecipient.selector);

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain,
      recipient,
      usdt,
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

    uint commandIndex = 0;
    uint256 tokenAmount = 0;
    uint16 targetChain = SOLANA_CHAIN_ID;

    tbrExposer.exposedSetCanonicalPeer(SOLANA_CHAIN_ID, SOLANA_CANONICAL_PEER);
    tbrExposer.exposedSetMaxGasDropoff(SOLANA_CHAIN_ID, MAX_GAS_DROPOFF_AMOUNT);

    vm.expectRevert(InvalidTokenAmount.selector);

    tbrExposer.exposed_getAndCheckTransferParams(
      targetChain,
      recipient,
      usdt,
      tokenAmount,
      gasDropoff,
      commandIndex
    );
  }

  function testRelayFee(uint32 gasDropoff) public {
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    uint256 feeQuote = 1e6;
    uint64 expectedFee = uint64(feeQuote) / 1e6;

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    bytes memory response = tbr.invokeStaticTbr(
      abi.encodePacked(
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff
      )
    );

    uint offset;
    bool isPaused;
    uint64 fee;
    (isPaused, offset) = response.asBoolMemUnchecked(offset);
    (fee, offset) = response.asUint64MemUnchecked(offset);
    assertEq(isPaused, false);
    assertEq(fee, expectedFee);
  }

  function testSdkLikeFeeQuery() public {
    uint32 gasDropoff = 0;
    uint256 feeQuote = 1e6;
    uint64 expectedFee = uint64(feeQuote) / 1e6;

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    bytes memory response = tbr.invokeStaticTbr(
      abi.encodePacked(
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff,
        ALLOWANCE_TOKEN_BRIDGE_ID,
        usdcAddress
      )
    );

    uint offset;
    bool isPaused;
    uint64 fee;
    uint256 allowance;
    (isPaused, offset) = response.asBoolMemUnchecked(offset);
    (fee, offset) = response.asUint64MemUnchecked(offset);
    (allowance, offset) = response.asUint256MemUnchecked(offset);
    assertEq(isPaused, false);
    assertEq(fee, expectedFee);
    assertEq(allowance, 0);
  }

  function testRelayFee_RemainderBelowMwei(uint32 gasDropoff) public {
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    uint256 feeQuote = 1e6;
    uint64 expectedFee = uint64(feeQuote) / 1e6 + 1;

    vm.mockCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    // Less than 1kWei
    uint fakeWormholeFee = 100;
    vm.mockCall(
      address(wormholeCore),
      abi.encodeWithSelector(
        wormholeCore.messageFee.selector
      ),
      abi.encode(uint256(fakeWormholeFee))
    );

    bytes memory response = tbr.invokeStaticTbr(
      abi.encodePacked(
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff
      )
    );

    uint offset;
    bool isPaused;
    uint64 fee;
    (isPaused, offset) = response.asBoolMemUnchecked(offset);
    (fee, offset) = response.asUint64MemUnchecked(offset);
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
    tbr.invokeStaticTbr(
      abi.encodePacked(
        RELAY_FEE_ID,
        SOLANA_CHAIN_ID,
        gasDropoff
      )
    );
  }

  function testBaseRelayingConfig() public view {
    bytes memory response = tbr.invokeStaticTbr(
      abi.encodePacked(
        BASE_RELAYING_CONFIG_ID,
        SOLANA_CHAIN_ID
      )
    );

    uint offset;
    bytes32 peer;
    bool chainIsPaused;
    uint32 maxGasDropoff;
    uint32 baseFee;
    (peer, offset) = response.asBytes32MemUnchecked(offset);
    (baseFee, offset) = response.asUint32MemUnchecked(offset);
    (maxGasDropoff, offset) = response.asUint32MemUnchecked(offset);
    (chainIsPaused, offset) = response.asBoolMemUnchecked(offset);

    assertEq(peer, SOLANA_CANONICAL_PEER);
    assertEq(baseFee, RELAY_FEE_AMOUNT);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(chainIsPaused, false);
    assertEq(response.length, offset);

    response = tbr.invokeStaticTbr(
      abi.encodePacked(
        BASE_RELAYING_CONFIG_ID,
        EVM_CHAIN_ID
      )
    );

    offset = 0;
    (peer, offset) = response.asBytes32MemUnchecked(offset);
    (baseFee, offset) = response.asUint32MemUnchecked(offset);
    (maxGasDropoff, offset) = response.asUint32MemUnchecked(offset);
    (chainIsPaused, offset) = response.asBoolMemUnchecked(offset);

    assertEq(peer, EVM_CANONICAL_PEER);
    assertEq(baseFee, RELAY_FEE_AMOUNT);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(chainIsPaused, false);
    assertEq(response.length, offset);
  }

  function testCompleteTransfer_gasToken(
    uint256 amount,
    uint32 gasDropoff,
    uint256 unallocatedBalance,
    uint8 transferReturn
  ) public {
    gasDropoff = uint32(bound(gasDropoff, 0, MAX_GAS_DROPOFF_AMOUNT));
    uint256 gasDropoffInWei = gasDropoff * WEI_PER_MICROETH;
    amount = bound(amount, 1, 1e10); // avoid overflow
    uint256 unallocatedBalanceMinimum = gasDropoffInWei + transferReturn + amount;
    unallocatedBalance = bound(unallocatedBalance, unallocatedBalanceMinimum, unallocatedBalanceMinimum * 10);

    bytes32 originTokenBridge = toUniversalAddress(EVM_L2_TOKEN_BRIDGE_ADDRESS);
    uint16 peerChain = EVM_L2_CHAIN_ID;
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    bytes32 targetTBR = toUniversalAddress(address(tbr));
    uint16 recipientChain = tokenBridge.chainId();
    address recipient = makeAddr("recipient");
    bool unwrapIntent = true;

    uint16 tokenChain = CHAIN_ID_ETHEREUM;
    bytes32 tokenAddress = toUniversalAddress(WETH_CANONICAL_ADDRESS);

    deal(address(this), unallocatedBalance);

    (bytes memory encodedVaa, uint64 sequence) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    address tokenToTransfer = address(gasToken);

    uint decimals = IERC20Metadata(tokenToTransfer).decimals();
    uint256 denormalizedAmount = deNormalizeAmount(amount, uint8(decimals));
    uint initialRecipientGasTokenBalance = recipient.balance;
    uint initialCallerBalance = address(this).balance;

    vm.expectEmit(address(tokenBridge));
    emit ITokenBridge.TransferRedeemed(peerChain, originTokenBridge, sequence);

    vm.expectEmit(address(tokenToTransfer));
    emit IERC20.Transfer(address(tokenBridge), address(tbr), denormalizedAmount);

    vm.expectEmit(address(tokenToTransfer));
    emit IWETH.Withdrawal(address(tbr), denormalizedAmount);

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      ),
      unallocatedBalance
    );

    uint finalCallerBalance = address(this).balance;
    uint finalRecipientGasTokenBalance = recipient.balance;
    assertEq(finalRecipientGasTokenBalance, initialRecipientGasTokenBalance + gasDropoffInWei + denormalizedAmount);
    assertEq(finalCallerBalance, initialCallerBalance - gasDropoffInWei);
  }

  function testCompleteTransfer_nonGasToken(
    uint256 amount,
    uint32 gasDropoff,
    uint256 unallocatedBalance,
    uint8 transferReturn
  ) public {
    gasDropoff = uint32(bound(gasDropoff, 0, MAX_GAS_DROPOFF_AMOUNT));
    uint256 gasDropoffInWei = gasDropoff * WEI_PER_MICROETH;
    amount = bound(amount, 1, 1e10); // avoid overflow
    uint256 unallocatedBalanceMinimum = gasDropoffInWei + transferReturn;
    unallocatedBalance = bound(unallocatedBalance, unallocatedBalanceMinimum, unallocatedBalanceMinimum * 10);

    bytes32 originTokenBridge = toUniversalAddress(EVM_L2_TOKEN_BRIDGE_ADDRESS);
    uint16 peerChain = EVM_L2_CHAIN_ID;
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    bytes32 targetTBR = toUniversalAddress(address(tbr));
    uint16 recipientChain = tokenBridge.chainId();
    address recipient = makeAddr("recipient");
    bool unwrapIntent = true;

    uint16 tokenChain = EVM_L2_CHAIN_ID;
    bytes32 tokenAddress = toUniversalAddress(EVM_L2_TOKEN_WETH_TOKEN);

    deal(address(this), unallocatedBalance);

    (bytes memory encodedVaa, uint64 sequence) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    address tokenToTransfer = tokenBridge.wrappedAsset(tokenChain, tokenAddress);

    uint decimals = IERC20Metadata(tokenToTransfer).decimals();
    uint256 denormalizedAmount = deNormalizeAmount(amount, uint8(decimals));
    uint initialRecipientGasTokenBalance = recipient.balance;
    uint initialCallerBalance = address(this).balance;
    uint initialRecipientTransferredTokenBalance = IERC20(tokenToTransfer).balanceOf(recipient);

    vm.expectEmit(address(tokenBridge));
    emit ITokenBridge.TransferRedeemed(peerChain, originTokenBridge, sequence);

    vm.expectEmit(tokenToTransfer);
    emit IERC20.Transfer(address(0), address(tbr), denormalizedAmount);

    vm.expectEmit(tokenToTransfer);
    emit IERC20.Transfer(address(tbr), recipient, denormalizedAmount);

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      ),
      unallocatedBalance
    );

    uint finalRecipientTransferredTokenBalance = IERC20(tokenToTransfer).balanceOf(recipient);
    uint finalCallerBalance = address(this).balance;
    uint finalRecipientGasTokenBalance = recipient.balance;

    assertEq(finalRecipientGasTokenBalance, initialRecipientGasTokenBalance + gasDropoffInWei);
    assertEq(finalRecipientTransferredTokenBalance, initialRecipientTransferredTokenBalance + denormalizedAmount);
    assertEq(finalCallerBalance, initialCallerBalance - gasDropoffInWei);
  }

  function testCompleteTransfer_UnrecognizedPeer(
    uint16 peerChain,
    uint256 amount,
    uint32 gasDropoff,
    bool unwrapIntent,
    address recipient,
    bytes32 originTokenBridge,
    bytes32 targetTBR,
    uint16 tokenChain,
    uint16 recipientChain,
    bytes32 tokenAddress
  ) public {
    bytes32 originTBR = makeBytes32("FakePeer");
    uint commandIndex = 0;

    (bytes memory encodedVaa,) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    vm.expectRevert(
      abi.encodeWithSelector(
        UnrecognizedPeer.selector,
        peerChain,
        originTBR,
        commandIndex
      )
    );

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      )
    );
  }

  function testCompleteTransfer_FamiliarPeerFromUnexpectedChain(
    uint16 peerChain,
    uint256 amount,
    uint32 gasDropoff,
    bool unwrapIntent,
    address recipient,
    bytes32 originTokenBridge,
    bytes32 targetTBR,
    uint16 tokenChain,
    uint16 recipientChain,
    bytes32 tokenAddress
  ) public {
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    uint commandIndex = 0;

    vm.assume(peerChain != EVM_L2_CHAIN_ID);

    (bytes memory encodedVaa,) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    vm.expectRevert(
      abi.encodeWithSelector(
        UnrecognizedPeer.selector,
        peerChain,
        originTBR,
        commandIndex
      )
    );

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      )
    );
  }

  function testCompleteTransfer_InsufficientGasDropoff(
    uint256 amount,
    uint32 gasDropoff,
    bool unwrapIntent,
    address recipient,
    bytes32 originTokenBridge,
    bytes32 targetTBR,
    uint16 tokenChain,
    uint16 recipientChain,
    bytes32 tokenAddress,
    uint256 unallocatedBalance
  ) public {
    vm.assume(address(this) != recipient);
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    uint256 gasDropoffInWei = gasDropoff * WEI_PER_MICROETH;
    unallocatedBalance = bound(unallocatedBalance, 0, gasDropoffInWei - 1);
    deal(address(this), unallocatedBalance);

    uint16 peerChain = EVM_L2_CHAIN_ID;
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    uint commandIndex = 0;

    (bytes memory encodedVaa,) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    vm.expectRevert(
      abi.encodeWithSelector(
        InsufficientGasDropoff.selector,
        commandIndex
      )
    );

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      ),
      unallocatedBalance
    );
  }

function testCompleteTransfer_GasDropoffNotNecessaryInRecipientCall(
    uint256 amount,
    uint32 gasDropoff
  ) public {
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    amount = bound(amount, 1, 1e10); // avoid overflow

    uint16 peerChain = EVM_L2_CHAIN_ID;
    bytes32 originTokenBridge = toUniversalAddress(EVM_L2_TOKEN_BRIDGE_ADDRESS);
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    bytes32 targetTBR = toUniversalAddress(address(tbr));
    uint16 tokenChain = EVM_L2_CHAIN_ID;
    uint16 recipientChain = tokenBridge.chainId();
    bytes32 tokenAddress = toUniversalAddress(EVM_L2_TOKEN_WETH_TOKEN);
    address recipient = makeAddr("recipient");
    bool unwrapIntent = true;

    (bytes memory encodedVaa, uint64 sequence) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    address tokenToTransfer = tokenBridge.wrappedAsset(tokenChain, tokenAddress);
    uint decimals = IERC20Metadata(tokenToTransfer).decimals();
    uint256 denormalizedAmount = deNormalizeAmount(amount, uint8(decimals));
    uint initialRecipientGasTokenBalance = recipient.balance;
    uint initialRecipientTransferredTokenBalance = IERC20(tokenToTransfer).balanceOf(recipient);

    vm.prank(recipient);

    vm.expectEmit(address(tokenBridge));
    emit ITokenBridge.TransferRedeemed(peerChain, originTokenBridge, sequence);

    vm.expectEmit(tokenToTransfer);
    emit IERC20.Transfer(address(0), address(tbr), denormalizedAmount);

    vm.expectEmit(tokenToTransfer);
    emit IERC20.Transfer(address(tbr), recipient, denormalizedAmount);

    tbr.invokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      ),
      0
    );

    uint finalRecipientTransferredTokenBalance = IERC20(tokenToTransfer).balanceOf(recipient);

    assertEq(recipient.balance, initialRecipientGasTokenBalance);
    assertEq(finalRecipientTransferredTokenBalance, initialRecipientTransferredTokenBalance + denormalizedAmount);
  }

  function testCompleteTransfer_wrapNestedError(
    uint256 amount,
    uint32 gasDropoff,
    uint256 unallocatedBalance,
    uint8 transferReturn,
    uint256 errorId
  ) public {
    gasDropoff = uint32(bound(gasDropoff, 0, MAX_GAS_DROPOFF_AMOUNT));
    uint256 gasDropoffInWei = gasDropoff * WEI_PER_MICROETH;
    amount = bound(amount, 1, 1e10); // avoid overflow
    uint256 unallocatedBalanceMinimum = gasDropoffInWei + transferReturn + amount;
    unallocatedBalance = bound(unallocatedBalance, unallocatedBalanceMinimum, unallocatedBalanceMinimum * 10);

    bytes32 originTokenBridge = toUniversalAddress(EVM_L2_TOKEN_BRIDGE_ADDRESS);
    uint16 peerChain = EVM_L2_CHAIN_ID;
    bytes32 originTBR = EVM_L2_CANONICAL_PEER;
    bytes32 targetTBR = toUniversalAddress(address(tbr));
    uint16 recipientChain = tokenBridge.chainId();
    address recipient = makeAddr("recipient");
    bool unwrapIntent = true;

    uint16 tokenChain = CHAIN_ID_ETHEREUM;
    bytes32 tokenAddress = toUniversalAddress(WETH_CANONICAL_ADDRESS);

    deal(address(this), unallocatedBalance);

    (bytes memory encodedVaa, uint64 sequence) = craftTbrV3Vaa(
      wormholeCore,
      originTokenBridge,
      originTBR,
      targetTBR,
      peerChain,
      tokenChain,
      tokenAddress,
      amount,
      recipientChain,
      recipient,
      gasDropoff,
      unwrapIntent
    );

    address tokenToTransfer = address(gasToken);

    uint decimals = IERC20Metadata(tokenToTransfer).decimals();
    uint256 denormalizedAmount = deNormalizeAmount(amount, uint8(decimals));

    vm.expectEmit(address(tokenBridge));
    emit ITokenBridge.TransferRedeemed(peerChain, originTokenBridge, sequence);

    vm.expectEmit(address(tokenToTransfer));
    emit IERC20.Transfer(address(tokenBridge), address(tbr), denormalizedAmount);

    vm.expectEmit(address(tokenToTransfer));
    emit IWETH.Withdrawal(address(tbr), denormalizedAmount);

    vm.mockCallRevert(recipient, new bytes(0), abi.encodePacked(
      TestErrorForRecipient.selector,
      errorId
    ));

    bytes memory result = tbr.expectRevertInvokeTbr(
      abi.encodePacked(
        COMPLETE_TRANSFER_ID,
        encodedVaa
      ),
      unallocatedBalance
    );

    uint commandIndex;
    uint errorSize;
    bytes4 nestedErrorSelector;
    uint256 thrownErrorId;

    (bytes4 errorSelector, uint256 offset) = result.asBytes4MemUnchecked(0);
    (commandIndex, offset) = result.asUint256MemUnchecked(offset);
    (errorSize, offset) = result.asUint256MemUnchecked(offset);
    uint errorOverheadSize = offset;
    (nestedErrorSelector, offset) = result.asBytes4MemUnchecked(offset);
    (thrownErrorId, offset) = result.asUint256MemUnchecked(offset);

    assertEq(errorSelector, PayFailure.selector);
    assertEq(commandIndex, 0);
    assertEq(errorSize, 36);
    assertEq(nestedErrorSelector, TestErrorForRecipient.selector);
    assertEq(thrownErrorId, errorId);
    assertEq(result.length, errorOverheadSize + errorSize);
    assertEq(result.length, offset);
  }
}