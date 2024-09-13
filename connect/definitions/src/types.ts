import { Chain, LayoutToType } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainAddress, TokenAddress, TokenId } from "@wormhole-foundation/sdk-definitions";
import { acquireModeItem, relayingFeesInputLayout, SupportedChains } from "./layout.js";

// export type SupportedChains = typeof supportedChains[number];

// export interface RelayingFeesReturn {
//   isPaused: boolean;
//   fee: bigint;
// }

// export interface BaseRelayingParamsReturn {
//   maxGasDropoff: bigint;
//   baseFee: bigint;
// }

export interface TransferParams<C extends Chain> {
  sender: AccountAddress<C>;
  recipient: ChainAddress;
  token: TokenId;
  amount: bigint;
  gasDropOff?: bigint;
}

// export interface RelayingFeesParams {
//   targetChain: SupportedChains;
//   gasDropoff: bigint;
// }
export type RelayingFeesParams = LayoutToType<typeof relayingFeesInputLayout>;

export type AcquireMode = LayoutToType<typeof acquireModeItem>;
