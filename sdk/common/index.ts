import {
  CustomConversion,
  Layout,
  layout,
  LayoutItem,
  LayoutToType,
} from '@wormhole-foundation/sdk-base';
import { layoutItems, UniversalAddress, VAA } from '@wormhole-foundation/sdk-definitions';

export type VaaMessage = VAA<'TokenBridge:TransferWithPayload'>;
export type TbrV3Payload = LayoutToType<typeof TBRv3Message>;

export function throwError(message: string): never {
  throw new Error(message);
}

export function deserializeTbrV3Message(vaa: VaaMessage): TbrV3Payload {
  return layout.deserializeLayout(TBRv3Message, vaa.payload.payload);
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
} as const satisfies LayoutItem;

const TBRv3Message = [
  //we can turn this into a switch layout if we ever get a version 1
  { name: 'version', binary: 'uint', size: 1, custom: 0, omit: true },
  { name: 'recipient', ...layoutItems.universalAddressItem },
  { name: 'gasDropoff', ...gasDropoffItem },
  { name: 'unwrapIntent', ...layoutItems.boolItem },
] as const satisfies Layout;
