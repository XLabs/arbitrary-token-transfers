// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { TbrTestBase } from "./utils/TbrTestBase.sol";
import "./utils/TbrExposer.sol";
import "tbr/assets/TbrBase.sol";

contract BaseTest is TbrTestBase {

  function testAddPeer() public {
    uint16 chainId = 1;
    uint16 wrongChainId = 0;
    uint16 notSupportedChainId = 100;
    bytes32 peer = 0x1234567890123456789012345678901234567890123456789012345678901234;
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
      abi.encodeWithSelector(ChainNoSupportedByTokenBridge.selector, notSupportedChainId)
    );
    tbrExposer.exposedAddPeer(notSupportedChainId, peer);

    tbrExposer.exposedAddPeer(chainId, peer);

    vm.expectRevert(
      abi.encodeWithSelector(PeerAlreadyRegistered.selector, chainId, peer)
    );
    tbrExposer.exposedAddPeer(chainId, peer);

    bytes32[] memory peers = tbrExposer.exposedGetPeers(chainId);

    assertEq(peers.length, 1);
    assertEq(peers[0], peer);
  }

  function testSetCanonicalPeer() public {
    uint16 chainId = 1;
    uint16 wrongChainId = 0;
    uint16 notSupportedChainId = 100;
    bytes32 peer = 0x1234567890123456789012345678901234567890123456789012345678901234;
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
      abi.encodeWithSelector(ChainNoSupportedByTokenBridge.selector, notSupportedChainId)
    );
    tbrExposer.exposedSetCanonicalPeer(notSupportedChainId, peer);

    tbrExposer.exposedAddPeer(chainId, peer);
    tbrExposer.exposedSetCanonicalPeer(chainId, peer);
    bytes32 canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(canonicalPeer, peer);

    bytes32 anotherPeer = 0x1234567890123456789012345678901234567890123456789012345678901235;
    tbrExposer.exposedAddPeer(chainId, anotherPeer);
    tbrExposer.exposedSetCanonicalPeer(chainId, anotherPeer);
    canonicalPeer = tbrExposer.exposedGetCanonicalPeer(chainId);
    assertEq(canonicalPeer, anotherPeer);
  }
}
