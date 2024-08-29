// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/libraries/BytesParsing.sol";
import { TbrTestBase } from "./utils/TbrTestBase.sol";
import "tbr/assets/TbrDispatcher.sol";
import "tbr/assets/TbrGovernance.sol";

contract DispatcherTest is TbrTestBase {
  using BytesParsing for bytes;

  function testExec() public {
    uint8 version = 0;
    uint8 wrongVersion = 1;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    invokeTbr(
      abi.encodePacked(tbr.exec768.selector, wrongVersion)
    );

    // The first query command, so should fail because the exec 
    // function will not be able to handle it.
    uint8 fakeCommand = 0x80;
    vm.expectRevert(
      abi.encodeWithSelector(UnknownCommand.selector, fakeCommand)
    );
    invokeTbr(
      abi.encodePacked(tbr.exec768.selector, version, fakeCommand)
    );
  }

  function testGet() public {
    uint8 version = 0;
    uint8 wrongVersion = 1;

    vm.expectRevert(
      abi.encodeWithSelector(UnsupportedVersion.selector, wrongVersion)
    );
    invokeTbr(
      abi.encodePacked(tbr.get1959.selector, wrongVersion)
    );

    // The last exec command, so should fail because the get
    // function will not be able to handle it.
    uint8 fakeQuery = 0x79;
    vm.expectRevert(
      abi.encodeWithSelector(UnknownQuery.selector, fakeQuery)
    );
    invokeTbr(
      abi.encodePacked(tbr.get1959.selector, version, fakeQuery)
    );
  }
}
