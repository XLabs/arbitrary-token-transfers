// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceOracle} from "price-oracle/IPriceOracle.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";

import {TransferRequested} from "tbr/assets/TbrUser.sol";
import "tbr/assets/TbrDispatcher.sol";
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
    // Mock the bridge contract address on target chain returned
    bytes32 targetTokenBridge = makeBytes32("targetTokenBridge");
    vm.mockCall(
      address(tokenBridge), 
      abi.encodeWithSelector(ITokenBridge.bridgeContracts.selector), 
      abi.encode(targetTokenBridge)
    );

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

    // Tbr setup
    executeGovernanceCommand(
      abi.encodePacked(UPDATE_RELAY_FEE, RELAY_FEE_AMOUNT)
    );
  }
  

  function testTransferTokenWithRelay_PREAPPROVED (
    uint256 tokenAmount, 
    uint32 gasDropoff,
    bytes32 recipient
  ) public {
    vm.assume(tokenAmount > 0);
    vm.assume(recipient != bytes32(0));

    // Transaction arguments
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF_AMOUNT));
    bool unwrapIntent = false;
    uint msgValue = 1e6;

    // Test setup
    uint initialFeeRecipientBalance = address(feeRecipient).balance;
    uint initialCallerBalance = address(this).balance;

    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.safeApprove(usdt, address(tbr), tokenAmount);

    /// Mocks

    // Mock the sequence number returned by token bridge 
    uint64 sequence = 1;
    vm.mockCall(
      address(tokenBridge), 
      abi.encodeWithSelector(ITokenBridge.transferTokensWithPayload.selector), 
      abi.encode(sequence)
    );

    // Mock the quote returned by the oracle
    uint feeQuote = 100;
    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    /// Expects

    vm.expectCall(
      address(oracle),
      abi.encodeWithSelector(IPriceOracle.get1959.selector),
      1
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.transferFrom.selector),
      1
    );

    vm.expectCall(
      address(usdt),
      abi.encodeWithSelector(usdt.approve.selector),
      1
    );

    vm.expectCall(
      address(tokenBridge),
      abi.encodeWithSelector(tokenBridge.transferTokensWithPayload.selector),
      1
    );

    vm.expectEmit(address(tbr));
    emit TransferRequested(address(this), sequence, gasDropoff, feeQuote);

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        SOLANA_CHAIN_ID,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      msgValue
    );

    /// Asserts

    assertEq(address(this).balance, initialCallerBalance - feeQuote);
    assertEq(address(feeRecipient).balance, initialFeeRecipientBalance + feeQuote);
  }

  function testTransferTokenWithRelay_TargetChainNotSupported (uint16 fakeChainId) public {
    bytes32 recipient = makeBytes32("recipient");
    bool unwrapIntent = false;
    uint256 tokenAmount = 1e6;
    uint32 gasDropoff = 100;
    uint msgValue = 1e6;

    vm.assume(fakeChainId != SOLANA_CHAIN_ID);
    vm.assume(fakeChainId != EVM_CHAIN_ID);
    vm.expectRevert(
      abi.encodeWithSelector(TargetChainIsNotSupported.selector, fakeChainId)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        fakeChainId,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      msgValue
    );
  }

  function testTransferTokenWithRelay_TransfersToChainArePaused () public {
    bytes32 recipient = makeBytes32("recipient");
    bool unwrapIntent = false;
    uint256 tokenAmount = 1e6;
    uint32 gasDropoff = 100;
    uint msgValue = 1e6;

    executeGovernanceCommand(
      abi.encodePacked(PAUSE_CHAIN, SOLANA_CHAIN_ID, bool(true))
    );

    vm.expectRevert(
      abi.encodeWithSelector(TransfersToChainArePaused.selector, SOLANA_CHAIN_ID)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        SOLANA_CHAIN_ID,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      msgValue
    );
  }

  function testTransferTokenWithRelay_GasDropoffExceedsMaximum () public {
    bytes32 recipient = makeBytes32("recipient");
    uint32 gasDropoff = MAX_GAS_DROPOFF_AMOUNT + 1;
    bool unwrapIntent = false;
    uint256 tokenAmount = 1e6;
    uint256 commandIndex = 0;
    uint msgValue = 1e6;

    vm.expectRevert(
      abi.encodeWithSelector(
        GasDropoffRequestedExceedsMaximum.selector, 
        MAX_GAS_DROPOFF_AMOUNT, 
        commandIndex
      )
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        SOLANA_CHAIN_ID,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      msgValue
    );
  }

  function testTransferTokenWithRelay_FeesInsufficient () public {
    bytes32 recipient = makeBytes32("recipient");
    uint32 gasDropoff = 1000;
    bool unwrapIntent = false;
    uint256 tokenAmount = 1e6;
    uint256 commandIndex = 0;
    uint msgValue = 10;

    // Mock the quote returned by the oracle
    uint feeQuote = 100;
    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.expectRevert(
      abi.encodeWithSelector(FeesInsufficient.selector, msgValue, commandIndex)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        SOLANA_CHAIN_ID,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        ACQUIRE_PREAPPROVED
      ),
      msgValue
    );
  }

  function testTransferTokenWithRelay_InvalidAcquireMode (uint8 acquireMode) public {
    bytes32 recipient = makeBytes32("recipient");
    uint32 gasDropoff = 1000;
    bool unwrapIntent = false;
    uint256 tokenAmount = 1e6;
    uint msgValue = 1e6;

    // Mock the quote returned by the oracle
    uint feeQuote = 100;
    vm.mockCall(
      address(oracle), 
      abi.encodeWithSelector(IPriceOracle.get1959.selector), 
      abi.encode(abi.encodePacked(uint256(feeQuote)))
    );

    vm.assume(acquireMode != ACQUIRE_PREAPPROVED);
    vm.assume(acquireMode != ACQUIRE_PERMIT);
    vm.assume(acquireMode != ACQUIRE_PERMIT2TRANSFER);
    vm.assume(acquireMode != ACQUIRE_PERMITE2PERMIT);
    vm.expectRevert(
      abi.encodeWithSelector(InvalidAcquireMode.selector, acquireMode)
    );

    invokeTbr(
      abi.encodePacked(
        tbr.exec768.selector, 
        DISPATCHER_PROTOCOL_VERSION0, 
        TRANSFER_TOKEN_WITH_RELAY_ID,
        recipient,
        SOLANA_CHAIN_ID,
        address(usdt),
        tokenAmount,
        gasDropoff,
        unwrapIntent,
        acquireMode
      ),
      msgValue
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
    bool txCommitEthereum;
    uint32 maxGasDropoff;
    uint32 baseFee;
    (peer, offset) = response.asBytes32Unchecked(offset);
    (chainIsPaused, offset) = response.asBoolUnchecked(offset);
    (txCommitEthereum, offset) = response.asBoolUnchecked(offset);
    (maxGasDropoff, offset) = response.asUint32Unchecked(offset);
    (baseFee, offset) = response.asUint32Unchecked(offset);

    assertEq(peer, SOLANA_CANONICAL_PEER);
    assertEq(chainIsPaused, false);
    assertEq(txCommitEthereum, false);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(baseFee, RELAY_FEE_AMOUNT);

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
    (chainIsPaused, offset) = response.asBoolUnchecked(offset);
    (txCommitEthereum, offset) = response.asBoolUnchecked(offset);
    (maxGasDropoff, offset) = response.asUint32Unchecked(offset);
    (baseFee, offset) = response.asUint32Unchecked(offset);

    assertEq(peer, EVM_CANONICAL_PEER);
    assertEq(chainIsPaused, false);
    assertEq(txCommitEthereum, true);
    assertEq(maxGasDropoff, MAX_GAS_DROPOFF_AMOUNT);
    assertEq(baseFee, RELAY_FEE_AMOUNT);
  }
}