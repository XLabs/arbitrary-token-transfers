import { Chain } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainAddress, TokenAddress } from "@wormhole-foundation/sdk-definitions";

export const supportedChains = ["Ethereum", "Solana"] as const satisfies readonly Chain[];
export type SupportedChains = typeof supportedChains[number];

export interface RelayingFeesReturn {
  isPaused: boolean;
  fee: bigint;
}

export interface BaseRelayingParamsReturn {
  maxGasDropoff: bigint;
  baseFee: bigint;
}

export interface TransferParams<C extends Chain> {
  sender: AccountAddress<C>;
  recipient: ChainAddress;
  token: TokenAddress<C>;
  amount: bigint;
  gasDropOff?: bigint;
}

export interface RelayingFeesParams {
  targetChain: SupportedChains;
  gasDropoff: bigint;
}
