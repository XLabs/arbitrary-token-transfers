import * as anchor from '@coral-xyz/anchor';
import {
  PublicKey,
  Connection,
  SystemProgram,
  VersionedTransactionResponse,
  TransactionInstruction,
  clusterApiUrl,
  Cluster,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import * as borsh from 'borsh';
import {
  Chain,
  chainToChainId,
  encoding,
  contracts,
  Network,
  chainIdToChain,
  layout,
} from '@wormhole-foundation/sdk-base';
import { layoutItems, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { SolanaPriceOracle, bigintToBn, bnToBigint } from '@xlabs-xyz/solana-price-oracle-sdk';
import { deserializeTbrV3Message, VaaMessage, throwError } from 'common-arbitrary-token-transfer';
import { BpfLoaderUpgradeableProgram } from './bpf-loader-upgradeable.js';

import { TokenBridgeRelayer as IdlType } from './idl/token_bridge_relayer.js';
import IDL from '../../../target/idl/token_bridge_relayer.json' with { type: 'json' };
import networkConfig from '../../../solana/programs/token-bridge-relayer/network.json' with { type: 'json' };
import testProgramKeypair from '../../../solana/programs/token-bridge-relayer/test-program-keypair.json' with { type: 'json' };
import { TOKEN_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token.js';
import { TokenBridgeCpiAccountsBuilder } from './token-bridge-cpi-accounts-builder.js';

// Export IDL
export * from './idl/token_bridge_relayer.js';
export const idl = IDL;
export { SolanaPriceOracle, oraclePidByNetwork } from '@xlabs-xyz/solana-price-oracle-sdk';
export type { VaaMessage } from 'common-arbitrary-token-transfer';

export interface WormholeAddress {
  chain: Chain;
  address: UniversalAddress;
}

/**
 * @param recipient The address on another chain to transfer the tokens to.
 * @param userTokenAccount The end user's account with the token to be transferred.
 * @param transferredAmount The amount to be transferred to the other chain.
 * @param gasDropoffAmount The dropoff in µ-target-token.
 * @param maxFeeLamports The maximum fee the user is ready to pay (including the dropoff).
 * @param unwrapIntent Only used when transferring SOL back to Solana. Unused otherwise.
 */
export interface TransferParameters {
  recipient: WormholeAddress;
  userTokenAccount: PublicKey;
  transferredAmount: bigint;
  gasDropoffAmount: number;
  maxFeeLamports: bigint;
  unwrapIntent?: boolean;
}

export type TbrConfigAccount = anchor.IdlAccounts<IdlType>['tbrConfigState'];
export type ChainConfigAccount = anchor.IdlAccounts<IdlType>['chainConfigState'];
export type PeerAccount = anchor.IdlAccounts<IdlType>['peerState'];
export type SignerSequenceAccount = anchor.IdlAccounts<IdlType>['signerSequenceState'];
export type AuthBadgeAccount = anchor.IdlAccounts<IdlType>['authBadgeState'];

export type TbrNetwork = Exclude<Network, 'Devnet'> | 'Localnet';

/**
 * Transforms a `UniversalAddress` into an array of numbers `number[]`.
 */
export const uaToArray = (ua: UniversalAddress): number[] => Array.from(ua.toUint8Array());

export class SolanaTokenBridgeRelayer {
  public readonly program: anchor.Program<IdlType>;
  private readonly priceOracleClient: SolanaPriceOracle;
  private readonly wormholeProgramId: PublicKey;
  private readonly tokenBridgeProgramId: PublicKey;
  private readonly tbAccBuilder: TokenBridgeCpiAccountsBuilder;

  public debug: boolean;

  /**
   * Creates a SolanaTokenBridgeRelayer instance. To let the arguments be found automatically,
   * use `SolanaTokenBridgeRelayer.create`.
   */
  constructor(
    provider: anchor.Provider,
    network: TbrNetwork,
    programId: PublicKey,
    priceOracle: SolanaPriceOracle,
    debug: boolean = false,
  ) {
    const wormholeNetwork = network === 'Localnet' ? 'Testnet' : network;

    this.program = new anchor.Program(patchAddress(IDL, programId), provider);
    this.priceOracleClient = priceOracle;
    this.tokenBridgeProgramId = new PublicKey(contracts.tokenBridge(wormholeNetwork, 'Solana'));
    this.wormholeProgramId = new PublicKey(contracts.coreBridge(wormholeNetwork, 'Solana'));
    this.tbAccBuilder = new TokenBridgeCpiAccountsBuilder(
      programId,
      this.tokenBridgeProgramId,
      this.wormholeProgramId,
    );

    this.debug = debug;
  }

  /**
   * Creates a new instance by using the values in `network.json` in the program directory.
   */
  static async create(
    provider: anchor.Provider,
    debug: boolean = false,
  ): Promise<SolanaTokenBridgeRelayer> {
    const network = await networkFromConnection(provider.connection);
    const programId = programIdFromNetwork(network);
    const priceOracle = await SolanaPriceOracle.create(provider.connection);
    conditionalDebug(debug, 'Detected environment', {
      network,
      relayerProgramId: programId.toString(),
      oracleProgramId: priceOracle.program.programId.toString(),
    });

    return new SolanaTokenBridgeRelayer(provider, network, programId, priceOracle, debug);
  }

  get connection(): Connection {
    return this.program.provider.connection;
  }

  /** Raw Solana accounts. */
  get account() {
    return {
      config: () => this.accountInfo(this.program.account.tbrConfigState, [Buffer.from('config')]),
      chainConfig: (chain: Chain) =>
        this.accountInfo(this.program.account.chainConfigState, [
          Buffer.from('chainconfig'),
          chainSeed(chain),
        ]),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        this.accountInfo(this.program.account.peerState, [
          Buffer.from('peer'),
          chainSeed(chain),
          peerAddress.toUint8Array(),
        ]),
      signerSequence: (signer: PublicKey) =>
        this.accountInfo(this.program.account.signerSequenceState, [
          Buffer.from('seq'),
          signer.toBuffer(),
        ]),
      authBadge: (account: PublicKey) =>
        this.accountInfo(this.program.account.authBadgeState, [
          Buffer.from('authbadge'),
          account.toBuffer(),
        ]),

      temporary: (mint: PublicKey) =>
        findPda(this.program.programId, [Buffer.from('tmp'), mint.toBuffer()]),
      //TODO read the VAA with `fetch`
      vaa: (vaaHash: Uint8Array) =>
        findPda(this.wormholeProgramId, [Buffer.from('PostedVAA'), vaaHash]),
      redeemer: () => findPda(this.program.programId, [Buffer.from('redeemer')]),
      wormholeMessage: (payer: PublicKey, payerSequence: bigint) => {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64BE(payerSequence);
        return {
          ...findPda(this.program.programId, [Buffer.from('bridged'), payer.toBuffer(), buf]),
          fetch: async () => {
            return;
          },
        };
      },
    };
  }

  get read() {
    return {
      config: async () =>
        this.account
          .config()
          .fetch()
          .then(({ evmTransactionGas, evmTransactionSize, ...rest }) => ({
            evmTransactionGas: bnToBigint(evmTransactionGas),
            evmTransactionSize: bnToBigint(evmTransactionSize),
            ...rest,
          })),
      allAdminAccounts: async () => {
        const [accounts, owner] = await Promise.all([
          this.program.account.authBadgeState.all().then((state) => state.map((pa) => pa.account)),
          this.read.config().then((state) => state.owner.toString()),
        ]);

        return accounts
          .filter(({ address }) => address.toString() !== owner)
          .map(({ address }) => address);
      },
      allChainConfigs: async () => {
        const states = await this.program.account.chainConfigState
          .all()
          .then((state) => state.map((pa) => pa.account));

        return states.map(({ canonicalPeer, ...rest }) => ({
          canonicalPeer: new UniversalAddress(Uint8Array.from(canonicalPeer)),
          ...rest,
        }));
      },
      canonicalPeer: async (chain: Chain) => {
        const { canonicalPeer } = await this.account.chainConfig(chain).fetch();
        return new UniversalAddress(Uint8Array.from(canonicalPeer));
      },
      allPeers: async (chain?: Chain) => {
        let filter: Buffer | undefined = undefined;
        if (chain !== undefined) {
          filter = Buffer.alloc(2);
          filter.writeUInt16LE(chainToChainId(chain));
        }
        const states = await this.program.account.peerState
          .all(filter)
          .then((state) => state.map((pa) => pa.account));

        return states.map(({ address, chainId }) => ({
          address: new UniversalAddress(Uint8Array.from(address)),
          chainId,
        }));
      },
      state: async (): Promise<{
        evm: {
          transactionGas: bigint;
          transactionSize: bigint;
        };
        admins: anchor.web3.PublicKey[];
        chains: {
          [chain: string]: {
            maxGasDropoffMicroToken: number;
            relayerFeeMicroUsd: number;
            pausedOutboundTransfers: boolean;
            canonicalPeer: UniversalAddress;
            peers: UniversalAddress[];
          };
        };
        owner: anchor.web3.PublicKey;
        pendingOwner: anchor.web3.PublicKey | null;
        feeRecipient: anchor.web3.PublicKey;
      }> => {
        const [
          admins,
          chains,
          allPeers,
          { bump, senderBump, redeemerBump, evmTransactionGas, evmTransactionSize, ...config },
        ] = await Promise.all([
          this.read.allAdminAccounts(),
          this.read.allChainConfigs(),
          this.read.allPeers(),
          this.read.config(),
        ]);

        return {
          ...config,
          evm: {
            transactionGas: evmTransactionGas,
            transactionSize: evmTransactionSize,
          },
          admins,
          chains: chains.reduce((obj, { chainId, ...chain }) => {
            const chainName: string = chainIdToChain(chainId as any);
            const peers = allPeers
              .filter((peer) => peer.chainId === chainId)
              .map((peer) => peer.address);
            return {
              [chainName]: { ...chain, peers },
              ...obj,
            };
          }, {}),
        };
      },
    };
  }

  /** Returns the end user's wallet and associated token account */
  getRecipientAccountsFromVaa(vaa: VaaMessage): {
    wallet: PublicKey;
    associatedTokenAccount: PublicKey;
  } {
    const native = vaa.payload.token.chain === 'Solana';
    let mint;

    if (native) {
      mint = new PublicKey(vaa.payload.token.address.toUint8Array());
    } else {
      [mint] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('wrapped'),
          chainSeed(vaa.payload.token.chain),
          vaa.payload.token.address.toUint8Array(),
        ],
        this.tokenBridgeProgramId,
      );
    }

    const wallet = new PublicKey(deserializeTbrV3Message(vaa.payload.payload).recipient.address);
    const associatedTokenAccount = getAssociatedTokenAccount(wallet, mint);

    return { wallet, associatedTokenAccount };
  }

  /* Initialize */

  /**
   * Signer: the Program Authority.
   */
  async initialize({
    owner,
    feeRecipient,
    admins,
  }: {
    owner: PublicKey;
    feeRecipient: PublicKey;
    admins: PublicKey[];
  }): Promise<TransactionInstruction> {
    const authBadges = admins.map((key) => ({
      pubkey: this.account.authBadge(key).address,
      isSigner: false,
      isWritable: true,
    }));

    const program = new BpfLoaderUpgradeableProgram(this.program.programId, this.connection);
    const deployer =
      (await program.getdata()).upgradeAuthority ?? throwError('The program must be upgradeable');

    return await this.program.methods
      .initialize(feeRecipient, admins)
      .accountsPartial({
        deployer,
        programData: program.dataAddress,
        owner,
      })
      .remainingAccounts(authBadges)
      .instruction();
  }

  /* Roles */

  /**
   * Signer: the Owner.
   */
  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .submitOwnerTransferRequest(newOwner)
      .accounts({
        owner: config.owner,
      })
      .instruction();
  }

  /**
   * Signer: the Pending Owner.
   */
  async confirmOwnerTransferRequest(): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .confirmOwnerTransferRequest()
      .accounts({
        newOwner: config.pendingOwner ?? throwError('No pending owner in the program'),
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Owner.
   */
  async cancelOwnerTransferRequest(): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .cancelOwnerTransferRequest()
      .accountsStrict({
        owner: config.owner,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Owner.
   */
  async addAdmin(newAdmin: PublicKey): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .addAdmin(newAdmin)
      .accountsStrict({
        owner: config.owner,
        tbrConfig: this.account.config().address,
        authBadge: this.account.authBadge(newAdmin).address,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Signer: the Owner or an Admin.
   */
  async removeAdmin(signer: PublicKey, adminToRemove: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .removeAdmin()
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
        tbrConfig: this.account.config().address,
        authBadgeToBeRemoved: this.account.authBadge(adminToRemove).address,
      })
      .instruction();
  }

  /* Peer management */

  /**
   * Signer: the Owner or an Admin.
   */
  async registerPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .registerPeer(chainToChainId(chain), uaToArray(peerAddress))
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
        tbrConfig: this.account.config().address,
        peer: this.account.peer(chain, peerAddress).address,
        chainConfig: this.account.chainConfig(chain).address,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Signer: the Owner.
   */
  async updateCanonicalPeer(
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .updateCanonicalPeer()
      .accountsStrict({
        owner: config.owner,
        tbrConfig: this.account.config().address,
        peer: this.account.peer(chain, peerAddress).address,
        chainConfig: this.account.chainConfig(chain).address,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /* Chain config update */

  /**
   * Signer: the Owner or an Admin.
   */
  async setPauseForOutboundTransfers(
    signer: PublicKey,
    chain: Chain,
    paused: boolean,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .setPauseForOutboundTransfers(paused)
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
        chainConfig: this.account.chainConfig(chain).address,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Owner or an Admin.
   */
  async updateMaxGasDropoff(
    signer: PublicKey,
    chain: Chain,
    maxGasDropoff: number,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateMaxGasDropoff(maxGasDropoff)
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
        chainConfig: this.account.chainConfig(chain).address,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Owner or an Admin.
   */
  async updateRelayerFee(
    signer: PublicKey,
    chain: Chain,
    relayerFee: number,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateRelayerFee(relayerFee)
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
        chainConfig: this.account.chainConfig(chain).address,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /* Config update */

  /**
   * Signer: the Owner or an Admin.
   */
  async updateFeeRecipient(
    signer: PublicKey,
    newFeeRecipient: PublicKey,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateFeeRecipient(newFeeRecipient)
      .accounts({
        signer,
        authBadge: this.account.authBadge(signer).address,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Owner or an Admin.
   */
  async updateEvmTransactionConfig(
    signer: PublicKey,
    evmTransactionGas: bigint,
    evmTransactionSize: bigint,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateEvmTransactionConfig(bigintToBn(evmTransactionGas), bigintToBn(evmTransactionSize))
      .accounts({
        signer,
        authBadge: this.account.authBadge(signer).address,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /* Transfers */

  /**
   * Signer: the tokens owner.
   */
  async transferTokens(
    signer: PublicKey,
    params: TransferParameters,
  ): Promise<TransactionInstruction> {
    const {
      recipient,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeLamports,
      unwrapIntent,
    } = params;

    let transferType = '?';

    const getTokenBridgeAccounts = async () => {
      const mint = await spl
        .getAccount(this.connection, userTokenAccount)
        .then(({ mint }) => spl.getMint(this.connection, mint));
      if (mint.mintAuthority?.equals(this.tokenBridgeMintAuthority)) {
        transferType = 'Wrapped';
        return this.tbAccBuilder.transferWrapped(
          await this.getWormholeAddressFromWrappedMint(mint.address),
        );
      } else {
        transferType = 'Native';
        return this.tbAccBuilder.transferNative(mint.address);
      }
    };

    const [{ feeRecipient }, payerSequenceNumber, tokenBridgeAccounts] = await Promise.all([
      this.read.config(),
      this.payerSequenceNumber(signer),
      getTokenBridgeAccounts(),
    ]);

    const accounts = {
      payer: signer,
      tbrConfig: this.account.config().address,
      chainConfig: this.account.chainConfig(recipient.chain).address,
      userTokenAccount,
      temporaryAccount: this.account.temporary(tokenBridgeAccounts.mint).address,
      feeRecipient,
      oracleConfig: this.priceOracleClient.account.config().address,
      oracleEvmPrices: this.priceOracleClient.account.evmPrices(recipient.chain).address,
      ...tokenBridgeAccounts,
      wormholeMessage: this.account.wormholeMessage(signer, payerSequenceNumber).address,
      payerSequence: this.account.signerSequence(signer).address,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
    };

    this.logDebug('transferTokens:', transferType, objToString(params), objToString(accounts));

    return this.program.methods
      .transferTokens(
        uaToArray(recipient.address),
        bigintToBn(transferredAmount),
        unwrapIntent ?? false,
        gasDropoffAmount,
        bigintToBn(maxFeeLamports),
      )
      .accountsPartial(accounts)
      .instruction();
  }

  /**
   * Signer: typically the Token Bridge.
   *
   * @param signer
   * @param vaa
   */
  async completeTransfer(signer: PublicKey, vaa: VaaMessage): Promise<TransactionInstruction[]> {
    const { wallet, associatedTokenAccount } = this.getRecipientAccountsFromVaa(vaa);
    const native = vaa.payload.token.chain === 'Solana';
    const tokenBridgeAccounts = native
      ? this.tbAccBuilder.completeNative(vaa)
      : this.tbAccBuilder.completeWrapped(vaa);

    const accounts = {
      payer: signer,
      tbrConfig: this.account.config().address,
      recipientTokenAccount: associatedTokenAccount,
      recipient: wallet,
      vaa: this.account.vaa(vaa.hash).address,
      temporaryAccount: this.account.temporary(tokenBridgeAccounts.mint).address,
      ...tokenBridgeAccounts,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
      peer: this.account.peer(vaa.emitterChain, vaa.payload.from).address,
    };

    this.logDebug('completeTransfer:', native ? 'Native:' : 'Wrapped:', objToString(accounts));

    const createAtaIdempotentIx = await createAssociatedTokenAccountIdempotent({
      signer,
      mint: tokenBridgeAccounts.mint,
      wallet,
    });
    const completeTransferIx = await this.program.methods
      .completeTransfer()
      .accountsPartial(accounts)
      .instruction();

    return [createAtaIdempotentIx, completeTransferIx];
  }

  /* Queries */

  /**
   *
   * @param chain The target chain where the token will be sent to.
   * @param dropoffAmount The amount to send to the target chain.
   * @returns The fee to pay for the transfer in SOL.
   */
  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    providerAssert(this.program.provider);

    const tx = await this.program.methods
      .relayingFee(dropoffAmount)
      .accountsStrict({
        tbrConfig: this.account.config().address,
        chainConfig: this.account.chainConfig(chain).address,
        oracleConfig: this.priceOracleClient.account.config().address,
        oracleEvmPrices: this.priceOracleClient.account.evmPrices(chain).address,
      })
      .rpc({ commitment: 'confirmed' });
    const txResponse = await this.connection.getTransaction(tx, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: undefined,
    });
    const result = returnedDataFromTransaction<bigint>('u64', txResponse);

    return Number(result) / LAMPORTS_PER_SOL;
  }

  /* HELPERS */

  private accountInfo<A extends keyof anchor.IdlAccounts<IdlType>>(
    account: anchor.AccountClient<IdlType, A>,
    seeds: Array<Buffer | Uint8Array>,
  ) {
    const { address, seed } = findPda(this.program.programId, seeds);
    return {
      address,
      seed,
      fetch: () => account.fetch(address),
    };
  }

  private async payerSequenceNumber(payer: PublicKey): Promise<bigint> {
    const impl = async (payer: PublicKey) => {
      try {
        const account = await this.account.signerSequence(payer).fetch();
        return bnToBigint(account.value);
      } catch {
        return 0n;
      }
    };

    const sequenceNumber = await impl(payer);
    this.logDebug({ payerSequenceNumber: sequenceNumber.toString() });
    return sequenceNumber;
  }

  /** Get the info about the foreign address from a Wormhole mint */
  private async getWormholeAddressFromWrappedMint(mint: PublicKey): Promise<WormholeAddress> {
    const [metaAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('meta'), mint.toBuffer()],
      this.tokenBridgeProgramId,
    );
    const { data } =
      (await this.connection.getAccountInfo(metaAddress)) ??
      throwError(
        'Cannot find the meta info\nThe mint authority indicates that the token is a Wormhole one, but no meta information is associated with it.',
      );

    const { chain, address } = layout.deserializeLayout(
      [
        { name: 'chain', ...layoutItems.chainItem(), endianness: 'little' },
        { name: 'address', ...layoutItems.universalAddressItem },
        { name: 'decimals', binary: 'uint', size: 1 },
      ],
      data,
    );

    return { chain, address };
  }

  private get tokenBridgeMintAuthority(): PublicKey {
    return findPda(this.tokenBridgeProgramId, [Buffer.from('mint_signer')]).address;
  }

  private logDebug(message?: any, ...optionalParams: any[]) {
    conditionalDebug(this.debug, message, ...optionalParams);
  }
}

function conditionalDebug(debug: boolean, message?: any, ...optionalParams: any[]) {
  if (debug) {
    console.debug('[SolanaTokenBridgeRelayer]', message, ...optionalParams);
  }
}

const chainSeed = (chain: Chain) => encoding.bignum.toBytes(chainToChainId(chain), 2);

function findPda(programId: PublicKey, seeds: Array<Buffer | Uint8Array>) {
  const [address, seed] = PublicKey.findProgramAddressSync(seeds, programId);
  return {
    address,
    seed,
  };
}

function getAssociatedTokenAccount(wallet: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** Return both the address and an idempotent instruction to create it. */
async function createAssociatedTokenAccountIdempotent({
  signer,
  mint,
  wallet,
}: {
  signer: PublicKey;
  mint: PublicKey;
  wallet: PublicKey;
}): Promise<TransactionInstruction> {
  const recipientTokenAccount = getAssociatedTokenAccount(wallet, mint);

  const createAtaIdempotentIx = spl.createAssociatedTokenAccountIdempotentInstruction(
    signer,
    recipientTokenAccount,
    wallet,
    mint,
  );

  return createAtaIdempotentIx;
}

function providerAssert(provider: anchor.Provider) {
  if (provider.sendAndConfirm === undefined) {
    throw new Error('The client must be created with a full provider to use this method');
  }
}

export function returnedDataFromTransaction<T>(
  schema: borsh.Schema,
  confirmedTransaction: VersionedTransactionResponse | null,
) {
  const prefix = 'Program return: ';
  const log = confirmedTransaction?.meta?.logMessages?.find((log) => log.startsWith(prefix));
  if (log === undefined) {
    throw new Error('Internal error: The transaction did not return any value');
  }
  // The line looks like 'Program return: <Public Key> <base64 encoded value>':
  const [, data] = log.slice(prefix.length).split(' ', 2);

  return borsh.deserialize(schema, Buffer.from(data, 'base64')) as T;
}

/**
 * Detects the network from a Solana connection.
 */
async function networkFromConnection(connection: Connection): Promise<TbrNetwork> {
  function genesisHash(cluster: Cluster) {
    return new Connection(clusterApiUrl(cluster), 'singleGossip').getGenesisHash();
  }
  const [mainnet, testnet] = await Promise.all([
    genesisHash('mainnet-beta'),
    genesisHash('devnet'), // Wormhole's testnet = Solana devnet
  ]);

  switch (await connection.getGenesisHash()) {
    case mainnet:
      return 'Mainnet';
    case testnet:
      return 'Testnet';
    default:
      return 'Localnet';
  }
}

function programIdFromNetwork(network: TbrNetwork) {
  switch (network) {
    case 'Mainnet':
      return new PublicKey(networkConfig.mainnet);
    case 'Testnet':
      return new PublicKey(networkConfig.testnet);
    case 'Localnet':
      return Keypair.fromSecretKey(Uint8Array.from(testProgramKeypair)).publicKey;
  }
}

function objToString(input: any): any {
  if (Array.isArray(input)) {
    return input.map((v) => objToString(v));
  } else if (input instanceof PublicKey || input instanceof UniversalAddress) {
    return input.toString();
  } else if (input && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, objToString(v)]));
  } else {
    return input;
  }
}

/**
 * Crappy fix for allowing to override address to support multiple environments
 */
function patchAddress(idl: any, address?: PublicKey) {
  if (address) {
    return { ...idl, address: address.toString() };
  }

  return idl;
}
