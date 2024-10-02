// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { WormholeOverride } from "wormhole-sdk/testing/WormholeOverride.sol";
import { IWormhole } from "wormhole-sdk/interfaces/IWormhole.sol";
import { TBR_V3_MESSAGE_VERSION } from "tbr/assets/TbrUser.sol";
import { toUniversalAddress } from "wormhole-sdk/Utils.sol";
import { ERC20 } from "wormhole-sdk/testing/ERC20Mock.sol";


function makeBytes32(string memory seed) pure returns (bytes32) {
  return keccak256(abi.encodePacked(seed));
}

function normalizeAmount(uint256 amount, uint8 decimals) pure returns(uint256) { unchecked {
  if (decimals > 8) {
    amount /= 10 ** (decimals - 8);
  }
  return amount;
}}

function deNormalizeAmount(uint256 amount, uint8 decimals) pure returns(uint256) { unchecked {
  if (decimals > 8) {
    amount *= 10 ** (decimals - 8);
  }
  return amount;
}}

function discardInsignificantBits(uint256 amount, uint8 decimals) pure returns(uint256) {
  return deNormalizeAmount(normalizeAmount(amount, decimals), decimals);
}

contract ERC20Mock is ERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals) ERC20(name, symbol, decimals) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }
}

function craftTbrV3Vaa(
  IWormhole wormhole,
  uint16 peerChain,
  uint16 tokenChain,
  bytes32 tokenAddress,
  uint256 amount,
  uint16 recipientChain,
  address recipient,
  uint32 gasDropoff,
  bool unwrapIntent,
  uint64 sequence
) returns (IWormhole.VM memory, bytes memory) {
  bytes32 universalRecipient = toUniversalAddress(recipient);
  uint8 TOKEN_BRIDGE_PAYLOAD_ID = 3;
  
  bytes memory tokenBridgePayload = abi.encodePacked(
      TOKEN_BRIDGE_PAYLOAD_ID,
      amount,
      tokenAddress,
      tokenChain,
      universalRecipient,
      recipientChain,
      toUniversalAddress(msg.sender),
      abi.encodePacked(
        TBR_V3_MESSAGE_VERSION,
        universalRecipient,
        gasDropoff,
        unwrapIntent
      )
  );

  WormholeOverride.setUpOverride(wormhole);
  return WormholeOverride.craftVaa(
    wormhole, 
    peerChain, 
    toUniversalAddress(msg.sender), 
    sequence, 
    tokenBridgePayload
  );  
}