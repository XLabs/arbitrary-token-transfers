import { layoutItems } from "@wormhole-foundation/sdk-definitions";
import { evmAddressItem } from "./common.js";

export const sweepTokensCommandLayout = [
  [[0x63, "SweepTokens"], [
      { name: "tokenAddress", ...evmAddressItem },
      { name: "amount", ...layoutItems.amountItem }
  ]],
] as const;
