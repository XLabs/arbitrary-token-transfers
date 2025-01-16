import { evmAddressItem } from "./common.js";

export const upgradeCommandLayout = [
  [[0x62, "UpgradeContract"], [{ name: "newImplementation", ...evmAddressItem}]],
] as const;

export const implementationQueryLayout = [
  [[0xe1, "Implementation"], []],
] as const;
