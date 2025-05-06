import type { Chain, CustomConversion, Layout, LayoutToType } from "@wormhole-foundation/sdk-base";
import { layoutItems, type UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { gasDropoffItem } from "@xlabs-xyz/common-arbitrary-token-transfer";

import { accessControlCommandMap, accessControlQueryMap } from "./solidity-sdk/access-control.js";
import { implementationQueryLayout, upgradeCommandLayout } from "./solidity-sdk/upgrade.js";
import { sweepTokensCommandLayout } from "./solidity-sdk/sweepTokens.js";
import { evmAddressItem } from "./solidity-sdk/common.js";

// TODO: update supported chains to the actual chains supported
export const supportedChains = ["Ethereum", "Solana", "Arbitrum", "Base", "Sepolia", "BaseSepolia", "OptimismSepolia"] as const satisfies readonly Chain[];
const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});
export type SupportedChain = typeof supportedChains[number];

const peerChainItem = {
  name: "chain", ...layoutItems.chainItem({ allowedChains: supportedChains }) 
} as const;

export const peerAddressItem = {
  name: "address",
  ...layoutItems.universalAddressItem,
} as const;

const peerChainAndAddressItem = {
  binary: "bytes",
  layout: [
    peerChainItem,
    peerAddressItem
  ]
} as const;

/**
 * Specified as usd.
 * Encoded as µusd.
 */
export const baseFeeItem = gasDropoffItem; //same representation

const bigintDownshift = (quoteResultDecimals: number) => ({
  //like downshift, but for bigints
  //TODO is this good enough? should we use string conversion for better precision?
  to: (val: bigint): number => Number(val) / 10 ** quoteResultDecimals,
  from: (val: number): bigint => BigInt(val * 10 ** quoteResultDecimals),
} as const satisfies CustomConversion<bigint, number>);

//specifed as: gas token (i.e. eth, avax, ...)
// encoded as: Mwei gas token
const feeItem = {
  binary: "uint",
  size: 8,
  custom: bigintDownshift(12),
} as const;

