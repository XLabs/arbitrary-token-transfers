// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceOracle} from "price-oracle/IPriceOracle.sol";
import "wormhole-sdk/interfaces/ITokenBridge.sol";
import "wormhole-sdk/libraries/BytesParsing.sol";

import {ACQUIRE_PREAPPROVED} from "tbr/assets/TbrUser.sol";
import {TransferRequested} from "tbr/assets/TbrUser.sol";
import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrIds.sol";

import {TbrTestBase} from "./utils/TbrTestBase.sol";
import {getFakeBytes32} from "./utils/utils.sol";

contract UserTest is TbrTestBase {
  using BytesParsing for bytes;
  
  uint16  SOLANA_CHAIN_ID       = 1;
  bytes32 SOLANA_CANONICAL_PEER = getFakeBytes32("SOLANA_CANONICAL_PEER");
  uint16  EVM_CHAIN_ID          = 3;
  bytes32 EVM_CANONICAL_PEER    = getFakeBytes32("EVM_CANONICAL_PEER");
  uint32 MAX_GAS_DROPOFF_AMOUNT = 10000;
  uint32 RELAY_FEE_AMOUNT       = 1000;

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
    uint32 gasDropoff
  ) public {
    // Transaction arguments
    gasDropoff = uint32(bound(gasDropoff, 1, MAX_GAS_DROPOFF));
    bytes32 recipient = getFakeBytes32("recipient");
    bool unwrapIntent = false;
    uint msgValue = 1e6;

    // Test setup
    uint initialFeeRecipientBalance = address(feeRecipient).balance;
    uint initialCallerBalance = address(this).balance;

    deal(address(usdt), address(this), tokenAmount);
    SafeERC20.safeApprove(usdt, address(tbr), tokenAmount);

    /// Mocks

    // Mock the bridge contract address on destination chain returned
    bytes32 targetTokenBridge = getFakeBytes32("targetTokenBridge");
    vm.mockCall(
      address(tokenBridge), 
      abi.encodeWithSelector(ITokenBridge.bridgeContracts.selector), 
      abi.encode(targetTokenBridge)
    );

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
}