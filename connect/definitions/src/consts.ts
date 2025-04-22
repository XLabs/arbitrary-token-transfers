import { MapLevels, Network, Chain, constMap } from '@wormhole-foundation/sdk-base';

// prettier-ignore
const addresses = [[
  "Mainnet", []], [
  "Testnet", [
    ["Solana",          "ATtNvUvPZ3RU78P8Z5NuwHMTwQ8u8YsDWJ6YN6XvCErS"],
    ["Avalanche",       "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["Celo",            "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["Sepolia",         "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["ArbitrumSepolia", "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["BaseSepolia",     "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["OptimismSepolia", "0x5DEfC04a5F34A7f6DD794Cd3D2D72e0C183C1cD4"],
    ["PolygonSepolia",  "0x919c3C01bFD374833a9D7a711305F9fF47bB544D"]
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tokenBridgeRelayerV3Contracts = constMap(addresses);
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
