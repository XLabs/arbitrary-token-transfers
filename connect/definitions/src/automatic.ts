import { Chain, Network } from "@wormhole-foundation/sdk-base";
import { EmptyPlatformMap, UnsignedTransaction, VAA } from "@wormhole-foundation/sdk-definitions";
import { BaseRelayingParamsReturn, RelayingFeesParams, RelayingFeesReturn, SupportedChains, TransferParams } from "./types.js";

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

export interface AutomaticTokenBridgeV3<N extends Network, C extends Chain> {
  // TODO: make it accept an array?
  transfer(
    args: TransferParams<C>
  ): AsyncGenerator<UnsignedTransaction<N, C>>;

  redeem(vaa: VAA<'AutomaticTokenBridgeV3:TransferWithRelay'>): AsyncGenerator<UnsignedTransaction<N, C>>;

  relayingFee(args: RelayingFeesParams): Promise<RelayingFeesReturn>;

  baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturn>;
}