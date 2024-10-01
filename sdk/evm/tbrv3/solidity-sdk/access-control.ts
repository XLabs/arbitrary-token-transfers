import { Layout, LayoutToType, NamedLayoutItem, SwitchLayoutItem } from "@wormhole-foundation/sdk-base";
import { evmAddressLayout, subArrayLayout } from "./common.js";

/**
 * result of calls to Admins
 */
export const adminsQResultItem = { 
    name: "count", 
    binary: "array",
    lengthSize: 1,
    layout: evmAddressLayout, 
} as const satisfies NamedLayoutItem;

export const accessControlCommandLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "command",
  layouts: [
    [[0x00, "RevokeAdmin"], evmAddressLayout],
    [[0x10, "ProposeOwnershipTransfer"], evmAddressLayout],
    [[0x11, "RelinquishOwnership"], []],
    [[0x12, "AddAdmin"], evmAddressLayout],
  ],
} as const satisfies Layout;
export type AccessControlCommand = LayoutToType<typeof accessControlCommandLayout>;

export const accessControlCommandMap = [
  [[0x60, "AccessControlCommands"], subArrayLayout("commands", accessControlCommandLayout)],
  [[0x61, "AcquireOwnership"], []],
] as const satisfies SwitchLayoutItem["layouts"];

export const accessControlQueryLayout = {
  binary: "switch",
  idSize: 1,
  idTag: "query",
  layouts: [
    [[0x80, "Owner"], []],
    [[0x81, "PendingOwner"], []],
    [[0x82, "IsAdmin"], evmAddressLayout],
    [[0x83, "Admins"], []]
  ],
} as const satisfies Layout;
export type AccessControlQuery = LayoutToType<typeof accessControlQueryLayout>;


export const accessControlQueryMap = [
  [[0xe0, "AccessControlQueries"], subArrayLayout("queries", accessControlQueryLayout)],
] as const satisfies SwitchLayoutItem["layouts"];
