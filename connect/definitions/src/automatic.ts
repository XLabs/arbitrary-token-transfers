import { Chain, Network } from "@wormhole-foundation/sdk-base";
import { AccountAddress, EmptyPlatformMap, UnsignedTransaction, VAA } from "@wormhole-foundation/sdk-definitions";
import { RelayingFeesParams, TransferParams } from "./types.js";
import { BaseRelayingParamsReturn, RelayingFeesReturn, SupportedChains } from "./layout.js";

export namespace AutomaticTokenBridgeV3 {
  const _protocol = "AutomaticTokenBridgeV3";
  export type ProtocolName = typeof _protocol;
}

declare module "@wormhole-foundation/sdk-definitions" {
  export namespace WormholeRegistry {
    interface ProtocolToInterfaceMapping<N, C> {
      AutomaticTokenBridgeV3: AutomaticTokenBridgeV3<N, C>;
    }
    interface ProtocolToPlatformMapping {
      AutomaticTokenBridgeV3: EmptyPlatformMap<AutomaticTokenBridgeV3.ProtocolName>;
    }
  }
}

export interface RelayingFee {
  fee: bigint;
  isPaused: boolean;
}

export interface AutomaticTokenBridgeV3<N extends Network, C extends Chain> {
  // TODO: make it accept an array?
  transfer(
    args: TransferParams<C>
  ): AsyncGenerator<UnsignedTransaction<N, C>>;

  redeem(vaa: VAA<'AutomaticTokenBridgeV3:TransferWithRelay'>, payer?: AccountAddress<C>): AsyncGenerator<UnsignedTransaction<N, C>>;

  relayingFee(args: RelayingFeesParams): Promise<RelayingFee>;

  baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturn>;
}