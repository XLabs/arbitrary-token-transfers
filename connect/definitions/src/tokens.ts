// TODO: use constMap for this so that it's typed?
// import { getTokenMap } from '@wormhole-foundation/sdk-base/tokens';
import { MapLevel, Chain, TokenSymbol, TokenConst, constMap } from '@wormhole-foundation/sdk-base';
// const a = getTokenMap("Testnet", "Solana");

const testnetTokenEntries = [
  [
    "Avalanche",
    [
      [
        "WETH",
        {
          symbol: "WETH",
          decimals: 18,
          address: "0xbB5A2dC896Ec4E2fa77F40FA630582ed9c6D0172",
          original: "Ethereum",
        },
      ],
      [
        "WAVAX",
        {
          symbol: "WAVAX",
          decimals: 18,
          address: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
          original: "Avalanche",
        },
      ],
    ],
  ],
  [
    "Celo",
    [
      [
        "WETH",
        {
          symbol: "WETH",
          decimals: 18,
          address: "0x898471a82737dFFfB61915F9e8381e279076D72b",
          original: "Ethereum",
        },
      ],
      [
        "WCELO",
        {
          symbol: "WCELO",
          decimals: 18,
          address: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
          original: "Celo",
        },
      ],
    ],
  ],
  [
    "Solana",
    [
      [
        "WETH",
        {
          symbol: "WETH",
          decimals: 8,
          address: "7VPWjBhCXrpYYBiRKZh1ubh9tLZZNkZGp2ReRphEV4Mc",
          original: "Ethereum",
        },
      ],
    ],
  ],
] as const satisfies MapLevel<Chain, MapLevel<TokenSymbol, TokenConst>>;

export const testnetTokensByChain = constMap(testnetTokenEntries, [0, [1, 2]]);
