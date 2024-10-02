import type { Chain, CustomConversion, Layout, LayoutToType, LayoutItem, NamedLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems, type UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

// TODO: update supported chains to the actual chains supported
export const supportedChains = ["Ethereum", "Solana", "Arbitrum", "Base", "Sepolia", "BaseSepolia", "OptimismSepolia"] as const satisfies readonly Chain[];
const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});
export type SupportedChains = typeof supportedChains[number];

const peerChainItem = {
  name: "chain", ...layoutItems.chainItem({ allowedChains: supportedChains }) 
} as const satisfies NamedLayoutItem;

const peerChainAndAddressItem = {
  binary: "bytes",
  layout: [
    peerChainItem,
    { name: "address", ...layoutItems.universalAddressItem }
  ]
} as const;

export const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array) => new EvmAddress(encoded).toString(),
    from: (addr: string) => new EvmAddress(addr).toUint8Array(),
  } satisfies CustomConversion<Uint8Array, string>,
} as const satisfies LayoutItem;

//TODO eliminate copy paste from oracle sdk and unify in some shared repo
const decimalDownShift = (downShift: number) => ({
  to: (val: number): number => val / 10 ** downShift,
  from: (price: number): number => {
    const encoded = Math.round(price * 10 ** downShift);
    if (encoded === 0 && price !== 0)
      throw new Error(`losing all precision when storing ${price} with shift ${downShift}`);

    return encoded;
  }
} as const satisfies CustomConversion<number, number>);

/**
 * Specifed as: gas token (i.e. eth, avax, ...)
 * Encoded as: µgas token
 */
export const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: decimalDownShift(6),
} as const satisfies LayoutItem;

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
} as const satisfies LayoutItem;

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
} as const satisfies NamedLayoutItem;

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

export const transferTokenWithRelayLayout = [
  ...sharedTransferLayout,
  { name: "inputToken", ...evmAddressItem },
  { name: "unwrapIntent", ...layoutItems.boolItem },
  acquireModeItem,
] as const satisfies Layout;

