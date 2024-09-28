import { MapLevels, Network, Chain, constMap } from '@wormhole-foundation/sdk-base';

// prettier-ignore
const addresses = [[
  "Mainnet", []], [
  "Testnet", [
    ["Solana",          "AttbEYJMSsnVRDcKY4AcX1GBcdPy9FzHcxTbKaMGGuLs"],
    ["Sepolia",         "0xb620f38B1211bDB96684576017F66bA9871eb6be"],
    ["Celo",            "0xdbe75EfF77dF67524B13c38e07d2451456098DC7"],
    ["BaseSepolia",     "0xFe8dE1cf8893f0D928F007E787fD072660EAc06B"],
    ["OptimismSepolia", "0x7057447A58b92e2C68A46548B6992203233e92eC"],
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tokenBridgeRelayerV3Contracts = constMap(addresses);
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
