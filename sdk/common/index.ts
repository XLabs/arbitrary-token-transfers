import {
  Chain,
  constMap,
  CustomConversion,
  deserializeLayout,
  Layout,
  LayoutToType,
  MapLevels,
  Network,
  PlatformToChains,
  serializeLayout,
} from '@wormhole-foundation/sdk-base';
import { layoutItems, UniversalAddress, VAA } from '@wormhole-foundation/sdk-definitions';

export type NetworkMain = Exclude<Network, "Devnet">;

type NestedOmit<Schema, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof Schema
    ? {
        [K in keyof Schema]: K extends Head ? NestedOmit<Schema[K], Tail> : Schema[K];
      }
    : Schema
  : Omit<Schema, Path>;

export type VaaMessage = VAA<'TokenBridge:TransferWithPayload'>;
export type TbrV3Payload = LayoutToType<typeof TBRv3MessageLayout>;
export type VaaMessageWithTbrV3Payload = NestedOmit<VaaMessage, 'payload.payload'> & {
  payload: { payload: TbrV3Payload };
};

/** Deserialize the inner payload aka the message: `vaa.payload.payload`. */
export function deserializeTbrV3Message(payload: Uint8Array): TbrV3Payload {
  return deserializeLayout(TBRv3MessageLayout, payload);
}

export function serializeTbrV3Message(message: TbrV3Payload): Uint8Array {
  return serializeLayout(TBRv3MessageLayout, message);
}

export function toVaaWithTbrV3Message(vaa: VaaMessage): VaaMessageWithTbrV3Payload {
  const payload = deserializeTbrV3Message(vaa.payload.payload);

  return { ...vaa, payload: { ...vaa.payload, payload } };
}

export function toVaaRaw(vaa: VaaMessageWithTbrV3Payload): VaaMessage {
  const payload = serializeTbrV3Message(vaa.payload.payload);

  return { ...vaa, payload: { ...vaa.payload, payload } };
}

const decimalDownShift = (downShift: number, roundingFunction: (x: number) => number) => ({
  to: (val: number): number => val / 10 ** downShift,
  from: (price: number): number => {
    const encoded = roundingFunction(price * 10 ** downShift);
    if (encoded === 0 && price !== 0)
      throw new Error(`losing all precision when storing ${price} with shift ${downShift}`);

    return encoded;
  }
} as const satisfies CustomConversion<number, number>);

/**
 * Specifed as: gas token (i.e. eth, avax, ...)
 * Encoded as: µgas token
 */
export const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: decimalDownShift(6, Math.floor),
} as const;

export const TBRv3MessageLayout = [
  //we can turn this into a switch layout if we ever get a version 1
  { name: "version", binary: "uint", size: 1, custom: 0, omit: true },
  { name: "recipient",    ...layoutItems.universalAddressItem       },
  { name: "gasDropoff",   ...gasDropoffItem                         },
  { name: "unwrapIntent", ...layoutItems.boolItem                   },
] as const satisfies Layout;
export type TBRv3Message = LayoutToType<typeof TBRv3MessageLayout>;


// prettier-ignore
export const addresses = [[
  // TODO: update `Tbrv3.connect` parameter type when adding mainnet addresses.
  "Mainnet", [
    ["Solana",          "AtTFrwBjBj5cgm9BCbAFM4jZZUxfJvTL2yz1HqNC3ad7"],
    ["Ethereum",        "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Bsc",             "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Polygon",         "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Avalanche",       "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Optimism",        "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Arbitrum",        "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
    ["Base",            "0xD746bd8157d8DefA1a4b403Dc6a73AE4456F4DC9"],
  ]], [
  "Testnet", [
    ["Solana",          "ATTY1Vt5KY5vtXUTpgwjUJjgNwEBxZ2AUY9M437sDupw"], 
    ["Avalanche",       "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["Celo",            "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["Sepolia",         "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["ArbitrumSepolia", "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["BaseSepolia",     "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["OptimismSepolia", "0xAD6AD1648a18448b7d66B1F20956C19F69cEb9d5"],
    ["PolygonSepolia",  "0x840137D56d8cc11E0546dA882F4ba2Dd99fb340b"]
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tbrV3Contracts = constMap(addresses);
export const tbrV3Chains = tbrV3Contracts.subMap;

export type ChainsForNetwork<N extends NetworkMain> = Parameters<ReturnType<typeof tbrV3Chains<N>>>[number];
export type EvmChainsForNetwork<N extends NetworkMain> = ChainsForNetwork<N> & PlatformToChains<"Evm">;
