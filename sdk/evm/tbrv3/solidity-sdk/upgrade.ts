import { SwitchLayoutItem } from "@wormhole-foundation/sdk-base";
import { evmAddressItem } from "./common.js";

export const upgradeCommandLayout = [
  [[0x62, "UpgradeContract"], [{ name: "newImplementation", ...evmAddressItem}]],
] as const satisfies SwitchLayoutItem["layouts"];

export const implementationQueryLayout = [
  [[0xe1, "Implementation"], []],
] as const satisfies SwitchLayoutItem["layouts"];
