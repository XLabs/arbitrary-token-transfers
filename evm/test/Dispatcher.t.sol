// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import { BytesParsing } from "wormhole-sdk/libraries/BytesParsing.sol";
import { DISPATCHER_PROTOCOL_VERSION0 } from "tbr/assets/TbrIds.sol";
import { TbrTestBase, InvokeTbr } from "./utils/TbrTestBase.sol";
import { Tbr } from "tbr/Tbr.sol";
import { UnsupportedVersion, InvalidCommand } from "tbr/assets/TbrDispatcher.sol";

contract DispatcherTest is TbrTestBase {
  using BytesParsing for bytes;
  using InvokeTbr for Tbr;

  function testExec() public {
    uint8 wrongVersion = 1;
    uint256 expectedCommandIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    tbr.invokeTbr(
      abi.encodePacked(tbr.exec768.selector, wrongVersion)
    );

    // The first query command, so should fail because the exec
    // function will not be able to handle it.
    uint8 fakeCommand = 0x80;
    vm.expectRevert(
      abi.encodeWithSelector(InvalidCommand.selector, fakeCommand, expectedCommandIndex)
    );
    tbr.invokeTbr(
      abi.encodePacked(tbr.exec768.selector, DISPATCHER_PROTOCOL_VERSION0, fakeCommand)
    );
  }

  function testGet() public {
    uint8 wrongVersion = 1;
    uint256 expextedQueryIndex = 0;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    tbr.invokeStaticTbr(
      abi.encodePacked(tbr.get1959.selector, wrongVersion)
    );

    // The last exec command, so should fail because the get
    // function will not be able to handle it.
    uint8 fakeQuery = 0x79;
    vm.expectRevert(
      abi.encodeWithSelector(InvalidCommand.selector, fakeQuery, expextedQueryIndex)
    );
    tbr.invokeStaticTbr(
      abi.encodePacked(tbr.get1959.selector, DISPATCHER_PROTOCOL_VERSION0, fakeQuery)
    );
  }
}
