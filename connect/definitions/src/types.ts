import { amount, Chain } from '@wormhole-foundation/sdk-base';
import {
  AccountAddress,
  ChainAddress,
  layoutItems,
  TokenId,
  UniversalAddress,
} from '@wormhole-foundation/sdk-definitions';
import { tokenBridgeRelayerV3Chains } from './consts.js';

export const supportedChains = Object.values(tokenBridgeRelayerV3Chains);
export const supportedChainItem = layoutItems.chainItem({ allowedChains: supportedChains });
export type SupportedChains = (typeof supportedChains)[number];
export function isSupportedChain(chain: Chain): chain is SupportedChains {
  return supportedChains.includes(chain);
}

export interface BaseRelayingParams {
  canonicalPeer: UniversalAddress;
  paused: boolean;
  maxGasDropoff: number;
  baseFee: number;
}

export interface RelayingFee {
  allowances: Record<string, bigint>;
  fee: bigint;
  isPaused: boolean;
}

export interface TransferParams<C extends Chain> {
  sender: AccountAddress<C>;
  recipient: ChainAddress;
  token: TokenId;
  amount: bigint;
  gasDropOff: amount.Amount;
  fee: number;
  allowances: Record<string, bigint>;
  unwrapIntent: boolean;
}

export type RelayingFeesParams = {
  token: UniversalAddress | "GasToken";
  gasDropoff: bigint;
  targetChain: SupportedChains;
};
