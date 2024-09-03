// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

// ----------- Dispatcher Ids -----------

// Execute commands

uint8 constant TRANSFER_TOKENS_WITH_RELAY_ID = 0;
uint8 constant WRAP_AND_TRANSFER_ETH_WITH_RELAY_ID = 1;
uint8 constant COMPLETE_ID = 2;
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
uint8 constant PAUSE_OUTBOUND_TRANSFERS = 5;
// only available to owner:
uint8 constant UPDATE_ADMIN = 6;
uint8 constant UPDATE_CANONICAL_PEER = 7;
uint8 constant UPGRADE_CONTRACT = 8;
uint8 constant PROPOSE_OWNERSHIP_TRANSFER = 9;
uint8 constant RELINQUISH_OWNERSHIP = 10;

// Query commands

uint8 constant RELAY_FEE = 0x80;
uint8 constant MAX_GAS_DROPOFF = 0x81;
uint8 constant OUTBOUND_TRANSFER_PAUSED = 0x82;
uint8 constant PEERS = 0x83;
uint8 constant CANONICAL_PEER = 0x84;
uint8 constant OWNER = 0x85;
uint8 constant PENDING_OWNER = 0x86;
uint8 constant ADMIN = 0x87;
uint8 constant FEE_RECIPIENT = 0x88;
uint8 constant IMPLEMENTATION = 0x89;