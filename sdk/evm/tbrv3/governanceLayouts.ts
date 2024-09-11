import type {
  Layout,
  LayoutToType,
  NamedLayoutItem,
  CustomConversion,
} from "@wormhole-foundation/sdk-base";
import {
  chainToPlatform,
} from "@wormhole-foundation/sdk-base";
import { UniversalAddress, layoutItems, toUniversal } from "@wormhole-foundation/sdk-definitions";
import { evmAddressItem, gasDropoffItem, supportedChainItem, supportedChains } from "./baseLayouts.js";

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

export const contractItem = {
  name: "contract",
  ...evmAddressItem
} as const satisfies NamedLayoutItem;

export const ownerItem = { 
  name: "owner", 
  ...evmAddressItem 
} as const satisfies NamedLayoutItem;

export const governanceCommandRawLayout = [
  { name: "chain", ...layoutItems.chainItem({ allowedChains: supportedChains }) },
  { name: "command",
    binary: "switch",
    idSize: 1,
    idTag: "name",
    layouts: [
      [[0, "AddPeer"], [{ ...peerItem, name: "value" }]],
      [[1, "SweepTokens"], [{ ...tokenItem, name: "value" }, { ...amountItem, name: "value" }]],
      [[2, "UpdateMaxGasDropoff"], [{ ...maxGasDropoffItem, name: "value" }]],
      [[3, "UpdateFeeRecipien"], [{ ...recipientItem, name: "value" }]],
      [[4, "UpdateRelayFee"], [{ ...feeItem, name: "value" }]],
      [[5, "PauseOutboundTransfers"], [{ ...isPausedItem, name: "value" }]],
      [[6, "UpdateAdmin"], [{ ...adminItem, name: "value" }]],
      [[7, "UpdateCanonicalPeer"], [{ ...peerItem, name: "value" }]],
      [[8, "UpgradeContract"], [{ ...contractItem, name: "value" }]],
      [[9, "ProposeOwnershipTransfer"], [{ ...ownerItem, name: "value" }]],
      [[10, "RelinquishOwnership"], []],
    ]
  }
] as const satisfies Layout;

export type GovernanceCommandRaw = LayoutToType<typeof governanceCommandRawLayout>;
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
    [[0x89, "Admin"], []],
    [[0x8A, "FeeRecipient"], []],
    [[0x8B, "Implementation"], []],

  ],
} as const satisfies Layout;
export type GovernanceQuery = LayoutToType<typeof governanceQueryLayout>;
