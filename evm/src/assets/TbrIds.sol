// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

// ----------- Dispatcher Ids -----------

uint8 constant DISPATCHER_PROTOCOL_VERSION0 = 0;

// Execute commands

uint8 constant TRANSFER_TOKEN_WITH_RELAY_ID = 0;
uint8 constant TRANSFER_GAS_TOKEN_WITH_RELAY_ID = 1;
uint8 constant COMPLETE_TRANSFER_ID = 2;
uint8 constant GOVERNANCE_ID = 3;

// Query commands

uint8 constant RELAY_FEE_ID = 0x80;
uint8 constant BASE_RELAYING_CONFIG_ID = 0x81;
uint8 constant GOVERNANCE_QUERIES_ID = 0x82;

// ----------- Governance Ids -----------

// Execute commands

// admin can add new peers, but only owner can change existing registrations
uint8 constant ADD_PEER = 0;
uint8 constant SWEEP_TOKENS = 1;
uint8 constant UPDATE_MAX_GAS_DROPOFF = 2;
uint8 constant UPDATE_FEE_RECIPIENT = 3;
uint8 constant UPDATE_RELAY_FEE = 4;
uint8 constant PAUSE_CHAIN = 5;
uint8 constant UPDATE_TX_SIZE_SENSITIVE = 6;
// only available to owner:
uint8 constant UPDATE_ADMIN = 7;
uint8 constant UPDATE_CANONICAL_PEER = 8;
uint8 constant UPGRADE_CONTRACT = 9;
uint8 constant PROPOSE_OWNERSHIP_TRANSFER = 10;
uint8 constant RELINQUISH_OWNERSHIP = 11;

// Query commands

uint8 constant RELAY_FEE = 0x80;
uint8 constant MAX_GAS_DROPOFF = 0x81;
uint8 constant IS_CHAIN_PAUSED = 0x82;
uint8 constant IS_PEER = 0x83;
uint8 constant IS_TX_SIZE_SENSITIVE = 0x84;
uint8 constant CANONICAL_PEER = 0x85;
uint8 constant OWNER = 0x86;
uint8 constant IS_CHAIN_SUPPORTED = 0x87;
uint8 constant PENDING_OWNER = 0x88;
uint8 constant IS_ADMIN = 0x89;
uint8 constant FEE_RECIPIENT = 0x8A;
uint8 constant IMPLEMENTATION = 0x8B;

// ----------- Token Bridge Ids ---------

uint8 constant TB_TRANSFER_WITH_PAYLOAD = 3;