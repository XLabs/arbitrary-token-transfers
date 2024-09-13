import { MapLevels, Network, Chain, constMap } from "@wormhole-foundation/sdk-base";

// prettier-ignore
const addresses = [[
  "Mainnet", []], [
  "Testnet", [
    ["Solana",          "AtTpCxEYQiPswfGz493qcbiK1eE13W3YZutvxBdANDeR"],
    ["Sepolia",         "0xbd3e6Ee89Ee2085732dCE4d501185f875cC2362d"],
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tokenBridgeRelayerV3Contracts = constMap(addresses);
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
