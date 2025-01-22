import { BN } from '@coral-xyz/anchor';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  Connection,
  LAMPORTS_PER_SOL,
  Keypair,
  AccountInfo,
  Signer,
  SystemProgram,
  sendAndConfirmTransaction,
  Finality,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { Contracts, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { ChainConfigAccount } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { expect } from 'chai';
import * as toml from 'toml';
import fs from 'fs/promises';
import fsSync from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { isTypedArray } from 'util/types';

const execAsync = promisify(exec);

export interface ErrorConstructor {
  new (...args: any[]): Error;
}

export const assert = {
  bn: (left: BN) => ({
    equal: (right: BN) => expect(left.toString()).equal(right.toString()),
  }),

  chainConfig: (left: ChainConfigAccount) => ({
    equal: (right: ChainConfigAccount) => {
      expect(left.chainId).equal(right.chainId);
      expect(left.canonicalPeer).deep.equal(right.canonicalPeer);
      expect(left.maxGasDropoffMicroToken).equal(right.maxGasDropoffMicroToken);
      expect(left.relayerFeeMicroUsd).equal(right.relayerFeeMicroUsd);
      expect(left.pausedOutboundTransfers).equal(right.pausedOutboundTransfers);
    },
  }),

  promise: (prom: Promise<unknown>) => ({
    fails: async (errorType?: ErrorConstructor) => {
      let result: any;
      try {
        result = await prom;
      } catch (error: any) {
        if (errorType != null && !(error instanceof errorType)) {
          throw { message: 'Error is not of the asked type', stack: error.toString() };
        }
        return;
      }
      throw new Error(`Promise did not fail. Result: ${result}`);
    },
    failsWith: async (message: string) => {
      let result: any;
      try {
        result = await prom;
      } catch (error: any) {
        const errorStr: string = error.toString();
        if (errorStr.includes(message)) {
          return;
        }
        throw { message: 'Error does not contain the asked message', stack: errorStr };
      }
      throw new Error(`Promise did not fail. Result: ${result}`);
    },
  }),

  array: <T>(left: T[]) => ({
    equal: (right: T[]) => {
      left = [...left];
      right = [...right];
      left.sort();
      right.sort();

      expect(left).deep.equal(right);
    },
  }),
};

type HasPublicKey = PublicKey | Keypair | UniversalAddress | number[] | Uint8Array | Signer;
function extractPubkey(from: HasPublicKey): PublicKey {
  if (from instanceof PublicKey) {
    return from;
  } else if (from instanceof Keypair) {
    return from.publicKey;
  } else if (from instanceof UniversalAddress) {
    return new PublicKey(from.toUint8Array());
  } else if (Array.isArray(from)) {
    return Keypair.fromSecretKey(Uint8Array.from(from)).publicKey;
  } else if (isTypedArray(from)) {
    return Keypair.fromSecretKey(from).publicKey;
  } else {
    return from.publicKey;
  }
}

type Tuple<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : Tuple<T, N, [T, ...R]>;

export class TestsHelper {
  static readonly LOCALHOST = 'http://localhost:8899';
  readonly connection: Connection;
  readonly finality: Finality;

  /** Connections cache. */
  private static readonly connections: Partial<Record<Finality, Connection>> = {};

  constructor(finality: Finality = 'confirmed') {
    if (TestsHelper.connections[finality] === undefined) {
      TestsHelper.connections[finality] = new Connection(TestsHelper.LOCALHOST, finality);
    }
    this.connection = TestsHelper.connections[finality];
    this.finality = finality;
  }

  pubkey = {
    generate: (): PublicKey => PublicKey.unique(),
    read: async (path: string): Promise<PublicKey> =>
      this.keypair.read(path).then((kp) => kp.publicKey),
    from: (hasPublicKey: HasPublicKey): PublicKey => extractPubkey(hasPublicKey),
    several: <N extends number>(amount: number): Tuple<PublicKey, N> =>
      Array.from({ length: amount }).map(PublicKey.unique) as Tuple<PublicKey, N>,
  };

  keypair = {
    generate: (): Keypair => Keypair.generate(),
    read: async (path: string): Promise<Keypair> =>
      this.keypair.from(JSON.parse(await fs.readFile(path, { encoding: 'utf8' }))),
    from: (bytes: number[]): Keypair => Keypair.fromSecretKey(Uint8Array.from(bytes)),
    several: <N extends number>(amount: N): Tuple<Keypair, N> =>
      Array.from({ length: amount }).map(Keypair.generate) as Tuple<Keypair, N>,
  };

  universalAddress = {
    generate: (ethereum?: 'ethereum'): UniversalAddress =>
      ethereum === 'ethereum'
        ? new UniversalAddress(
            Buffer.concat([Buffer.alloc(12), PublicKey.unique().toBuffer().subarray(12)]),
          )
        : new UniversalAddress(PublicKey.unique().toBuffer()),
    several: <N extends number>(
      amount: number,
      ethereum?: 'ethereum',
    ): Tuple<UniversalAddress, N> =>
      Array.from({ length: amount }).map(() => this.universalAddress.generate(ethereum)) as Tuple<
        UniversalAddress,
        N
      >,
  };

  /** Waits that a transaction is confirmed. */
  async confirm(signature: TransactionSignature) {
    const latestBlockHash = await this.connection.getLatestBlockhash();

    return this.connection.confirmTransaction({
      signature,
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    });
  }

  async sendAndConfirm(
    ixs: TransactionInstruction | Transaction | Array<TransactionInstruction>,
    payer: Signer,
    ...signers: Signer[]
  ): Promise<TransactionSignature> {
    return sendAndConfirm(this.connection, ixs, payer, ...signers);
  }

  async getTransaction(
    signature: TransactionSignature | Promise<TransactionSignature>,
  ): Promise<VersionedTransactionResponse | null> {
    return this.connection.getTransaction(await signature, {
      commitment: this.finality,
      maxSupportedTransactionVersion: 1,
    });
  }

  /** Requests airdrop to an account or several ones. */
  async airdrop<T extends HasPublicKey | HasPublicKey[]>(to: T): Promise<T> {
    const request = async (account: PublicKey) =>
      this.confirm(await this.connection.requestAirdrop(account, 50 * LAMPORTS_PER_SOL));

    if (Array.isArray(to) && to.every((value) => typeof value !== 'number')) {
      await Promise.all(to.map((account) => request(extractPubkey(account))));
    } else {
      await request(extractPubkey(to));
    }

    return to;
  }

  /** Creates a new account and transfers wrapped SOL to it. */
  async wrapSol(signer: Signer, amount: number): Promise<Keypair> {
    const tokenAccount = Keypair.generate();

    const tx = new Transaction().add(
      // Allocate account:
      SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: spl.ACCOUNT_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptAccount(this.connection),
        programId: spl.TOKEN_PROGRAM_ID,
      }),
      // Initialize token account:
      spl.createInitializeAccountInstruction(
        tokenAccount.publicKey,
        spl.NATIVE_MINT,
        signer.publicKey,
      ),
      // Transfer SOL:
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: tokenAccount.publicKey,
        lamports: amount,
      }),
      // Move the lamports as wSOL:
      spl.createSyncNativeInstruction(tokenAccount.publicKey),
    );

    await this.sendAndConfirm(tx, signer, tokenAccount);

    return tokenAccount;
  }

  /** Deploys a new program. */
  async deploy(paths: { programKeypair: string; authorityKeypair: string; binary: string }) {
    const { programKeypair, authorityKeypair, binary } = paths;
    const BpfProgramId = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

    // Deploy:
    await execAsync(
      `solana --url ${TestsHelper.LOCALHOST} -k ${authorityKeypair} program deploy ${binary} --program-id ${programKeypair}`,
    );

    // Wait for deploy to be finalized. Don't remove.
    const programId = await this.pubkey.read(programKeypair);
    const programDataAddress = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      BpfProgramId,
    )[0];
    let programAccount: AccountInfo<Buffer> | null = null;
    while (programAccount === null) {
      programAccount = await this.connection.getAccountInfo(programDataAddress, 'finalized');
    }
    //console.log('Found programAccount:', { programDataAddress, programId, programAccount });
  }
}

