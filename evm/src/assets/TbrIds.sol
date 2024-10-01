// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

// ----------- Dispatcher Ids -----------

uint8 constant DISPATCHER_PROTOCOL_VERSION0 = 0;

// Execute commands

uint8 constant TRANSFER_TOKEN_WITH_RELAY_ID = 0x00;
uint8 constant TRANSFER_GAS_TOKEN_WITH_RELAY_ID = 0x01;
uint8 constant COMPLETE_TRANSFER_ID = 0x02;
uint8 constant CONFIG_ID = 0x03;
uint8 constant APPROVE_TOKEN_ID = 0x04;

// Query commands

uint8 constant RELAY_FEE_ID = 0x80;
uint8 constant BASE_RELAYING_CONFIG_ID = 0x81;
uint8 constant CONFIG_QUERIES_ID = 0x82;
uint8 constant ALLOWANCE_TOKEN_BRIDGE_ID = 0x83;

// ----------- Config Ids -----------

// Execute commands

// admin can add new peers, but only owner can change existing registrations
uint8 constant ADD_PEER_ID = 0x00;
uint8 constant UPDATE_BASE_FEE_ID = 0x01;
uint8 constant UPDATE_MAX_GAS_DROPOFF_ID = 0x02;
uint8 constant PAUSE_CHAIN_ID = 0x03;
// gap for future chain parameters

uint8 constant UPDATE_FEE_RECIPIENT_ID = 0x0a;
// only available to owner:
uint8 constant UPDATE_CANONICAL_PEER_ID = 0x0b;

// Query commands

uint8 constant BASE_FEE_ID = 0x80;
uint8 constant MAX_GAS_DROPOFF_ID = 0x81;
uint8 constant IS_CHAIN_PAUSED_ID = 0x82;
uint8 constant IS_PEER_ID = 0x83;
uint8 constant CANONICAL_PEER_ID = 0x84;
uint8 constant IS_CHAIN_SUPPORTED_ID = 0x85;
uint8 constant FEE_RECIPIENT_ID = 0x86;
