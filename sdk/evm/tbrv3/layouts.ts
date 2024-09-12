import { chainToPlatform, ManualSizePureBytes, UintLayoutItem, type Chain, type CustomConversion, type Layout, type LayoutToType, type NamedLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems, toUniversal, type UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";


// TODO: update supported chains to the actual chains supported
export const supportedChains = ["Ethereum", "Solana"] as const satisfies readonly Chain[];
export const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});
export type SupportedChains = typeof supportedChains[number];

export const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array) => new EvmAddress(encoded).toString(),
    from: (addr: string) => new EvmAddress(addr).toUint8Array(),
  } satisfies CustomConversion<Uint8Array, string>,
} as const satisfies ManualSizePureBytes;

export const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: {
    to: (encoded: number): bigint => BigInt(encoded),
    from: (dropoff: bigint): number => Number(dropoff),
  } as const satisfies CustomConversion<number, bigint>,
} as const satisfies UintLayoutItem;

export const subArrayLayout = <const N extends string, const L extends Layout>(
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

export const recipientLayout = [
  { name: "address", ...layoutItems.universalAddressItem },
  { name: "chain", ...supportedChainItem },
] as const satisfies Layout;


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


export const transferTokenWithRelayLayout = [
  { name: "recipient", binary: "bytes", layout: recipientLayout },
  { name: "inputToken", ...evmAddressItem },
  { name: "inputAmount", ...layoutItems.amountItem },
  { name: "gasDropoff", ...gasDropoffItem },
  { name: "unwrapIntent", ...layoutItems.boolItem },
  acquireModeItem,
] as const satisfies Layout;

export const transferGasTokenWithRelayLayout = [
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
   * This is the TBRv3 peer address on the chosen chain.
   */
  peer: UniversalAddress;
  /**
   * If true, outbound transfers are rejected to this chain.
   */
  paused: boolean;
  /**
   * If true, txs sent to this chain are later committed in the Ethereum chain.
   * This is mostly informational as it only matters for quoting prices for relays.
   */
  txCommitEthereum: boolean;
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
  { name: "peer", ...layoutItems.universalAddressItem },
  { name: "paused", ...layoutItems.boolItem },
  { name: "txCommitEthereum", ...layoutItems.boolItem },
  { name: "maxGasDropoff", binary: "uint", size: 4 },
  { name: "baseFee", binary: "uint", size: 4 },
] as const satisfies Layout;


export const tokenItem = {
  name: "token",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const amountItem = {
  name: "amount",
  ...layoutItems.amountItem
} as const satisfies NamedLayoutItem;

export const maxGasDropoffItem = {
  name: "maxGasDropoff",
  ...gasDropoffItem
} as const satisfies NamedLayoutItem;

export const recipientItem = {
  name: "recipient",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const feeItem = {
  name: "fee",
  binary: "uint",
  size: 4
} as const satisfies NamedLayoutItem;

export const isPausedItem = {
  name: "isPaused",
  ...layoutItems.boolItem
} as const satisfies NamedLayoutItem;

export const targetChainItem = {
  name: "targetChain",
  ...supportedChainItem
} as const satisfies NamedLayoutItem;

export const peerItem = {
  name: "peer",
  binary: "bytes",
  size: 32
} as const satisfies NamedLayoutItem;

export const adminItem = {
  name: "admin",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const txSizeSensitiveItem = {
  name: "txSizeSensitive",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const contractItem = {
  name: "contract",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const ownerItem = { 
  name: "owner", 
  ...evmAddressItem 
} as const satisfies NamedLayoutItem;

const addressSubItem = [
  { name: "address", ...evmAddressItem },
] as const satisfies Layout;

const updateAdminLayout = [
  { name: "isAdmin", ...layoutItems.boolItem },
  ...addressSubItem,
] as const satisfies Layout;


const governanceCommandRawLayout = [
  { name: "chain", ...layoutItems.chainItem({ allowedChains: supportedChains }) },
  { name: "command",
    binary: "switch",
    idSize: 1,
    idTag: "name",
    layouts: [
      [[0, "AddPeer"], [{ ...peerItem, name: "value" }]],
      [[1, "SweepTokens"], [{ ...tokenItem, name: "value" }, { ...amountItem, name: "value" }]],
      [[2, "UpdateMaxGasDropoff"], [{ ...maxGasDropoffItem, name: "value" }]],
      [[3, "UpdateFeeRecipient"], [{ ...recipientItem, name: "value" }]],
      [[4, "UpdateRelayFee"], [{ ...feeItem, name: "value" }]],
      [[5, "PauseOutboundTransfers"], [{ ...isPausedItem, name: "value" }]],
      [[6, "UpdateTxSizeSensitive"], [{ ...txSizeSensitiveItem, name: "value" }]],
      [[7, "UpdateAdmin"], [{ ...adminItem, name: "value" }]],
      [[8, "UpdateCanonicalPeer"], [{ ...peerItem, name: "value" }]],
      [[9, "UpgradeContract"], [{ ...contractItem, name: "value" }]],
      [[10, "ProposeOwnershipTransfer"], [{ ...ownerItem, name: "value" }]],
      [[11, "RelinquishOwnership"], []],
    ]
  }
] as const satisfies Layout;

type GovernanceCommandRaw = LayoutToType<typeof governanceCommandRawLayout>;
type ExcludedCommands = {
  readonly name: "AddPeer";
  readonly value: Uint8Array;
} | {
  readonly name: "UpdateCanonicalPeer";
  readonly value: Uint8Array;
};
export type GovernanceCommand = {
  readonly chain: (typeof supportedChains[number]);
  readonly command:
    { readonly name: "AddPeer", value: UniversalAddress } |
    { readonly name: "UpdateCanonicalPeer", value: UniversalAddress } |
    Exclude<GovernanceCommandRaw['command'], ExcludedCommands>
  };

const validNames = governanceCommandRawLayout[1].layouts.map((data) => data[0][1]);
export const governanceLayout = {
  binary: "array",
  lengthSize: 1,
  layout: {
    binary: "bytes",
    layout: governanceCommandRawLayout,
    custom: {
      to: (raw: GovernanceCommandRaw): GovernanceCommand => {
        const platform = chainToPlatform(raw.chain);
        if (raw.command.name === "AddPeer")
          return {
            chain: raw.chain,
            command: {
              name: "AddPeer",
              value: toUniversal(raw.chain, raw.command.value)
            }
          } as GovernanceCommand;
        else if (raw.command.name === "UpdateCanonicalPeer")
          return {
            chain: raw.chain,
            command: {
              name: "UpdateCanonicalPeer",
              value: toUniversal(raw.chain, raw.command.value)
            }
          } as GovernanceCommand;
        
        if(!validNames.includes(raw.command.name))
          throw new Error(`Invalid command ${raw.command.name} for ${platform}`);

        return raw as GovernanceCommand;
      },
      from: (governanceCmd: GovernanceCommand): GovernanceCommandRaw => {
        if (governanceCmd.command.name === "AddPeer")
          return {
            chain: governanceCmd.chain,
            command: {
              name: "AddPeer",
              value: governanceCmd.command.value.toUint8Array()
            }
          } as GovernanceCommandRaw;
        else if (governanceCmd.command.name === "UpdateCanonicalPeer")
          return {
            chain: governanceCmd.chain,
            command: {
              name: "UpdateCanonicalPeer",
              value: governanceCmd.command.value.toUint8Array()
            }
          } as GovernanceCommandRaw;

        return governanceCmd as GovernanceCommandRaw;
      }
    } satisfies CustomConversion<GovernanceCommandRaw, GovernanceCommand>
  }
} as const satisfies Layout;

export type GovernaceCommandsLayout = LayoutToType<typeof governanceLayout>;

export const governanceQueryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "query",
  layouts: [
    [[0x80, "RelayFee"], []],
    [[0x81, "MaxGasDropoff"], []],
    [[0x82, "IsChainPaused"], []],
    [[0x83, "IsPeer"], []],
    [[0x84, "IsTxSixeSensitive"], []],
    [[0x85, "CanonicalPeer"], []],
    [[0x86, "Owner"], []],
    [[0x87, "IsChainSupported"], []],
    [[0x88, "PendingOwner"], []],
    [[0x89, "IsAdmin"], addressSubItem],
    [[0x8A, "FeeRecipient"], []],
    [[0x8B, "Implementation"], []],

  ],
} as const satisfies Layout;
export type GovernanceQuery = LayoutToType<typeof governanceQueryLayout>;

export const dispatcherLayout = {
  name: "dispatcher",
  binary: "switch",
  idSize: 1,
  idTag: "method",
  layouts: [
    //active user methods
    [[0, "TransferTokenWithRelay"], transferTokenWithRelayLayout],
    [[1, "TransferGasTokenWithRelay" ], transferGasTokenWithRelayLayout],
    [[2, "CompleteTransfer"], [{ name: "vaa", binary: "bytes", lengthSize: 2 }]],
    // Governance
    [[3, "GovernanceCommand"], subArrayLayout("commands", governanceLayout)],

    // Queries
    [[0x80, "RelayFee"], relayingFeesInputLayout],
    [[0x81, "BaseRelayingConfig"], baseRelayingConfigInputLayout],
    // Governance
    [[0x82, "GovernanceQuery"], subArrayLayout("queries", governanceQueryLayout)],
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

export const proxyConstructorLayout = [
  { name: "owner", ...evmAddressItem },
  { name: "admin", ...evmAddressItem },
  { name: "feeRecipient", ...evmAddressItem },
] as const satisfies Layout;