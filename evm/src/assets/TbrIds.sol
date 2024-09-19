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
uint8 constant ADD_PEER_ID = 0;
uint8 constant UPDATE_BASE_FEE_ID = 1;
uint8 constant UPDATE_MAX_GAS_DROPOFF_ID = 2;
uint8 constant PAUSE_CHAIN_ID = 3;
uint8 constant UPDATE_TX_SIZE_SENSITIVE_ID = 4;
// gap for future chain parameters
uint8 constant SWEEP_TOKENS_ID = 10;
uint8 constant UPDATE_FEE_RECIPIENT_ID = 11;
// only available to owner:
uint8 constant UPDATE_ADMIN_ID = 12;
uint8 constant UPDATE_CANONICAL_PEER_ID = 13;
uint8 constant UPGRADE_CONTRACT_ID = 14;
uint8 constant PROPOSE_OWNERSHIP_TRANSFER_ID = 15;
uint8 constant ACQUIRE_OWNERSHIP_ID = 16;
uint8 constant RELINQUISH_OWNERSHIP_ID = 17;

// Query commands

uint8 constant BASE_FEE_ID = 0x80;
uint8 constant MAX_GAS_DROPOFF_ID = 0x81;
uint8 constant IS_CHAIN_PAUSED_ID = 0x82;
uint8 constant IS_PEER_ID = 0x83;
uint8 constant IS_TX_SIZE_SENSITIVE_ID = 0x84;
uint8 constant CANONICAL_PEER_ID = 0x85;
uint8 constant IS_CHAIN_SUPPORTED_ID = 0x86;
uint8 constant OWNER_ID = 0x87;
uint8 constant PENDING_OWNER_ID = 0x88;
uint8 constant IS_ADMIN_ID = 0x89;
uint8 constant FEE_RECIPIENT_ID = 0x8A;
uint8 constant IMPLEMENTATION_ID = 0x8B;
