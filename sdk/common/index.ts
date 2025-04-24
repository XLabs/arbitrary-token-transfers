import {
  CustomConversion,
  deserializeLayout,
  Layout,
  LayoutToType,
  serializeLayout,
} from '@wormhole-foundation/sdk-base';
import { layoutItems, UniversalAddress, VAA } from '@wormhole-foundation/sdk-definitions';

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

const decimalDownShift = (downShift: number) =>
  ({
    to: (val: number): number => val / 10 ** downShift,
    from: (price: number): number => {
      const encoded = Math.round(price * 10 ** downShift);
      if (encoded === 0 && price !== 0)
        throw new Error(`losing all precision when storing ${price} with shift ${downShift}`);

      return encoded;
    },
  }) as const satisfies CustomConversion<number, number>;

//specifed as: gas token (i.e. eth, avax, ...)
// encoded as: µgas token
const gasDropoffItem = {
  binary: 'uint',
  size: 4,
  custom: decimalDownShift(6),
} as const;

export const TBRv3MessageLayout = [
  //we can turn this into a switch layout if we ever get a version 1
  { name: 'version', binary: 'uint', size: 1, custom: 0, omit: true },
  { name: 'recipient', ...layoutItems.universalAddressItem },
  { name: 'gasDropoff', ...gasDropoffItem },
  { name: 'unwrapIntent', ...layoutItems.boolItem },
] as const satisfies Layout;
