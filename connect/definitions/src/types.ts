import { amount, Chain } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainAddress, layoutItems, TokenId, UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { tokenBridgeRelayerV3Chains } from "./consts.js";

export const supportedChains = Object.values(tokenBridgeRelayerV3Chains);
export const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains });
export type SupportedChains = typeof supportedChains[number];
export function isSupportedChain(chain: Chain): chain is SupportedChains {
  return supportedChains.includes(chain);
}

export interface BaseRelayingParams {
  peer: UniversalAddress;
  paused: boolean;
  maxGasDropoff: number;
  baseFee: number;
}

export interface TransferParams<C extends Chain> {
  sender: AccountAddress<C>;
  recipient: ChainAddress;
  token: TokenId;
  amount: bigint;
  gasDropOff: amount.Amount;
  fee: number;
  unwrapIntent: boolean;
}

export type RelayingFeesParams = {
  gasDropoff: bigint;
  targetChain: SupportedChains;
};
