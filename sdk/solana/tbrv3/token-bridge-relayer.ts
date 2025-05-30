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
  TransactionMessage,
  VersionedTransaction,
  SimulatedTransactionResponse,
  TransactionResponse,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import {
  Chain,
  chainToChainId,
  encoding,
  contracts,
  Network,
  chainIdToChain,
  deserializeLayout,
  serializeLayout,
  Layout,
  LayoutToType,
  PlatformToChains,
} from '@wormhole-foundation/sdk-base';
import { layoutItems, toNative, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { SolanaPriceOracle, bigintToBn, bnToBigint } from '@xlabs-xyz/solana-price-oracle-sdk';
import { deserializeTbrV3Message, VaaMessage } from '@xlabs-xyz/common-arbitrary-token-transfer';
import { BpfLoaderUpgradeableProgram } from './bpf-loader-upgradeable.js';

import { TokenBridgeRelayer as IdlType } from './idl/token_bridge_relayer.js';
import IDL from './idl/token_bridge_relayer.json' with { type: 'json' };
import networkConfig from './network/network.json' with { type: 'json' };
import testProgramKeypair from './network/test-program-keypair.json' with { type: 'json' };
import { TokenBridgeCpiAccountsBuilder } from './token-bridge-cpi-accounts-builder.js';

// Export IDL
export * from './idl/token_bridge_relayer.js';
export const idl = IDL;
export { SolanaPriceOracle, oraclePidByNetwork } from '@xlabs-xyz/solana-price-oracle-sdk';
export type { VaaMessage } from "@xlabs-xyz/common-arbitrary-token-transfer";
export { BpfLoaderUpgradeableProgram } from "./bpf-loader-upgradeable.js";

export interface WormholeAddress {
  chain: Chain;
  address: UniversalAddress;
}

interface BaseRelayingParams {
  canonicalPeer: UniversalAddress;
  paused: boolean;
  maxGasDropoff: number;
  baseFee: number;
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
  mintAddress: PublicKey;
}

export type TbrConfigAccount = Awaited<ReturnType<typeof SolanaTokenBridgeRelayer.prototype.read.config>>;
export type ChainConfigAccount = Awaited<ReturnType<typeof SolanaTokenBridgeRelayer.prototype.read.chainConfig>>;
export type PeerAccount = anchor.IdlAccounts<IdlType>['peerState'];
export type SignerSequenceAccount = anchor.IdlAccounts<IdlType>['signerSequenceState'];
export type AuthBadgeAccount = anchor.IdlAccounts<IdlType>['authBadgeState'];

export type TbrNetwork = Exclude<Network, 'Devnet'> | 'Localnet';

const MICROTOKENS_PER_TOKEN = 1_000_000n;

/**
 * Transforms a `UniversalAddress` into an array of numbers `number[]`.
 */
export const uaToArray = (ua: UniversalAddress): number[] => Array.from(ua.toUint8Array());
const uaToPubkey = (address: UniversalAddress) => toNative('Solana', address).unwrap();

// TODO: export this from the price oracle SDK
// or better yet, eliminate it.
type SupportedChain = PlatformToChains<'Evm' | 'Sui'>;

export enum UserSequenceAccountData {
  NotInitialized,
};

export enum Tbrv3ConfigAccountData {
  NotInitialized,
};

export enum ChainConfigAccountData {
  NotInitialized,
};

export enum PeerAccountData {
  NotInitialized,
};

export class SolanaTokenBridgeRelayer {
  public readonly program: anchor.Program<IdlType>;
  public readonly priceOracleClient: SolanaPriceOracle;
  public readonly wormholeProgramId: PublicKey;
  public readonly tokenBridgeProgramId: PublicKey;

  private readonly tbAccBuilder: TokenBridgeCpiAccountsBuilder;

  public debug: boolean;

  /**
   * Creates a SolanaTokenBridgeRelayer instance. To let the arguments be found automatically,
   * use `SolanaTokenBridgeRelayer.create`.
   */
  constructor(
    connection: Connection,
    network: TbrNetwork,
    programId: PublicKey,
    priceOracle: SolanaPriceOracle,
    debug: boolean = false,
  ) {
    const wormholeNetwork = network === 'Localnet' ? 'Testnet' : network;

    this.program = new anchor.Program(patchAddress(IDL, programId), { connection });
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
    connection: Connection,
    debug: boolean = false,
  ): Promise<SolanaTokenBridgeRelayer> {
    const network = await networkFromConnection(connection);
    const programId = programIdFromNetwork(network);
    const priceOracle = await SolanaPriceOracle.create(connection);
    conditionalDebug(debug, 'Detected environment', {
      network,
      relayerProgramId: programId.toString(),
      oracleProgramId: priceOracle.program.programId.toString(),
    });

    return new SolanaTokenBridgeRelayer(connection, network, programId, priceOracle, debug);
  }

  get connection(): Connection {
    return this.program.provider.connection;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  /** Raw Solana accounts. */
  get account() {
    return {
      config: () => this.accountInfo(this.program.account.tbrConfigState, ['config']),
      chainConfig: (chain: Chain) =>
        this.accountInfo(this.program.account.chainConfigState, ['chainconfig', chainSeed(chain)]),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        this.accountInfo(this.program.account.peerState, [
          'peer',
          chainSeed(chain),
          peerAddress.toUint8Array(),
        ]),
      signerSequence: (signer: PublicKey) =>
        this.accountInfo(this.program.account.signerSequenceState, ['seq', signer.toBuffer()]),
      authBadge: (account: PublicKey) =>
        this.accountInfo(this.program.account.authBadgeState, ['authbadge', account.toBuffer()]),

      temporary: (mint: PublicKey) => this.pda('tmp', mint.toBuffer()),
      /** VAA address used to complete a transfer (inbound transfer). */
      vaa: (vaaHash: Uint8Array) => {
        const { address, bump } = findPda(this.wormholeProgramId, ['PostedVAA', vaaHash]);
        return {
          address,
          bump,
          fetch: async (): Promise<Uint8Array> => {
            const vaaAccount = await this.connection.getAccountInfo(address);
            if (vaaAccount === null)
              throw new Error('No VAA with this hash');
            return vaaAccount.data;
          },
        };
      },
      redeemer: () => this.pda('redeemer'),
      /** Message emitted during an outbound transfer. */
      wormholeMessage: (payer: PublicKey, payerSequence: bigint) => {
        const { address, bump } = this.pda(
          'bridged',
          payer.toBuffer(),
          serializeLayout({ binary: 'uint', size: 8, endianness: 'big' }, payerSequence),
        );
        return {
          address,
          bump,
          fetch: async (): Promise<Uint8Array> => {
            const messageAccount = await this.connection.getAccountInfo(address);
            if (messageAccount === null)
              throw new Error('No message found at this address');
            return messageAccount.data;
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
          .fetch(),
      /** Returns all Wormhole messages emitted by a user */
      allWormholeMessages: async (payer: PublicKey) => {
        const currentSequence = await this.payerSequenceNumber(payer);
        const maxSequence = currentSequence === UserSequenceAccountData.NotInitialized ? 0n : currentSequence;

        return Promise.all(
          range(0n, maxSequence).map((seq) => {
            const vaa = this.account.wormholeMessage(payer, seq).fetch();
            return vaa;
          }),
        );
      },
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
      chainConfig: async (chain: Chain) => {
        const chainAccount = await this.account.chainConfig(chain).fetch();
        return {
          ...chainAccount,
          canonicalPeer: new UniversalAddress(Uint8Array.from(chainAccount.canonicalPeer))
        };
      },
      allPeers: async (chain?: Chain) => {
        const filter =
          chain === undefined
            ? undefined
            : Buffer.from(
                serializeLayout({ ...layoutItems.chainItem(), endianness: 'little' }, chain),
              );
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
          transactionGas: number;
          transactionSize: number;
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

  get tryRead() {
    return {
      config: async () =>
        this.account
          .config()
          .fetchNullable()
          .then(configAccount => {
            if (configAccount !== null) return configAccount;
            else                        return Tbrv3ConfigAccountData.NotInitialized;
          }),
      chainConfig: async (chain: Chain) => {
        const chainAccount = await this.account.chainConfig(chain).fetchNullable();
        if (chainAccount === null) return ChainConfigAccountData.NotInitialized;
        return {
          ...chainAccount,
          canonicalPeer: new UniversalAddress(Uint8Array.from(chainAccount.canonicalPeer))
        };
      },
      peer: async (chain: Chain, peer: UniversalAddress) => {
        const peerAccount = await this.account.peer(chain, peer).fetchNullable();

        if (peerAccount === null) return PeerAccountData.NotInitialized;

        return {
          ...peerAccount,
          address: new UniversalAddress(Uint8Array.from(peerAccount.address)),
        }
      }
    };
  }

  /** Returns a PDA belonging to this program. */
  pda(...seeds: Array<string | Uint8Array>) {
    return findPda(this.programId, seeds);
  }

  /** Returns the end user's wallet and associated token account */
  getRecipientAccountsFromVaa(vaa: VaaMessage): {
    wallet: PublicKey;
    associatedTokenAccount: PublicKey;
  } {
    const mint =
      vaa.payload.token.chain === 'Solana'
        ? uaToPubkey(vaa.payload.token.address)
        : findPda(this.tokenBridgeProgramId, [
            'wrapped',
            chainSeed(vaa.payload.token.chain),
            vaa.payload.token.address.toUint8Array(),
          ]).address;

    const wallet = uaToPubkey(deserializeTbrV3Message(vaa.payload.payload).recipient);
    const associatedTokenAccount = spl.getAssociatedTokenAddressSync(mint, wallet);

    return { wallet, associatedTokenAccount };
  }

  /* Initialize */

  /**
   * Signer: the Program Authority.
   */
  async initialize(
    signer: PublicKey,
    {
      owner,
      feeRecipient,
      admins,
    }: {
      owner: PublicKey;
      feeRecipient: PublicKey;
      admins: PublicKey[];
    },
    evmTransactionGas: number,
    evmTransactionSize: number,
  ): Promise<TransactionInstruction[]> {

    const program = new BpfLoaderUpgradeableProgram(this.programId, this.connection);
    const upgradeAuthority = (await program.getdata()).upgradeAuthority;
    if (upgradeAuthority === undefined) throw new Error('The program must be upgradeable');
    if (!upgradeAuthority.equals(signer))
      throw new Error(`The signer (${signer}) must be the upgrade authority.
Current authority: ${upgradeAuthority}`);

    if (!signer.equals(owner) && !admins.some((key) => signer.equals(key)))
      throw new Error(`The signer must be set as either the owner or an admin`);

    const authBadges = admins.map((key) => ({
      pubkey: this.account.authBadge(key).address,
      isSigner: false,
      isWritable: true,
    }));

    const initAccounts = {
      deployer: signer,
      programData: program.dataAddress,
      owner,
    } as const;

    const updateEvmTxConfigAccounts = {
      signer,
      authBadge: this.account.authBadge(signer).address,
      tbrConfig: this.account.config().address,
    } as const;
    this.logDebug('initialize:', objToString(initAccounts), objToString(updateEvmTxConfigAccounts));

    return Promise.all([
      this.program.methods
        .initialize(feeRecipient, admins)
        .accountsPartial(initAccounts)
        .remainingAccounts(authBadges)
        .instruction(),
      this.program.methods
        .updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize)
        .accounts(updateEvmTxConfigAccounts)
        .instruction()
    ]);
  }

  /* Roles */

  /**
   * Signer: the Owner.
   */
  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionInstruction> {
    const config = await this.read.config();

    return this.program.methods
      .submitOwnerTransferRequest(newOwner)
      .accountsPartial({
        owner: config.owner,
        tbrConfig: this.account.config().address,
      })
      .instruction();
  }

  /**
   * Signer: the Pending Owner, the Owner to be replaced.
   */
  async confirmOwnerTransferRequest(): Promise<TransactionInstruction> {
    const config = await this.read.config();
    if (config.pendingOwner === null)
      throw new Error('No pending owner in the program');

    return this.program.methods
      .confirmOwnerTransferRequest()
      .accounts({
        newOwner: config.pendingOwner,
        tbrConfig: this.account.config().address,
        ownerCtx: {},
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
      .accountsPartial({
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
  async registerFirstPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
    config: {
      maxGasDropoffMicroToken: number;
      relayerFeeMicroUsd: number;
      pausedOutboundTransfers: boolean;
    },
  ): Promise<TransactionInstruction[]> {
    // Check if there are no existing peers:
    const chainConfig = await this.tryRead.chainConfig(chain);
    if (chainConfig !== ChainConfigAccountData.NotInitialized) {
      throw new Error('Peers already exist. Use registerAdditionalPeer to add more peers.');
    }

    const updateBaseFeeIx =
      config.relayerFeeMicroUsd !== 0
        ? [this.updateBaseFee(signer, chain, config.relayerFeeMicroUsd)]
        : [];

    const pauseOutboundTransfersIx =
      config.pausedOutboundTransfers
        ? []
        : [this.setPauseForOutboundTransfers(signer, chain, config.pausedOutboundTransfers)];

    const updateMaxGasDropoffIx =
      config.maxGasDropoffMicroToken !== 0
        ? [this.updateMaxGasDropoff(signer, chain, config.maxGasDropoffMicroToken)]
        : [];

    return Promise.all([
      this.registerPeer(signer, chain, peerAddress),
      ...updateBaseFeeIx,
      ...pauseOutboundTransfersIx,
      ...updateMaxGasDropoffIx,
    ]);
  }

  /**
   * Use `this.tryRead.chainConfig(chain)` or
   * `this.read.chainConfig(chain)` to read the chainConfig account.
   */
  async registerAdditionalPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
    chainConfig: ChainConfigAccount,
  ): Promise<TransactionInstruction> {
    return this.registerPeer(signer, chain, peerAddress);
  }

  private registerPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .registerPeer(chainToChainId(chain), uaToArray(peerAddress))
      .accountsStrict({
        signer,
        authBadge: this.account.authBadge(signer).address,
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
      })
      .instruction();
  }

  /**
   * Change the fee asked for relaying a transfer.
   *
   * Signer: the Owner or an Admin.
   */
  async updateBaseFee(
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
    evmTransactionGas: number,
    evmTransactionSize: number,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize)
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
  ): Promise<TransactionInstruction[]> {
    const {
      recipient,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeLamports,
      unwrapIntent,
      mintAddress,
    } = params;

    const ixs: TransactionInstruction[] = [];
    let transferType = '?';

    const getTokenBridgeAccounts = async () => {
      const mint = await spl.getMint(this.connection, mintAddress);
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

    let nextPayerSequence;
    if (payerSequenceNumber === UserSequenceAccountData.NotInitialized) {
      ixs.push(await this.program.methods.initUser().accounts({payer: signer}).instruction());
      nextPayerSequence = 0n;
    } else {
      nextPayerSequence = payerSequenceNumber;
    }

    const { address: temporaryAccount, bump: temporaryAccountBump } = this.account.temporary(
      tokenBridgeAccounts.mint,
    );
    const { address: wormholeMessageAccount, bump: wormholeMessageAccountBump } = this.account.wormholeMessage(
      signer,
      nextPayerSequence
    );
    const gasDropoffAmountMicro = gasDropoffAmount * Number(MICROTOKENS_PER_TOKEN);

    const accounts = {
      payer: signer,
      tbrConfig: this.account.config().address,
      chainConfig: this.account.chainConfig(recipient.chain).address,
      userTokenAccount,
      temporaryAccount,
      feeRecipient,
      oracleConfig: this.priceOracleClient.account.config().address,
      oraclePrices: this.priceOracleClient.account.prices(recipient.chain).address,
      ...tokenBridgeAccounts,
      wormholeMessage: wormholeMessageAccount,
      payerSequence: this.account.signerSequence(signer).address,
      wormholeSender: this.pda('sender').address,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
      systemProgram: SystemProgram.programId,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
      clock: SYSVAR_CLOCK_PUBKEY,
    } as const;

    const instructionData = [
      temporaryAccountBump,
      wormholeMessageAccountBump,
      uaToArray(recipient.address),
      bigintToBn(transferredAmount),
      unwrapIntent ?? false,
      gasDropoffAmountMicro,
      bigintToBn(maxFeeLamports),
    ] as const;

    this.logDebug(
      'transferTokens:',
      transferType,
      objToString(params),
      objToString(accounts),
      "instruction data:",
      objToString(instructionData),
      `initializes user sequence: ${ixs.length > 0 ? "yes" : "no"}`,
    );

    ixs.push(
      await this.program.methods
        .transferTokens(...instructionData)
        .accountsStrict(accounts)
        .instruction()
    );
    return ixs;
  }

  async baseRelayingParams(chain: Chain): Promise<BaseRelayingParams> {
    const config = await this.account.chainConfig(chain).fetch();

    return {
      maxGasDropoff: config.maxGasDropoffMicroToken / Number(MICROTOKENS_PER_TOKEN),
      baseFee: config.relayerFeeMicroUsd,
      paused: config.pausedOutboundTransfers,
      canonicalPeer: new UniversalAddress(new Uint8Array(config.canonicalPeer)),
    };
  }

  /**
   * Signer: typically the relayer.
   *
   * @param signer
   * @param vaa
   */
  async completeTransfer(signer: PublicKey, vaa: VaaMessage): Promise<TransactionInstruction[]> {
    const { wallet, associatedTokenAccount } = this.getRecipientAccountsFromVaa(vaa);
    const { unwrapIntent } = deserializeTbrV3Message(vaa.payload.payload);
    const native = vaa.payload.token.chain === 'Solana';
    const tokenBridgeAccounts = native
      ? this.tbAccBuilder.completeNative(vaa)
      : this.tbAccBuilder.completeWrapped(vaa);
    const getSolDirectly = isNativeMint(tokenBridgeAccounts.mint) && unwrapIntent;

    const { address: temporaryAccount, bump: temporaryAccountBump } = this.account.temporary(
      tokenBridgeAccounts.mint,
    );

    const accounts = {
      payer: signer,
      tbrConfig: this.account.config().address,
      recipientTokenAccount: getSolDirectly ? null : associatedTokenAccount,
      recipient: wallet,
      vaa: this.account.vaa(vaa.hash).address,
      temporaryAccount,
      ...tokenBridgeAccounts,
      wormholeRedeemer: this.pda('redeemer').address,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
      peer: this.account.peer(vaa.emitterChain, vaa.payload.from).address,
      systemProgram: SystemProgram.programId,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    };

    this.logDebug('completeTransfer:', native ? 'Native:' : 'Wrapped:', objToString(accounts));

    const [createAtaIdempotentIx, completeTransferIx] = await Promise.all([
      createAssociatedTokenAccountIdempotent({
        signer,
        mint: tokenBridgeAccounts.mint,
        wallet,
      }),
      this.program.methods
        .completeTransfer(temporaryAccountBump)
        .accountsStrict(accounts)
        .instruction(),
    ]);

    if (getSolDirectly) {
      return [completeTransferIx];
    } else {
      return [createAtaIdempotentIx, completeTransferIx];
    }
  }

  /* Queries */

  /**
   * @param chain The target chain where the token will be sent to.
   * @param dropoffAmount The amount to send to the target chain, in µUSD.
   * @returns The fee to pay for the transfer in SOL.
   */
  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    const [tbrConfig, chainConfig, evmPrices, oracleConfig] = await Promise.all([
      this.read.config(),
      this.account.chainConfig(chain).fetch(),
      this.priceOracleClient.read.foreignPrices(chain as SupportedChain),
      this.priceOracleClient.read.config(),
    ]);

    const MWEI_PER_MICRO_ETH = 1_000_000n;
    const MWEI_PER_ETH = 1_000_000_000_000n;

    if (!("gasPrice" in evmPrices)) throw new Error("Only EVM chains are supported");

    const totalFeesMwei =
      BigInt(tbrConfig.evmTransactionGas) * BigInt(evmPrices.gasPrice) +
      BigInt(tbrConfig.evmTransactionSize) * BigInt(evmPrices.pricePerTxByte) +
      BigInt(dropoffAmount) * MWEI_PER_MICRO_ETH;
    const totalFeesMicroUsd =
      (totalFeesMwei * evmPrices.gasTokenPrice) / MWEI_PER_ETH +
      BigInt(chainConfig.relayerFeeMicroUsd);

    return Number(totalFeesMicroUsd) / Number(oracleConfig.solPrice);
  }

  /**
   * This function simulates a program call to get the exact relaying fee.
   *
   * @param payer Any account with gas. No signature is required, no fee is taken.
   * @param chain The target chain where the token will be sent to.
   * @param dropoffAmount The amount to send to the target chain, in µUSD.
   * @returns The fee to pay for the transfer in SOL.
   */
  async relayingFeeSimulated(
    payer: PublicKey,
    chain: Chain,
    dropoffAmount: number,
  ): Promise<number> {
    const ix = await this.program.methods
      .relayingFee(dropoffAmount)
      .accountsStrict({
        tbrConfig: this.account.config().address,
        chainConfig: this.account.chainConfig(chain).address,
        oracleConfig: this.priceOracleClient.account.config().address,
        oraclePrices: this.priceOracleClient.account.prices(chain).address,
      })
      .instruction();
    const txResponse = await simulateTransaction(this.connection, payer, [ix]);

    const result = returnedDataFromTransaction(
      { binary: 'uint', size: 8, endianness: 'little' },
      txResponse,
    );

    return Number(result) / LAMPORTS_PER_SOL;
  }

  /* HELPERS */

  /** Generates an object with a PDA address, bump and fetching function
   * from an Anchor's `AccountClient`.
   */
  private accountInfo<A extends keyof anchor.IdlAccounts<IdlType>>(
    account: anchor.AccountClient<IdlType, A>,
    seeds: Array<string | Uint8Array>,
  ) {
    const { address, bump } = this.pda(...seeds);
    return {
      address,
      bump,
      fetch: () => account.fetch(address),
      fetchNullable: () => account.fetchNullable(address),
    };
  }

  private async payerSequenceNumber(payer: PublicKey): Promise<bigint | UserSequenceAccountData> {
    const impl = async () => {
      const account = await this.account.signerSequence(payer).fetchNullable();

      if (account !== null) return bnToBigint(account.value);
      else                  return UserSequenceAccountData.NotInitialized;
    };

    const sequenceNumber = await impl();
    this.logDebug({ payerSequenceNumber: sequenceNumber.toString() });
    return sequenceNumber;
  }

  /** Get the info about the foreign address from a Wormhole mint */
  private async getWormholeAddressFromWrappedMint(mint: PublicKey): Promise<WormholeAddress> {
    const metaAddress = findPda(this.tokenBridgeProgramId, ['meta', mint.toBuffer()]).address;
    const metaAccount = await this.connection.getAccountInfo(metaAddress);
    if (metaAccount === null)
      throw new Error(
        'Cannot find the meta info\nThe mint authority indicates that the token is a Wormhole one, but no meta information is associated with it.',
      );

    const wrapMetaLayout = [
      { name: 'chain', ...layoutItems.chainItem(), endianness: 'little' },
      { name: 'address', ...layoutItems.universalAddressItem },
      { name: 'decimals', binary: 'uint', size: 1 },
    ] as const;

    const { chain, address } = deserializeLayout(wrapMetaLayout, metaAccount.data);

    return { chain, address };
  }

  private get tokenBridgeMintAuthority(): PublicKey {
    return findPda(this.tokenBridgeProgramId, ['mint_signer']).address;
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

function findPda(programId: PublicKey, seeds: Array<string | Uint8Array>) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    seeds.map((seed) => {
      if (typeof seed === 'string') {
        return Buffer.from(seed);
      } else {
        return seed;
      }
    }),
    programId,
  );
  return {
    address,
    bump,
  };
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
  const recipientTokenAccount = spl.getAssociatedTokenAddressSync(mint, wallet);

  const createAtaIdempotentIx = spl.createAssociatedTokenAccountIdempotentInstruction(
    signer,
    recipientTokenAccount,
    wallet,
    mint,
  );

  return createAtaIdempotentIx;
}

export function returnedDataFromTransaction<L extends Layout>(
  typeLayout: L,
  confirmedTransaction:
    | VersionedTransactionResponse
    | TransactionResponse
    | SimulatedTransactionResponse,
): LayoutToType<L> {
  const prefix = 'Program return: ';
  const logs =
    'meta' in confirmedTransaction
      ? confirmedTransaction.meta?.logMessages
      : confirmedTransaction.logs;
  if (logs == null) {
    throw new Error('Internal error: No logs in this transaction');
  }
  const log = logs.find((log) => log.startsWith(prefix))
  if (log === undefined)
    throw new Error('No returned value specified in these logs');

  // The line looks like 'Program return: <Public Key> <base64 encoded value>':
  const [, data] = log.slice(prefix.length).split(' ', 2);

  return deserializeLayout<L>(typeLayout, Buffer.from(data, 'base64'), true);
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
  } else if (input?.constructor.name === 'PublicKey' || input instanceof UniversalAddress) {
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

function range(from: bigint, to: bigint): bigint[] {
  function* generator(from: bigint, to: bigint) {
    for (let i = from; from < to; i++) {
      yield i;
    }
  }
  return Array.from(generator(from, to));
}

/**
 * Simulates the transaction and returns the result. Throws if it failed.
 * @param connection The connection used to run the simulation.
 * @param payer The payer. No signature is needed, so no fee will be payed.
 * @param instructions The instructions to simulate.
 * @returns
 */
async function simulateTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<SimulatedTransactionResponse> {
  const {
    value: { blockhash },
  } = await connection.getLatestBlockhashAndContext();
  const txMessage = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const { value: response } = await connection.simulateTransaction(
    new VersionedTransaction(txMessage),
    {
      sigVerify: false,
    },
  );

  if (response.err !== null) {
    throw new Error('Transaction simulation failed', { cause: response.err });
  }

  return response;
}

function isNativeMint(mintAddress: PublicKey): boolean {
  return mintAddress.equals(spl.NATIVE_MINT) || mintAddress.equals(spl.NATIVE_MINT_2022);
}
