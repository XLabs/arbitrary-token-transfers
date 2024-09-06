import { NamedPayloads, RegisterPayloadTypes, registerPayloadTypes, transferWithPayloadLayout } from "@wormhole-foundation/sdk-definitions";
import { TBRv3Message } from "./layout.js";

const automaticTokenBridgeV3NamedPayloads = [
  [
    "TransferWithRelay", transferWithPayloadLayout(TBRv3Message)
  ]
] as const satisfies NamedPayloads;

registerPayloadTypes("AutomaticTokenBridgeV3", automaticTokenBridgeV3NamedPayloads)

declare module "@wormhole-foundation/sdk-definitions" {
  export namespace WormholeRegistry {
    interface PayloadLiteralToLayoutMapping
      extends RegisterPayloadTypes<
        "AutomaticTokenBridgeV3",
        typeof automaticTokenBridgeV3NamedPayloads
      > {}
  }
}

export * from "./automatic.js";
export * from "./layout.js";
export * from "./consts.js";
export * from "./types.js";
