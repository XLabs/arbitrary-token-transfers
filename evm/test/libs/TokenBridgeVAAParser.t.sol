// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { IWormhole } from "wormhole-sdk/interfaces/IWormhole.sol";
import { TokenBridgeVAAParser } from "tbr/assets/TbrUser.sol";
import { toUniversalAddress } from "wormhole-sdk/Utils.sol";
import { TbrTestBase } from "../utils/TbrTestBase.sol";
import { craftTbrV3Vaa } from "../utils/utils.sol";

contract TokenBridgeVAAParserTest is TbrTestBase {
  using BytesParsing for bytes;

  function parse(
    bytes calldata data,
    uint offset,
    uint commandIndex
  ) external pure returns(
    bytes memory vaa,
    uint16 peerChain,
    bytes32 peerAddress,
    uint16 tokenOriginChain,
    bytes32 tokenOriginAddress,
    address recipient,
    uint256 tokenAmount,
    uint32 gasDropoff,
    bool unwrapIntent,
    uint retOffset
  ) {
    return TokenBridgeVAAParser.parse(data, offset, commandIndex);
  }

  function testParseVaa(
    bytes32 originTokenBridge,
    bytes32 originTBR,
    bytes32 targetTBR,
    uint16 peerChain,
    uint16 tokenChain,
    uint256 amount,
    uint16 recipientChain,
    address recipient,
    uint32 gasDropoff,
    bool unwrapIntent
  ) public {
    vm.assume(recipient != address(0));
    bytes32 tokenAddress = toUniversalAddress(address(usdt));
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

    uint commandIndex = 0;
    uint offset = 0;

    ( , 
      uint16 peerChainParsed, 
      bytes32 peerAddressParsed, 
      uint16 tokenOriginChain, 
      bytes32 tokenOriginAddress, 
      address recipientParsed, 
      uint256 tokenAmount, 
      uint32 gasDropoffParsed, 
      bool unwrapIntentParsed, 
      uint retOffset
    ) = this.parse(encodedVaa, offset, commandIndex);

    assertEq(peerChainParsed, peerChain);
    assertEq(peerAddressParsed, originTBR);
    assertEq(tokenOriginChain, tokenChain);
    assertEq(tokenOriginAddress, tokenAddress);
    assertEq(recipientParsed, recipient);
    assertEq(tokenAmount, amount);
    assertEq(gasDropoffParsed, gasDropoff);
    assertEq(unwrapIntentParsed, unwrapIntent);
    assertEq(retOffset, encodedVaa.length);
  } 
}
