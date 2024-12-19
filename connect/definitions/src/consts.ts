import { MapLevels, Network, Chain, constMap } from '@wormhole-foundation/sdk-base';

// prettier-ignore
const addresses = [[
  "Mainnet", []], [
  "Testnet", [
    ["Solana",          "ATtNvUvPZ3RU78P8Z5NuwHMTwQ8u8YsDWJ6YN6XvCErS"],
    ["Avalanche",       "0x2BCC362643B0aa3b2608de68b2C2ef2e6eFd2bb6"],
    ["Celo",            "0xAafD9ED1B11b1E1Bf08094Fa0E53e4eEa807B5D5"],
    ["Sepolia",         "0xDc74c34F88d17895e31792439eaCE7cB1ed17d3a"],
    ["ArbitrumSepolia", "0x7Ab71581b33948DdD07a4995a594d631BC4D2988"],
    ["BaseSepolia",     "0xFe8dE1cf8893f0D928F007E787fD072660EAc06B"],
    ["OptimismSepolia", "0x7057447A58b92e2C68A46548B6992203233e92eC"],
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tokenBridgeRelayerV3Contracts = constMap(addresses);
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
