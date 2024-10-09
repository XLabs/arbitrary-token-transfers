import { BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  TransactionInstruction
} from '@solana/web3.js';
import { CustomConversion, Layout, layout } from '@wormhole-foundation/sdk-base';
//import { programDataLayout } from '@wormhole-foundation/sdk-solana/utils/utils/';
import { throwError } from 'common-arbitrary-token-transfer';

export class BpfLoaderUpgradeableProgram {
  static id = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

  readonly programId: PublicKey;
  private readonly connection: Connection;

  constructor(programId: PublicKey, connection: Connection) {
    this.programId = programId;
    this.connection = connection;
  }

  get dataAddress() {
    return PublicKey.findProgramAddressSync(
      [this.programId.toBuffer()],
      BpfLoaderUpgradeableProgram.id,
    )[0];
  }

  async getdata() {
    const rawData = (await this.connection.getAccountInfo(this.dataAddress))?.data;
    if (rawData === undefined) {
      throw new Error(`Could not read the deployed program: ${this.programId}`);
    }

    const data = layout.deserializeLayout(programDataLayout_, rawData);
    const upgradeAuthority = data.upgradeAuthority.isSome ? data.upgradeAuthority.value : undefined;

    return {
      slot: new BN(data.slot.toString()),
      upgradeAuthority,
    };
  }

  async setAuthority(newAuthority: PublicKey): Promise<TransactionInstruction> {
    const SET_AUTHORITY_CODE = 4;
    const upgradeAuthority =
      (await this.getdata().then((data) => data.upgradeAuthority)) ??
      throwError('Cannot set a new authority as the program is not upgradeable');

    const accountsInfo = [
      {
        pubkey: this.dataAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: upgradeAuthority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: newAuthority,
        isSigner: false,
        isWritable: false,
      },
    ];

    const data = Buffer.alloc(4);
    data.writeUInt32LE(SET_AUTHORITY_CODE);

    return new TransactionInstruction({
      keys: accountsInfo,
      programId: BpfLoaderUpgradeableProgram.id,
      data,
    });
  }
}

export const pubKeyConversion = {
  to: (encoded: Uint8Array) => new PublicKey(encoded),
  from: (decoded: PublicKey) => decoded.toBytes(),
} as const satisfies CustomConversion<Uint8Array, PublicKey>;
const onChainUint = { binary: 'uint', endianness: 'little' } as const;
export const programDataLayout_ = [
  { name: 'programDataEnumVariant', ...onChainUint, size: 4, custom: 3, omit: true },
  { name: 'slot', ...onChainUint, size: 8 },
  {
    name: 'upgradeAuthority',
    binary: 'switch',
    idSize: 1,
    idTag: 'isSome',
    layouts: [
      [[0, false], [{ name: '_lastValueBeforeImmutability', binary: 'bytes', size: 32 }]],
      [[1, true], [{ name: 'value', binary: 'bytes', size: 32, custom: pubKeyConversion }]],
    ],
  },
  { name: 'bytecode', binary: 'bytes' },
] as const satisfies Layout;
