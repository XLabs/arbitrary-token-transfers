import { Chain, CustomConversion, Layout, ManualSizePureBytes, NamedLayoutItem, UintLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

// TODO: update supported chains to the actual chains supported
export const supportedChains = ["Ethereum", "Solana"] as const satisfies readonly Chain[];
export const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});

export type SupportedChains = typeof supportedChains[number];

export const recipientLayout = [
  { name: "address", ...layoutItems.universalAddressItem },
  { name: "chain", ...supportedChainItem },
] as const satisfies Layout;

export const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array) => new EvmAddress(encoded).toString(),
    from: (addr: string) => new EvmAddress(addr).toUint8Array(),
  } satisfies CustomConversion<Uint8Array, string>,
} as const satisfies ManualSizePureBytes;

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

/**
 * Currently Twei in EVM and Klamport in Solana.
 * @dev Must match the units documented in Tbrv3::<TODO put function name here>
 */
export function gasDropoffUnit(chain: SupportedChains): bigint {
  if (chain === "Ethereum") return BigInt(1e12);
  if (chain === "Solana") return BigInt(1e3);
  throw new Error(`Unknown/unsupported chain ${chain}.`);
}

export const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: {
    to: (encoded: number): bigint => BigInt(encoded),
    from: (dropoff: bigint): number => Number(dropoff),
  } as const satisfies CustomConversion<number, bigint>,
} as const satisfies UintLayoutItem;

export const transferTokenWithRelayLayout = [
  { name: "recipient", binary: "bytes", layout: recipientLayout },
  { name: "inputToken", ...evmAddressItem },
  { name: "inputAmount", ...layoutItems.amountItem },
  { name: "gasDropoff", ...gasDropoffItem },
  { name: "maxFee", ...layoutItems.amountItem },
  { name: "unwrapIntent", ...layoutItems.boolItem },
  acquireModeItem,
] as const satisfies Layout;

export const wrapAndTransferGasTokenWithRelayLayout = [
  { name: "recipient", binary: "bytes", layout: recipientLayout },
  // msg.value - inputAmount = maxFee(*)
  { name: "inputAmount", ...layoutItems.amountItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

export const relayingFeesInputLayout = [
  { name: "targetChain", ...supportedChainItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

export const relayingFeesReturnLayout = [
  { name: "isPaused", ...layoutItems.boolItem },
  { name: "fee", binary: "uint", size: 8 },
] as const satisfies Layout;

/**
 * This is the unit for fees returned by `RelayFee` command.
 */
export const relayFeeUnit = BigInt(1e6);
/**
 * This is the response schema for a single `RelayFee` command.
 */
export interface RelayingFeesReturnItem {
  /**
   * If outbound transfers towards the target chain are paused, this will be `true`.
   */
  readonly isPaused: boolean;
  /**
   * The fee is denominated in Mwei of the source chain native token, i.e. 10^6 wei.
   */
  readonly fee: bigint;
}

export type RelayingFeesReturn = readonly RelayingFeesReturnItem[];

export const maxGasDropoffLayout = { name: "targetChain", ...supportedChainItem } as const satisfies NamedLayoutItem;
export interface BaseRelayingParamsReturnItem {
  /**
   * This is denominated in μETH or equivalent for EVM native tokens.
   * Equivalently, Twei, 10 ** 12 wei.
   */
  maxGasDropoff: number;
  /**
   * The base fee is denominated in μusd.
   * This is added on top of the chain cost quote.
   * For small quotes, it might not be added in its entirety.
   * @todo update description once the implementation is settled.
   */
  baseFee: number;
}
export type BaseRelayingParamsReturn = readonly BaseRelayingParamsReturnItem[];

export const baseRelayingConfigInputLayout = [
  { name: "targetChain", ...supportedChainItem },
] as const satisfies Layout;

export const baseRelayingConfigReturnLayout = [
  { name: "maxGasDropoff", binary: "uint", size: 4 },
  { name: "baseFee", binary: "uint", size: 4 },
] as const satisfies Layout;

export const dispatcherLayout = {
  name: "dispatcher",
  binary: "switch",
  idSize: 1,
  idTag: "method",
  layouts: [
    //active user methods
    [[0, "TransferTokenWithRelay"], transferTokenWithRelayLayout],
    [[1, "WrapAndTransferGasTokenWithRelay" ], wrapAndTransferGasTokenWithRelayLayout],
    [[2, "Complete"], [{ name: "vaa", binary: "bytes" }]],
    //TODO governance methods

    // Queries
    [[0x80, "RelayFee"], relayingFeesInputLayout],
    [[0x81, "BaseRelayingConfig"], baseRelayingConfigInputLayout],
  ]
} as const satisfies NamedLayoutItem;

export const versionEnvelopeLayout = {
  name: "versionEnvelope",
  binary: "switch",
  idSize: 1,
  idTag: "version",
  layouts: [
    [[0, "Version0"], [{
      name: "methods",
      binary: "array",
      layout: dispatcherLayout,
    }]],
  ]
} as const satisfies NamedLayoutItem;

export const TBRv3Message = [
  { name: "recipient", ...layoutItems.universalAddressItem },
  { name: "gasDropoff", ...gasDropoffItem },
  { name: "unwrapIntent", ...layoutItems.boolItem },
] as const satisfies Layout;

export const versionedTbrMessageLayout = {
  name: "versionedMessage",
  binary: "switch",
  idSize: 1,
  idTag: "version",
  layouts: [
    [[0, "Version3"], [{
      name: "message",
      binary: "bytes",
      layout: TBRv3Message,
    }]],
  ]
} as const satisfies NamedLayoutItem;