export const relayingFeesInputLayout = [
  { name: "targetChain", ...supportedChainItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

/**
 * This is the response schema for a single `RelayFee` command.
 */
export interface RelayingFee {
  /**
   * If outbound transfers towards the target chain are paused, this will be `true`.
   */
  readonly isPaused: boolean;
  /**
   * The fee is denominated in the gas token unit of the source chain native token, e.g. ETH, AVAX, etc.
   */
  readonly fee: number;
}
export type RelayingFeesReturn = readonly RelayingFee[];

export const relayingFeesReturnLayout = [
  { name: "isPaused", ...layoutItems.boolItem },
  { name: "fee", ...feeItem },
] as const satisfies Layout;

export interface BaseRelayingParams {
  /**
   * This is the TBRv3 peer address on the chosen chain.
   */
  peer: UniversalAddress;
  /**
   * If true, outbound transfers are rejected to this chain.
   */
  paused: boolean;
  /**
   * If true, txs sent to this chain require factoring in the size when quoting relay costs.
   * Usually, this is because they are later committed in the Ethereum chain.
   * This is mostly informational as it only matters for quoting prices for relays.
   */
  txSizeSensitive: boolean;
  /**
   * This is denominated in μETH or equivalent for EVM native tokens.
   * Equivalently, Twei, 10 ** 12 wei.
   */
  maxGasDropoff: number;
  /**
   * The base fee is denominated in usd.
   * This is added on top of the chain tx cost quote.
   * For small quotes, it might not be added in its entirety.
   * @todo update description once the implementation is settled.
   */
  baseFee: number;
}
export type BaseRelayingParamsReturn = readonly BaseRelayingParams[];

export const baseRelayingConfigInputLayout = [
  { name: "targetChain", ...supportedChainItem },
] as const satisfies Layout;

export const baseRelayingConfigReturnLayout = [
  { name: "peer", ...layoutItems.universalAddressItem },
  { name: "baseFee", ...baseFeeItem},
  { name: "maxGasDropoff", ...gasDropoffItem },
  { name: "paused", ...layoutItems.boolItem },
  { name: "txSizeSensitive", ...layoutItems.boolItem },
] as const satisfies Layout;

const governanceCommandLayout = 
  { 
    binary: "switch",
    idSize: 1,
    idTag: "command",
    layouts: [
      [[ 0, "AddPeer"], [
        peerChainItem,
        { name: "address", ...layoutItems.universalAddressItem }
      ]],
      [[ 1, "UpdateBaseFee"           ], [peerChainItem, { name: "value", ...baseFeeItem}]],
      [[ 2, "UpdateMaxGasDropoff"     ], [peerChainItem, { name: "value", ...gasDropoffItem }]],
      [[ 3, "UpdateTransferPause"     ], [peerChainItem, { name: "value", ...layoutItems.boolItem }]],
      [[ 4, "UpdateTxSizeSensitive"   ], [peerChainItem, { name: "value", ...layoutItems.boolItem }]],

      [[ 10, "SweepTokens"], [
        { name: "address", ...evmAddressItem },
        { name: "amount", ...layoutItems.amountItem }
      ]],
      [[ 11, "UpdateFeeRecipient"      ], [{ name: "address",...evmAddressItem }]],

      // Only owner
      [[ 12, "UpdateAdmin"             ], [{ name: "address",...evmAddressItem }, { name: "isAdmin", ...layoutItems.boolItem }]],
      [[ 13, "UpdateCanonicalPeer"     ], [peerChainItem, { name: "address", ...layoutItems.universalAddressItem }]],
      [[ 14, "UpgradeContract"         ], [{ name: "address",...evmAddressItem }]],
      [[ 15, "ProposeOwnershipTransfer"], [{ name: "address",...evmAddressItem }]],
      [[ 16, "RelinquishOwnership"     ], []],
    ]
  } as const satisfies Layout;

export type GovernanceCommand = LayoutToType<typeof governanceCommandLayout>;

export const governanceQueryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "query",
  layouts: [
    [[0x80, "BaseFee"], [peerChainItem]],
    [[0x81, "MaxGasDropoff"], [peerChainItem]],
    [[0x82, "IsChainPaused"], [peerChainItem]],
    [[0x83, "IsPeer"], [peerChainItem, { name: "address", ...layoutItems.universalAddressItem }]],
    [[0x84, "IsTxSizeSensitive"], [peerChainItem]],
    [[0x85, "CanonicalPeer"], [peerChainItem]],
    [[0x86, "IsChainSupported"], [peerChainItem]],
    [[0x87, "Owner"], []],
    [[0x88, "PendingOwner"], []],
    [[0x89, "IsAdmin"], [{ name: "address", ...evmAddressItem }]],
    [[0x8A, "FeeRecipient"], []],
    [[0x8B, "Implementation"], []],
  ],
} as const satisfies Layout;
export type GovernanceQuery = LayoutToType<typeof governanceQueryLayout>;

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

export const commandCategoryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "commandCategory",
  layouts: [
    [[0, "TransferTokenWithRelay"], transferTokenWithRelayLayout],
    [[1, "TransferGasTokenWithRelay" ], transferGasTokenWithRelayLayout],
    [[2, "CompleteTransfer"], [{ name: "vaa", binary: "bytes", lengthSize: 2 }]],
    [[3, "GovernanceCommands"], subArrayLayout("commands", governanceCommandLayout)],
  ],
} as const;
export type CommandCategory = LayoutToType<typeof commandCategoryLayout>;

export const queryCategoryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "queryCategory",
  layouts: [
    [[0x80, "RelayFee"], relayingFeesInputLayout],
    [[0x81, "BaseRelayingConfig"], baseRelayingConfigInputLayout],
    [[0x82, "GovernanceQueries"], subArrayLayout("queries", governanceQueryLayout)],
  ],
} as const;
export type QueryCategory = LayoutToType<typeof queryCategoryLayout>;

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
  versionEnvelopeLayout("commandCategories", commandCategoryLayout);
export type ExecParams = LayoutToType<typeof execParamsLayout>;

export const queryParamsLayout =
  versionEnvelopeLayout("queryCategories", queryCategoryLayout);
export type QueryParams = LayoutToType<typeof queryParamsLayout>;

export const TBRv3Message = [ //we can turn this into a switch layout if we ever get a version 1
  { name: "version", binary: "uint", size: 1, custom: 0, omit: true },
  { name: "recipient", ...layoutItems.universalAddressItem },
  { name: "gasDropoff", ...gasDropoffItem },
  { name: "unwrapIntent", ...layoutItems.boolItem },
] as const satisfies Layout;

export const proxyConstructorLayout = [
  { name: "owner", ...evmAddressItem },
  { name: "admin", ...evmAddressItem },
  { name: "feeRecipient", ...evmAddressItem },
] as const satisfies Layout;