export class TestMint {
  private authority: Signer;

  readonly connection: Connection;
  readonly address: PublicKey;
  readonly decimals: number;

  private constructor(
    connection: Connection,
    authority: Signer,
    address: PublicKey,
    decimals: number,
  ) {
    this.authority = authority;
    this.connection = connection;
    this.address = address;
    this.decimals = decimals;
  }

  static async create(
    connection: Connection,
    authority: Signer,
    decimals: number,
  ): Promise<TestMint> {
    return new TestMint(
      connection,
      authority,
      await spl.createMint(
        connection,
        authority,
        authority.publicKey,
        authority.publicKey,
        decimals,
      ),
      decimals,
    );
  }

  async mint(amount: number | bigint, accountAuthority: Signer) {
    const tokenAccount = Keypair.generate();

    const tx = new Transaction().add(
      // Allocate account:
      SystemProgram.createAccount({
        fromPubkey: accountAuthority.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: spl.ACCOUNT_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptAccount(this.connection),
        programId: spl.TOKEN_PROGRAM_ID,
      }),
      // Initialize token account:
      spl.createInitializeAccountInstruction(
        tokenAccount.publicKey,
        this.address,
        accountAuthority.publicKey,
      ),
      // Mint the tokens to the newly created account:
      spl.createMintToCheckedInstruction(
        this.address,
        tokenAccount.publicKey,
        this.authority.publicKey,
        amount,
        this.decimals,
      ),
    );

    await sendAndConfirm(this.connection, tx, accountAuthority, this.authority, tokenAccount);

    return tokenAccount;
  }
}

