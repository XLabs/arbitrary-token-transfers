import { Chain, CustomConversion, Layout, ManualSizePureBytes, UintLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

// TODO: update supported chains to the actual chains supported
export const supportedChains = ["Ethereum", "Solana"] as const satisfies readonly Chain[];
export const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});

export const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array) => new EvmAddress(encoded).toString(),
    from: (addr: string) => new EvmAddress(addr).toUint8Array(),
  } satisfies CustomConversion<Uint8Array, string>,
} as const satisfies ManualSizePureBytes;

export const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: {
    to: (encoded: number): bigint => BigInt(encoded),
    from: (dropoff: bigint): number => Number(dropoff),
  } as const satisfies CustomConversion<number, bigint>,
} as const satisfies UintLayoutItem;

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