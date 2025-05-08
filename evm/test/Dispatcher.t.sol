// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { TbrTestBase, InvokeTbr } from "./utils/TbrTestBase.sol";
import { Tbr } from "tbr/Tbr.sol";
import { UnsupportedVersion, InvalidCommand } from "tbr/assets/TbrDispatcher.sol";
import { reRevert } from "wormhole-sdk/Utils.sol";

contract DispatcherTest is TbrTestBase {
  using BytesParsing for bytes;
  using InvokeTbr for Tbr;

  function testExec() public {
    uint8 wrongVersion = 1;
    uint256 expectedCommandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    bytes memory execCall = abi.encodePacked(tbr.exec768.selector, wrongVersion);
    (bool success, bytes memory result) = address(tbr).call(execCall);
    if (!success) {
      reRevert(result);
    }

    // The first query command, so should fail because the exec
    // function will not be able to handle it.
    uint8 fakeCommand = 0x80;
    vm.expectRevert(
      abi.encodeWithSelector(InvalidCommand.selector, fakeCommand, expectedCommandIndex)
    );
    tbr.invokeTbr(
      abi.encodePacked(fakeCommand)
    );
  }

  function testGet() public {
    uint8 wrongVersion = 1;
    uint256 expectedQueryIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    bytes memory getCall = abi.encodePacked(tbr.get1959.selector, wrongVersion);
    (bool success, bytes memory result) = address(tbr).staticcall(getCall);
    if (!success) {
      reRevert(result);
    }

    // The last exec command, so should fail because the get
    // function will not be able to handle it.
    uint8 fakeQuery = 0x79;
    vm.expectRevert(
      abi.encodeWithSelector(InvalidCommand.selector, fakeQuery, expectedQueryIndex)
    );
    tbr.invokeStaticTbr(
      abi.encodePacked(fakeQuery)
    );
  }
}
