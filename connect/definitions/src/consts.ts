import { MapLevels, Network, Chain, constMap } from "@wormhole-foundation/sdk-base";

// prettier-ignore
const addresses = [[
  "Mainnet", []], [
  "Testnet", [
    ["Solana",          "AtTpCxEYQiPswfGz493qcbiK1eE13W3YZutvxBdANDeR"],
    ["Sepolia",         "0xb620f38B1211bDB96684576017F66bA9871eb6be"],
    ["BaseSepolia",     "0x3ddc4d19D05Caf86F70BcF55BdDA5B683E56b2Ae"],
    ["OptimismSepolia", "0xb620f38B1211bDB96684576017F66bA9871eb6be"],
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tokenBridgeRelayerV3Contracts = constMap(addresses);
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
