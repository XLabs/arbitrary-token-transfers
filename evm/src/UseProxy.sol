// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import "wormhole-sdk/proxy/Proxy.sol";

// The sole purpose of this file is to visibilize this contract to codegen tools like Typechain.
// At the time of writing, forge won't generate any compiler input for the Proxy contract without this import.