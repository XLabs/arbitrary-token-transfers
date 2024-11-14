import { AnchorProvider, BN, Provider, Wallet } from '@coral-xyz/anchor';
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
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { Contracts } from '@wormhole-foundation/sdk-definitions';
import { ChainConfigAccount } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { expect } from 'chai';
import * as toml from 'toml';
import fs from 'fs/promises';
import fsSync from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const LOCALHOST = 'http://localhost:8899';

type ProviderWallet = AnchorProvider['wallet'];

export interface ErrorConstructor {
  new (...args: any[]): Error;
}

export const assert = {
  bn: (left: BN) => ({
    equal: (right: BN) => expect(left.toString()).equal(right.toString()),
  }),

  key: (left: PublicKey) => ({
    equal: (right: PublicKey) => expect(left.toString()).equal(right.toString()),
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

export async function sendAndConfirmIxs(
  provider: AnchorProvider,
  ixs: TransactionInstruction | Transaction | Array<TransactionInstruction>,
  signatures: { signers?: Signer[]; wallets?: ProviderWallet[] } = {},
): Promise<TransactionSignature> {
  const tx = Array.isArray(ixs) ? new Transaction().add(...ixs) : new Transaction().add(ixs);
  tx.recentBlockhash = await provider.connection.getLatestBlockhash().then((ans) => ans.blockhash);
  tx.feePayer = provider.publicKey;

  for (const wallet of signatures.wallets ?? []) {
    await wallet.signTransaction(tx);
  }

  return provider.sendAndConfirm(tx, signatures.signers);
}

type HasPublicKey = PublicKey | Keypair | Wallet | Provider;
function extractPubkey(from: HasPublicKey): PublicKey {
  if (from instanceof PublicKey) {
    return from;
  } else if (from instanceof Keypair) {
    return from.publicKey;
  } else if (from instanceof Wallet) {
    return from.publicKey;
  } else if (from.publicKey !== undefined) {
    return from.publicKey;
  } else {
    throw new Error('The provider must have a public key to request airdrop');
  }
}

export class TestsHelper {
  static readonly LOCALHOST = 'http://localhost:8899';
  readonly connection: Connection;

  private static readonly connections: Partial<
    Record<'processed' | 'confirmed' | 'finalized', Connection>
  > = {};

  constructor(commitment: 'processed' | 'confirmed' | 'finalized' = 'processed') {
    if (TestsHelper.connections[commitment] === undefined) {
      TestsHelper.connections[commitment] = new Connection(LOCALHOST, commitment);
    }
    this.connection = TestsHelper.connections[commitment];
  }

  pubkey = {
    read: async (path: string): Promise<PublicKey> =>
      this.keypair.read(path).then((kp) => kp.publicKey),
    from: (bytes: number[]): PublicKey => this.keypair.from(bytes).publicKey,
  };

  keypair = {
    read: async (path: string): Promise<Keypair> =>
      this.keypair.from(JSON.parse(await fs.readFile(path, { encoding: 'utf8' }))),
    from: (bytes: number[]): Keypair => Keypair.fromSecretKey(Uint8Array.from(bytes)),
    several: (amount: number): Keypair[] => Array.from({ length: amount }).map(Keypair.generate),
  };

  provider = {
    generate: (): TestProvider => new TestProvider(this.connection, Keypair.generate()),
    read: async (path: string): Promise<TestProvider> =>
      new TestProvider(this.connection, await this.keypair.read(path)),
    from: (bytesOrKeypair: number[] | Keypair): TestProvider =>
      new TestProvider(
        this.connection,
        Array.isArray(bytesOrKeypair) ? this.keypair.from(bytesOrKeypair) : bytesOrKeypair,
      ),
    several: (amount: number): TestProvider[] =>
      Array.from({ length: amount }).map(this.provider.generate),
  };

  /** Confirms a transaction. */
  async confirm(signature: TransactionSignature) {
    const latestBlockHash = await this.connection.getLatestBlockhash();

    return this.connection.confirmTransaction({
      signature,
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    });
  }

  /** Requests airdrop to an account or several ones. */
  async airdrop<T extends HasPublicKey | HasPublicKey[]>(to: T): Promise<T> {
    const request = async (account: PublicKey) =>
      this.confirm(await this.connection.requestAirdrop(account, 50 * LAMPORTS_PER_SOL));

    if (Array.isArray(to)) {
      await Promise.all(to.map((account) => request(extractPubkey(account))));
    } else {
      await request(extractPubkey(to));
    }

    return to;
  }

  async createAssociatedTokenAccount(authority: TestProvider, mint: PublicKey) {
    return await spl.createAssociatedTokenAccount(
      authority.connection,
      authority.signer,
      mint,
      authority.publicKey,
    );
  }

  /** Creates a new account and transfers wrapped SOL to it. */
  async wrapSol(from: AnchorProvider, amount: number): Promise<Keypair> {
    const tokenAccount = Keypair.generate();

    const tx = new Transaction().add(
      // Allocate account:
      SystemProgram.createAccount({
        fromPubkey: from.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: spl.ACCOUNT_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptAccount(this.connection),
        programId: spl.TOKEN_PROGRAM_ID,
      }),
      // Initialize token account:
      spl.createInitializeAccountInstruction(
        tokenAccount.publicKey,
        spl.NATIVE_MINT,
        from.publicKey,
      ),
      // Transfer SOL:
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: tokenAccount.publicKey,
        lamports: amount,
      }),
      // Move the lamports as wSOL:
      spl.createSyncNativeInstruction(tokenAccount.publicKey),
    );

    await sendAndConfirmIxs(from, tx, { signers: [tokenAccount] });

    return tokenAccount;
  }

  /** Deploys a new program. */
  async deploy(paths: { programKeypair: string; authorityKeypair: string; binary: string }) {
    const { programKeypair, authorityKeypair, binary } = paths;
    const BpfProgramId = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

    // Deploy:
    await execAsync(
      `solana --url ${LOCALHOST} -k ${authorityKeypair} program deploy ${binary} --program-id ${programKeypair}`,
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
  private authority: TestProvider;
  readonly address: PublicKey;
  readonly decimals: number;

  private constructor(authority: TestProvider, address: PublicKey, decimals: number) {
    this.authority = authority;
    this.address = address;
    this.decimals = decimals;
  }

  static async create(authority: TestProvider, decimals: number): Promise<TestMint> {
    return new TestMint(
      authority,
      await spl.createMint(
        authority.connection,
        authority.signer,
        authority.publicKey,
        authority.publicKey,
        decimals,
      ),
      decimals,
    );
  }

  async mint(amount: number | bigint, accountAuthority: AnchorProvider) {
    const tokenAccount = Keypair.generate();

    const tx = new Transaction().add(
      // Allocate account:
      SystemProgram.createAccount({
        fromPubkey: accountAuthority.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: spl.ACCOUNT_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptAccount(this.authority.connection),
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

    await sendAndConfirmIxs(accountAuthority, tx, {
      wallets: [this.authority.wallet],
      signers: [tokenAccount],
    });

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

export class TestProvider extends AnchorProvider {
  readonly signer: Signer;

  get keypair() {
    return Keypair.fromSecretKey(this.signer.secretKey);
  }

  constructor(connection: Connection, keypair: Keypair) {
    super(connection, new Wallet(keypair));
    this.signer = keypair;
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
