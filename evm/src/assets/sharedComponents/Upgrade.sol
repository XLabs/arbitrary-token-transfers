// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { ProxyBase } from "wormhole-sdk/proxy/ProxyBase.sol";
import { 
  accessControlState, 
  AccessControlState, 
  NotAuthorized, 
  senderHasAuth,
  Role 
} from "./AccessControl.sol";
import "./ids.sol";

error InvalidGovernanceCommand(uint8 command);
error InvalidGovernanceQuery(uint8 query);

abstract contract Upgrade is ProxyBase {
  using BytesParsing for bytes;

  function upgrade(address implementation, bytes calldata data) external {
    if (senderHasAuth() != Role.OWNER)
      revert NotAuthorized();
    
    _upgradeTo(implementation, data);
  }

  function _upgradeContract(
    bytes calldata commands,
    uint offset
  ) internal returns (uint) {
    if (senderHasAuth() != Role.OWNER)
      revert NotAuthorized();

    address newImplementation;
    (newImplementation, offset) = commands.asAddressCdUnchecked(offset);
    //contract upgrades must be the last command in the batch
    commands.checkLengthCd(offset);

    _upgradeTo(newImplementation, new bytes(0));

    return offset;
  }
}
