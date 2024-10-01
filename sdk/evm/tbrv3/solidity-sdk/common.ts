import { CustomConversion, Layout, ManualSizePureBytes } from "@wormhole-foundation/sdk-base";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

export const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array) => new EvmAddress(encoded),
    from: (addr: EvmAddress) => addr.toUint8Array(),
  } satisfies CustomConversion<Uint8Array, EvmAddress>,
} as const satisfies ManualSizePureBytes;

export const evmAddressLayout = [
  { name: "address", ...evmAddressItem },
] as const satisfies Layout;


export const subArrayLayout = <const N extends string, const L extends Layout>(
  name: N,
  layout: L
) =>
  [
    {
      name,
      binary: "array",
      lengthSize: 1,
      layout: layout,
    },
  ] as const;