export const acquireModeItem = {
  name: "acquireMode",
  binary: "switch",
  idSize: 1,
  idTag: "mode",
  layouts: [
    [[0, "Preapproved"], []],
    [[1, "Permit"], [
      { name: "value",       binary: "uint",  size: 32 },
      { name: "deadline",    binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
    [[2, "Permit2Transfer"], [
      { name: "amount",      binary: "uint",  size: 32 },
      { name: "nonce",       binary: "uint",  size: 32 },
      { name: "sigDeadline", binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
    [[3, "Permit2Permit"], [
      { name: "amount",      binary: "uint",  size: 20 },
      { name: "expiration",  binary: "uint",  size:  6 },
      { name: "nonce",       binary: "uint",  size:  6 },
      { name: "sigDeadline", binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
  ]
} as const;

// /**
//  * Currently Twei in EVM and Klamport in Solana.
//  * @dev Must match the units documented in Tbrv3::<TODO put function name here>
//  */
// export function gasDropoffUnit(chain: SupportedChains): bigint {
//   if (chain === "Ethereum") return BigInt(1e12);
//   if (chain === "Solana") return BigInt(1e3);
//   throw new Error(`Unknown/unsupported chain ${chain}.`);
// }

const sharedTransferLayout = [
  { name: "recipient", ...peerChainAndAddressItem },
  { name: "gasDropoff", ...gasDropoffItem },
  //speficied in atomic units because we don't know the decimals of the token
  //note: we could almost certainly use less than 32 bytes here...
  { name: "inputAmountInAtomic", ...layoutItems.amountItem },
] as const satisfies Layout;

// msg.value - inputAmount = maxFee(*)
export const transferGasTokenWithRelayLayout = sharedTransferLayout;
export type TransferGasTokenWithRelay = LayoutToType<typeof transferGasTokenWithRelayLayout>;

export const transferTokenWithRelayLayout = [
  ...sharedTransferLayout,
  { name: "inputToken",   ...evmAddressItem       },
  { name: "unwrapIntent", ...layoutItems.boolItem },
  acquireModeItem,
] as const satisfies Layout;
export type TransferTokenWithRelay = LayoutToType<typeof transferTokenWithRelayLayout>;

export const approveTokenLayout = [
  { name: "inputToken", ...evmAddressItem },
] as const satisfies Layout;

export const allowanceTokenBridgeReturnLayout = layoutItems.amountItem;
export type AllowanceTokenBridgeReturn = LayoutToType<typeof allowanceTokenBridgeReturnLayout>;

export const gasTokenReturnLayout = evmAddressItem;
export type GasTokenReturn = LayoutToType<typeof gasTokenReturnLayout>;

export const relayingFeeParamsLayout = [
  { name: "targetChain", ...supportedChainItem },
  { name: "gasDropoff",  ...gasDropoffItem     },
] as const satisfies Layout;
export type RelayingFeeParams = LayoutToType<typeof relayingFeeParamsLayout>;

export const relayingFeeReturnLayout = [
  { name: "isPaused", ...layoutItems.boolItem },
  { name: "fee",      ...feeItem              },
] as const satisfies Layout;
export type RelayingFeeReturn = LayoutToType<typeof relayingFeeReturnLayout>;

export const baseRelayingConfigParamsLayout = [
  { name: "targetChain", ...supportedChainItem },
] as const satisfies Layout;
export type BaseRelayingConfigParams = LayoutToType<typeof baseRelayingConfigParamsLayout>;

export const baseRelayingConfigReturnLayout = [
  { name: "canonicalPeer", ...layoutItems.universalAddressItem },
  { name: "baseFee",       ...baseFeeItem                      },
  { name: "maxGasDropoff", ...gasDropoffItem                   },
  { name: "paused",        ...layoutItems.boolItem             },
] as const satisfies Layout;
export type BaseRelayingConfigReturn = LayoutToType<typeof baseRelayingConfigReturnLayout>;

const configCommandLayout =
  { 
    binary: "switch",
    idSize: 1,
    idTag: "command",
    layouts: [
      [[ 0x00, "AddPeer"], [
        peerChainItem,
        peerAddressItem
      ]],
      [[ 0x01, "UpdateBaseFee"       ], [peerChainItem, { name: "value", ...baseFeeItem}]],
      [[ 0x02, "UpdateMaxGasDropoff" ], [peerChainItem, { name: "value", ...gasDropoffItem }]],
      [[ 0x03, "UpdateTransferPause" ], [peerChainItem, { name: "value", ...layoutItems.boolItem }]],
      [[ 0x0a, "UpdateFeeRecipient"  ], [{ name: "address",...evmAddressItem }]],
      // Only owner
      [[ 0x0b, "UpdateCanonicalPeer" ], [peerChainItem, peerAddressItem]],
    ]
  } as const satisfies Layout;
export type ConfigCommand = LayoutToType<typeof configCommandLayout>;

export const configQueryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "query",
  layouts: [
    [[0x80, "IsChainSupported"], [peerChainItem]],
    [[0x81, "IsChainPaused"   ], [peerChainItem]],
    [[0x82, "BaseFee"         ], [peerChainItem]],
    [[0x83, "MaxGasDropoff"   ], [peerChainItem]],
    [[0x84, "CanonicalPeer"   ], [peerChainItem]],
    [[0x85, "IsPeer"          ], [peerChainItem, peerAddressItem]],
    [[0x86, "FeeRecipient"    ], []],
  ],
} as const satisfies Layout;
export type ConfigQuery = LayoutToType<typeof configQueryLayout>;

const subArrayLayout = <const N extends string, const L extends Layout>(
  name: N,
  layout: L
) =>
  [
    {
      name,
      binary: "array",
      lengthSize: 1,
      layout: layout,
    },
  ] as const;

export const rootCommandLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "command",
  layouts: [
    [[0x00, "TransferTokenWithRelay"   ], transferTokenWithRelayLayout                     ],
    [[0x01, "TransferGasTokenWithRelay"], transferGasTokenWithRelayLayout                  ],
    [[0x02, "CompleteTransfer"         ], [{ name: "vaa", binary: "bytes", lengthSize: 2 }]],
    [[0x03, "ConfigCommands"           ], subArrayLayout("commands", configCommandLayout)  ],
    [[0x04, "ApproveToken"             ], approveTokenLayout                               ],

    ...accessControlCommandMap,
    ...upgradeCommandLayout,
    ...sweepTokensCommandLayout,
  ],
} as const;
export type RootCommand = LayoutToType<typeof rootCommandLayout>;

export const rootQueryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "query",
  layouts: [
    [[0x80, "RelayFee"            ], relayingFeeParamsLayout                     ],
    [[0x81, "BaseRelayingConfig"  ], baseRelayingConfigParamsLayout              ],
    [[0x82, "ConfigQueries"       ], subArrayLayout("queries", configQueryLayout)],
    [[0x83, "AllowanceTokenBridge"], approveTokenLayout                          ],
    [[0x84, "GasToken"            ], []                                          ],
    ...accessControlQueryMap,
    ...implementationQueryLayout,
  ],
} as const;
export type RootQuery = LayoutToType<typeof rootQueryLayout>;

export const versionEnvelopeLayout = <
  const N extends string,
  const L extends Layout
>(
  name: N,
  layout: L
) =>
  ({
    name: "versionEnvelope",
    binary: "switch",
    idSize: 1,
    idTag: "version",
    layouts: [[0, [{ name, binary: "array", layout }]]],
  } as const);

export const execParamsLayout =
  versionEnvelopeLayout("commands", rootCommandLayout);
export type ExecParams = LayoutToType<typeof execParamsLayout>;

export const queryParamsLayout =
  versionEnvelopeLayout("queries", rootQueryLayout);
export type QueryParams = LayoutToType<typeof queryParamsLayout>;

export const proxyConstructorLayout = [
  { name: "feeRecipient", ...evmAddressItem                                },
  { name: "owner",        ...evmAddressItem                                },
  { name: "admins", binary: "array", lengthSize: 1, layout: evmAddressItem },
] as const satisfies Layout;
export type ProxyConstructor = LayoutToType<typeof proxyConstructorLayout>;