/** Helper allowing to abstract over the Wormhole configuration (network and addresses) */
export class WormholeContracts {
  static Network = 'Devnet' as const;

  private static core: PublicKey = PublicKey.default;
  private static token: PublicKey;
  private static mplTokenMetadata: PublicKey;

  static get coreBridge(): PublicKey {
    WormholeContracts.init();
    return WormholeContracts.core;
  }
  static get tokenBridge(): PublicKey {
    WormholeContracts.init();
    return WormholeContracts.token;
  }
  static get splMetadata(): PublicKey {
    WormholeContracts.init();
    return WormholeContracts.mplTokenMetadata;
  }

  static get addresses(): Contracts {
    WormholeContracts.init();
    return {
      coreBridge: WormholeContracts.core.toString(),
      tokenBridge: WormholeContracts.token.toString(),
    };
  }

  private static init() {
    if (WormholeContracts.core.equals(PublicKey.default)) {
      const anchorCfg = toml.parse(fsSync.readFileSync('./Anchor.toml', 'utf-8'));

      WormholeContracts.core = new PublicKey(
        anchorCfg.test.genesis.find((cfg: any) => cfg.name == 'wormhole-core').address,
      );
      WormholeContracts.token = new PublicKey(
        anchorCfg.test.genesis.find((cfg: any) => cfg.name == 'wormhole-bridge').address,
      );
      WormholeContracts.mplTokenMetadata = new PublicKey(
        anchorCfg.test.genesis.find((cfg: any) => cfg.name == 'mpl-token-metadata').address,
      );
    }
  }
}

export function tokenBridgeEmitter(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('emitter')],
    WormholeContracts.tokenBridge,
  )[0];
}

export async function getBlockTime(connection: Connection): Promise<number> {
  // This should never fail.
  return connection
    .getSlot()
    .then(async (slot) => connection.getBlockTime(slot))
    .then((value) => value!);
}

export async function sendAndConfirm(
  connection: Connection,
  ixs: TransactionInstruction | Transaction | Array<TransactionInstruction>,
  payer: Signer,
  ...signers: Signer[]
): Promise<TransactionSignature> {
  const { value } = await connection.getLatestBlockhashAndContext();
  const tx = new Transaction({
    ...value,
    feePayer: payer.publicKey,
  }).add(...(Array.isArray(ixs) ? ixs : [ixs]));

  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {});
}
