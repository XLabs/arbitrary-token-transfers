// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { 
  ChainIsNotRegistered, 
  InvalidChainId,
  PeerIsZeroAddress,
  ChainNotSupportedByTokenBridge
} from "tbr/assets/TbrBase.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import { TbrExposer } from"./utils/TbrExposer.sol";
import { Receiver } from "./utils/Receiver.sol";
import { makeBytes32 } from "./utils/utils.sol";
import { Tbr } from "tbr/Tbr.sol";

contract BaseTest is TbrTestBase {

  function testAddPeer(bytes32 peer, bytes32 anotherPeer) public {
    vm.assume(peer != bytes32(0));
    vm.assume(anotherPeer != bytes32(0));
    uint16 chainId = SOLANA_CHAIN_ID;
    uint16 wrongChainId = 0;
    uint16 notSupportedChainId = 100;
    bytes32 wrongPeer = bytes32(0);

    vm.expectRevert(
      abi.encodeWithSelector(InvalidChainId.selector)
    );
    tbrExposer.exposedAddPeer(wrongChainId, peer);

    vm.expectRevert(
      abi.encodeWithSelector(PeerIsZeroAddress.selector)
    );
    tbrExposer.exposedAddPeer(chainId, wrongPeer);

    vm.expectRevert(
      abi.encodeWithSelector(ChainNotSupportedByTokenBridge.selector, notSupportedChainId)
    );
    tbrExposer.exposedAddPeer(notSupportedChainId, peer);

    tbrExposer.exposedAddPeer(chainId, peer);

    bool _isPeer = tbrExposer.exposedIsPeer(chainId, peer);
    bytes32 canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(_isPeer, true);
    assertEq(canonicalPeer, peer);

    tbrExposer.exposedAddPeer(chainId, anotherPeer);
    _isPeer = tbrExposer.exposedIsPeer(chainId, anotherPeer);
    canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(_isPeer, true);
    assertEq(canonicalPeer, peer);
  }

  function testSetCanonicalPeer(bytes32 peer, bytes32 anotherPeer) public {
    vm.assume(peer != bytes32(0));
    vm.assume(anotherPeer != bytes32(0));
    uint16 chainId = SOLANA_CHAIN_ID;
    uint16 wrongChainId = 0;
    uint16 notSupportedChainId = 100;
    bytes32 wrongPeer = bytes32(0);

    vm.expectRevert(
      abi.encodeWithSelector(InvalidChainId.selector)
    );
    tbrExposer.exposedSetCanonicalPeer(wrongChainId, peer);

    vm.expectRevert(
      abi.encodeWithSelector(PeerIsZeroAddress.selector)
    );
    tbrExposer.exposedSetCanonicalPeer(chainId, wrongPeer);

    vm.expectRevert(
      abi.encodeWithSelector(ChainNotSupportedByTokenBridge.selector, notSupportedChainId)
    );
    tbrExposer.exposedSetCanonicalPeer(notSupportedChainId, peer);

    tbrExposer.exposedSetCanonicalPeer(chainId, peer);
    bytes32 canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(canonicalPeer, peer);

    tbrExposer.exposedAddPeer(chainId, anotherPeer);
    tbrExposer.exposedSetCanonicalPeer(chainId, anotherPeer);
    canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(canonicalPeer, anotherPeer);
  }

  function testGetTargetChainData(
    bytes32 peer,
    uint32 expectedBaseFee,
    uint32 expectedMaxGasDropoff,
    bool paused
  ) public {
    vm.assume(peer != bytes32(0));
    uint16 chainId = SOLANA_CHAIN_ID;

    tbrExposer.exposedSetCanonicalPeer(chainId, peer);
    tbrExposer.exposedSetBaseFee(chainId, expectedBaseFee);
    tbrExposer.exposedSetMaxGasDropoff(chainId, expectedMaxGasDropoff);
    tbrExposer.exposedSetPause(chainId, paused);

    (
      bytes32 canonicalPeer,
      uint32 baseFee,
      uint32 maxGasDropoff,
      bool isPaused
    ) = tbrExposer.exposedGetTargetChainData(chainId);
    assertEq(canonicalPeer, peer);
    assertEq(baseFee, expectedBaseFee);
    assertEq(maxGasDropoff, expectedMaxGasDropoff);
    assertEq(isPaused, paused);
  }

  function testTransferEthToAccount(uint256 amount) public {
    address fakeAddress = makeAddr("fakeAddress");
    vm.deal(address(tbrExposer), amount);

    assertEq(address(fakeAddress).balance, 0);
    tbrExposer.exposedTransferEth(fakeAddress, amount);
    assertEq(address(fakeAddress).balance, amount);
  }

  function testTransferEthToContract(uint256 amount) public {
    address fakeAddress = address(new Receiver());
    vm.deal(address(tbrExposer), amount);

    assertEq(address(fakeAddress).balance, 0);
    tbrExposer.exposedTransferEth(fakeAddress, amount);
    assertEq(address(fakeAddress).balance, amount);
  }

  function testSetBaseFee(uint32 fee) public {
    uint16 chainId = EVM_CHAIN_ID;
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    tbrExposer.exposedSetBaseFee(chainId, fee);

    tbrExposer.exposedSetCanonicalPeer(chainId, makeBytes32("peer"));

    tbrExposer.exposedSetBaseFee(chainId, fee);
    uint32 relayFee = tbrExposer.exposedGetBaseFee(chainId);
    assertEq(relayFee, fee);
  }

  function testIsChainSupported(bytes32 peer) public {
    vm.assume(peer != bytes32(0));
    uint16 chainId = SOLANA_CHAIN_ID;

    tbrExposer.exposedSetCanonicalPeer(chainId, peer);
    bool _isChainSupported = tbrExposer.exposedIsChainSupported(chainId);
    assertEq(_isChainSupported, true);
  }

  function testSetMaxGasDropoff(uint32 maxGasDropoff) public {
    uint16 chainId = EVM_CHAIN_ID;
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    tbrExposer.exposedSetMaxGasDropoff(chainId, maxGasDropoff);

    tbrExposer.exposedSetCanonicalPeer(chainId, makeBytes32("peer"));

    tbrExposer.exposedSetMaxGasDropoff(chainId, maxGasDropoff);
    uint32 maxGasDropoff_ = tbrExposer.exposedGetMaxGasDropoff(chainId);
    assertEq(maxGasDropoff_, maxGasDropoff);
  }

  function testSetPause(bool paused) public {
    uint16 chainId = EVM_CHAIN_ID;
    vm.expectRevert(
      abi.encodeWithSelector(ChainIsNotRegistered.selector, chainId)
    );
    tbrExposer.exposedSetPause(chainId, paused);

    tbrExposer.exposedSetCanonicalPeer(chainId, makeBytes32("peer"));

    tbrExposer.exposedSetPause(chainId, paused);
    bool isPaused = tbrExposer.exposedIsPaused(chainId);
    assertEq(isPaused, paused);
  }
}
