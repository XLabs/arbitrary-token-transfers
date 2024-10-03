import anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  PublicKey,
  Connection,
  SystemProgram,
  VersionedTransactionResponse,
  TransactionInstruction,
  clusterApiUrl,
  Cluster,
} from '@solana/web3.js';
import * as borsh from 'borsh';
import { Chain, chainToChainId, encoding, contracts, Network } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  getTransferNativeWithPayloadCpiAccounts,
  getTransferWrappedWithPayloadCpiAccounts,
  getCompleteTransferNativeWithPayloadCpiAccounts,
  getCompleteTransferWrappedWithPayloadCpiAccounts,
} from '@wormhole-foundation/sdk-solana-tokenbridge';
import { SolanaPriceOracleClient } from '@xlabs/solana-price-oracle-sdk';

import { TokenBridgeRelayer } from './idl/token_bridge_relayer.js';
import IDL from '/Users/felixdv/Dev/Xlabs/arbitrary-token-transfers/target/idl/token_bridge_relayer.json' with { type: 'json' };
import { deserializeTbrV3Message, VaaMessage, throwError } from 'common-arbitrary-token-transfer';
import { BpfLoaderUpgradeableProgram } from './bpf-loader-upgradeable.js';

// Export IDL
export * from './idl/token_bridge_relayer.js';
export const idl = IDL;
export { SolanaPriceOracleClient } from '@xlabs/solana-price-oracle-sdk';
export type { VaaMessage } from 'common-arbitrary-token-transfer';

export interface WormholeAddress {
  chain: Chain;
  address: UniversalAddress;
}

export interface TransferNativeParameters {
  recipient: WormholeAddress;
  mint: PublicKey;
  tokenAccount: PublicKey;
  transferredAmount: anchor.BN;
  gasDropoffAmount: number;
  maxFeeKlamports: anchor.BN;
  unwrapIntent: boolean;
}

export interface TransferWrappedParameters {
  recipient: WormholeAddress;
  token: WormholeAddress;
  userTokenAccount: PublicKey;
  transferredAmount: anchor.BN;
  gasDropoffAmount: number;
  maxFeeKlamports: anchor.BN;
  unwrapIntent: boolean;
}

export type TbrConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['tbrConfigState'];
export type ChainConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['chainConfigState'];
export type PeerAccount = anchor.IdlAccounts<TokenBridgeRelayer>['peerState'];
export type SignerSequenceAccount = anchor.IdlAccounts<TokenBridgeRelayer>['signerSequenceState'];
export type AuthBadgeAccount = anchor.IdlAccounts<TokenBridgeRelayer>['authBadgeState'];

/**
 * Transforms a `UniversalAddress` into an array of numbers `number[]`.
 */
export const uaToArray = (ua: UniversalAddress): number[] => Array.from(ua.toUint8Array());

export class SolanaTokenBridgeRelayer {
  public readonly program: anchor.Program<TokenBridgeRelayer>;
  private readonly priceOracleClient: SolanaPriceOracleClient;
  private readonly wormholeProgramId: PublicKey;
  private readonly tokenBridgeProgramId: PublicKey;

  constructor(provider: anchor.Provider) {
    const network = networkFromConnection(provider.connection);
    myDebug('Network detected to be:', network);

    this.program = new Program(patchTest(provider.connection, IDL), provider);
    this.priceOracleClient = new SolanaPriceOracleClient(provider.connection);
    this.wormholeProgramId = new PublicKey(contracts.coreBridge(network, 'Solana'));
    this.tokenBridgeProgramId = new PublicKey(contracts.tokenBridge(network, 'Solana'));
  }

  get connection(): Connection {
    return this.program.provider.connection;
  }

  get address() {
    return {
      config: () => pda.tbrConfig(this.program.programId),
      chainConfig: (chain: Chain) => pda.chainConfig(this.program.programId, chain),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        pda.peer(this.program.programId, chain, peerAddress),
      signerSequence: (signer: PublicKey) => pda.signerSequence(this.program.programId, signer),
      authBadge: (account: PublicKey) => pda.authBadge(this.program.programId, account),
    };
  }

  get read() {
    return {
      config: () => this.program.account.tbrConfigState.fetch(this.address.config()),
      chainConfig: (chain: Chain) =>
        this.program.account.chainConfigState.fetch(this.address.chainConfig(chain)),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        this.program.account.peerState.fetch(this.address.peer(chain, peerAddress)),
      signerSequence: (signer: PublicKey) =>
        this.program.account.signerSequenceState.fetch(this.address.signerSequence(signer)),
      authBadge: (account: PublicKey) =>
        this.program.account.authBadgeState.fetch(this.address.authBadge(account)),
    };
  }

  async readAdminAccounts(): Promise<PublicKey[]> {
    const accounts = (await this.program.account.authBadgeState.all()).map((pa) => pa.account);
    const owner = (await this.read.config()).owner.toString();

    return accounts
      .filter(({ address }) => address.toString() !== owner)
      .map(({ address }) => address);
  }

  private async payerSequenceNumber(payer: PublicKey): Promise<anchor.BN> {
    const impl = async (payer: PublicKey) => {
      try {
        return (await this.read.signerSequence(payer)).value;
      } catch {
        return new anchor.BN(0);
      }
    };

    const sequenceNumber = await impl(payer);
    console.debug({ payerSequenceNumber: sequenceNumber.toString() });
    return sequenceNumber;
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
      pubkey: this.address.authBadge(key),
      isSigner: false,
      isWritable: true,
    }));

    const program = new BpfLoaderUpgradeableProgram(this.program.programId, this.connection);
    const deployer =
      (await program.getdata()).upgradeAuthority ?? throwError('The program must be upgradeable');

    return await this.program.methods
      .initialize(feeRecipient, admins)
      .accounts({
        deployer,
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
        tbrConfig: this.address.config(),
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
        tbrConfig: this.address.config(),
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
        tbrConfig: this.address.config(),
        authBadge: this.address.authBadge(newAdmin),
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
        authBadge: this.address.authBadge(signer),
        tbrConfig: this.address.config(),
        authBadgeToBeRemoved: this.address.authBadge(adminToRemove),
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
        authBadge: this.address.authBadge(signer),
        tbrConfig: this.address.config(),
        peer: this.address.peer(chain, peerAddress),
        chainConfig: this.address.chainConfig(chain),
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
        tbrConfig: this.address.config(),
        peer: this.address.peer(chain, peerAddress),
        chainConfig: this.address.chainConfig(chain),
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
        authBadge: this.address.authBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
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
        authBadge: this.address.authBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
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
        authBadge: this.address.authBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
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
        authBadge: this.address.authBadge(signer),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  /**
   * Signer: the Owner or an Admin.
   */
  async updateEvmTransactionConfig(
    signer: PublicKey,
    evmTransactionGas: anchor.BN,
    evmTransactionSize: anchor.BN,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize)
      .accounts({
        signer,
        authBadge: this.address.authBadge(signer),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  /* Transfers */

  /**
   * Signer: typically the Token Bridge.
   */
  async transferNativeTokens(
    signer: PublicKey,
    params: TransferNativeParameters,
  ): Promise<TransactionInstruction> {
    const {
      recipient,
      mint,
      tokenAccount: userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeKlamports: maxFeeSol,
      unwrapIntent,
    } = params;

    const { feeRecipient } = await this.read.config();
    const payerSequenceNumber = await this.payerSequenceNumber(signer);

    const tokenBridgeAccounts = transferNativeTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      mint,
    });

    return this.program.methods
      .transferTokens(
        uaToArray(recipient.address),
        transferredAmount,
        unwrapIntent,
        gasDropoffAmount,
        maxFeeSol,
      )
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        chainConfig: this.address.chainConfig(recipient.chain),
        mint,
        userTokenAccount,
        temporaryAccount: pda.temporary(this.program.programId, mint),
        feeRecipient,
        oracleConfig: this.priceOracleClient.address.config(),
        oracleEvmPrices: this.priceOracleClient.address.evmPrices(recipient.chain),
        ...tokenBridgeAccounts,
        wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
        payerSequence: this.address.signerSequence(signer),
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  /**
   * Signer: typically the Token Bridge.
   */
  async transferWrappedTokens(
    signer: PublicKey,
    params: TransferWrappedParameters,
  ): Promise<TransactionInstruction> {
    const {
      recipient,
      token,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeKlamports,
      unwrapIntent,
    } = params;

    const chainId = chainToChainId(recipient.chain);
    const { feeRecipient } = await this.read.config();
    const payerSequenceNumber = await this.payerSequenceNumber(signer);

    const tokenBridgeAccounts = transferWrappedTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      tokenChain: chainToChainId(token.chain),
      tokenAddress: Buffer.from(token.address.toUint8Array()),
    });

    return this.program.methods
      .transferTokens(
        uaToArray(recipient.address),
        transferredAmount,
        unwrapIntent,
        gasDropoffAmount,
        maxFeeKlamports,
      )
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        chainConfig: this.address.chainConfig(recipient.chain),
        userTokenAccount,
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        feeRecipient,
        oracleConfig: this.priceOracleClient.address.config(),
        oracleEvmPrices: this.priceOracleClient.address.evmPrices(recipient.chain),
        ...tokenBridgeAccounts,
        wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
        payerSequence: this.address.signerSequence(signer),
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  /**
   * Signer: typically the Token Bridge.
   *
   * @param signer
   * @param vaa
   * @param recipientTokenAccount The user's account receiving the SPL tokens.
   */
  async completeNativeTransfer(
    signer: PublicKey,
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const tokenBridgeAccounts = completeNativeTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });
    const { recipient } = deserializeTbrV3Message(vaa);

    return this.program.methods
      .completeTransfer(Array.from(vaa.hash))
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        recipientTokenAccount,
        recipient: new PublicKey(recipient.address),
        vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        ...tokenBridgeAccounts,
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
        peer: pda.peer(this.program.programId, vaa.emitterChain, vaa.payload.from),
      })
      .instruction();
  }

  /**
   * Signer: typically the Token Bridge.
   *
   * @param signer
   * @param vaa
   * @param recipientTokenAccount The user's account receiving the SPL tokens.
   */
  async completeWrappedTransfer(
    signer: PublicKey,
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const tokenBridgeAccounts = completeWrappedTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });
    const { recipient } = deserializeTbrV3Message(vaa);

    return this.program.methods
      .completeTransfer(Array.from(vaa.hash))
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        recipientTokenAccount,
        recipient: new PublicKey(recipient.address),
        vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        ...tokenBridgeAccounts,
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
        peer: pda.peer(this.program.programId, vaa.emitterChain, vaa.payload.from),
      })
      .instruction();
  }

  /* Queries */

  /**
   *
   * @param chain The target chain where the token will be sent to.
   * @param dropoffAmount The amount to send to the target chain.
   * @returns The fee to pay for the transfer in SOL.
   */
  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    assertProvider(this.program.provider);

    const tx = await this.program.methods
      .relayingFee(dropoffAmount)
      .accountsStrict({
        payer: this.program.provider.publicKey,
        tbrConfig: this.address.config(),
        chainConfig: this.address.chainConfig(chain),
        oracleConfig: this.priceOracleClient.address.config(),
        oracleEvmPrices: this.priceOracleClient.address.evmPrices(chain),
      })
      .rpc({ commitment: 'confirmed' });
    const txResponse = await this.connection.getTransaction(tx, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: undefined,
    });
    const result = returnedDataFromTransaction<bigint>('u64', txResponse);

    return Number(result) / 1_000_000;
  }
}

const chainSeed = (chain: Chain) => encoding.bignum.toBytes(chainToChainId(chain), 2);
const pda = {
  tbrConfig: (programId: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0],

  peer: (programId: PublicKey, chain: Chain, peerAddress: UniversalAddress) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('peer'), chainSeed(chain), peerAddress.toUint8Array()],
      programId,
    )[0],

  chainConfig: (programId: PublicKey, chain: Chain) =>
    PublicKey.findProgramAddressSync([Buffer.from('chainconfig'), chainSeed(chain)], programId)[0],

  signerSequence: (programId: PublicKey, signer: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from('seq'), signer.toBuffer()], programId)[0],

  authBadge: (programId: PublicKey, account: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from('authbadge'), account.toBuffer()], programId)[0],

  // Internal:

  temporary: (programId: PublicKey, mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from('tmp'), mint.toBuffer()], programId)[0],

  vaa: (programId: PublicKey, vaaHash: Uint8Array) =>
    PublicKey.findProgramAddressSync([Buffer.from('PostedVAA'), vaaHash], programId)[0],

  wormholeMessage: (programId: PublicKey, payer: PublicKey, payerSequence: anchor.BN) => {
    const buf = Buffer.alloc(8);

    buf.writeBigInt64BE(BigInt(payerSequence.toString()), 0);

    return PublicKey.findProgramAddressSync(
      [Buffer.from('bridged'), payer.toBuffer(), buf],
      programId,
    )[0];
  },
};

function assertProvider(provider: anchor.Provider) {
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

function transferNativeTokenBridgeAccounts(params: {
  programId: PublicKey;
  tokenBridgeProgramId: PublicKey;
  wormholeProgramId: PublicKey;
  mint: PublicKey;
}): {
  tokenBridgeConfig: PublicKey;
  tokenBridgeCustody: PublicKey;
  tokenBridgeAuthoritySigner: PublicKey;
  tokenBridgeCustodySigner: PublicKey;
  tokenBridgeWrappedMeta: null;
  wormholeBridge: PublicKey;
  tokenBridgeEmitter: PublicKey;
  tokenBridgeSequence: PublicKey;
  wormholeFeeCollector: PublicKey;
} {
  const { programId, tokenBridgeProgramId, wormholeProgramId, mint } = params;

  const {
    tokenBridgeConfig,
    tokenBridgeCustody,
    tokenBridgeAuthoritySigner,
    tokenBridgeCustodySigner,
    wormholeBridge,
    tokenBridgeEmitter,
    tokenBridgeSequence,
    wormholeFeeCollector,
  } = getTransferNativeWithPayloadCpiAccounts(
    programId,
    tokenBridgeProgramId,
    wormholeProgramId,
    PublicKey.default, // we don't need payer
    PublicKey.default, // we don't need message
    PublicKey.default, // we don't need fromTokenAccount
    mint,
  );

  return {
    tokenBridgeConfig,
    tokenBridgeCustody,
    tokenBridgeAuthoritySigner,
    tokenBridgeCustodySigner,
    tokenBridgeWrappedMeta: null,
    wormholeBridge,
    tokenBridgeEmitter,
    tokenBridgeSequence,
    wormholeFeeCollector,
  };
}

function transferWrappedTokenBridgeAccounts(params: {
  programId: PublicKey;
  tokenBridgeProgramId: PublicKey;
  wormholeProgramId: PublicKey;
  tokenChain: number;
  tokenAddress: Buffer;
}): {
  tokenBridgeConfig: PublicKey;
  tokenBridgeCustody: null;
  tokenBridgeAuthoritySigner: PublicKey;
  tokenBridgeCustodySigner: null;
  tokenBridgeWrappedMeta: PublicKey;
  wormholeBridge: PublicKey;
  tokenBridgeEmitter: PublicKey;
  tokenBridgeSequence: PublicKey;
  mint: PublicKey;
  wormholeFeeCollector: PublicKey;
} {
  const { programId, tokenBridgeProgramId, wormholeProgramId, tokenChain, tokenAddress } = params;

  const {
    tokenBridgeConfig,
    tokenBridgeAuthoritySigner,
    wormholeBridge,
    tokenBridgeEmitter,
    tokenBridgeSequence,
    tokenBridgeWrappedMeta,
    tokenBridgeWrappedMint,
    wormholeFeeCollector,
  } = getTransferWrappedWithPayloadCpiAccounts(
    programId,
    tokenBridgeProgramId,
    wormholeProgramId,
    PublicKey.default, // we don't need payer
    PublicKey.default, // we don't need message
    PublicKey.default, // we don't need fromTokenAccount
    tokenChain,
    tokenAddress,
  );

  return {
    tokenBridgeConfig,
    tokenBridgeCustody: null,
    tokenBridgeAuthoritySigner,
    tokenBridgeCustodySigner: null,
    tokenBridgeWrappedMeta,
    wormholeBridge,
    tokenBridgeEmitter,
    tokenBridgeSequence,
    mint: tokenBridgeWrappedMint,
    wormholeFeeCollector,
  };
}

function completeNativeTokenBridgeAccounts(params: {
  tokenBridgeProgramId: PublicKey;
  wormholeProgramId: PublicKey;
  vaa: VaaMessage;
}): {
  tokenBridgeConfig: PublicKey;
  tokenBridgeClaim: PublicKey;
  tokenBridgeForeignEndpoint: PublicKey;
  tokenBridgeCustody: PublicKey;
  tokenBridgeCustodySigner: PublicKey;
  tokenBridgeMintAuthority: null;
  tokenBridgeWrappedMeta: null;
  mint: PublicKey;
} {
  const { tokenBridgeProgramId, wormholeProgramId, vaa } = params;

  const {
    tokenBridgeConfig,
    tokenBridgeClaim,
    tokenBridgeForeignEndpoint,
    tokenBridgeCustody,
    tokenBridgeCustodySigner,
    mint,
  } = getCompleteTransferNativeWithPayloadCpiAccounts(
    tokenBridgeProgramId,
    wormholeProgramId,
    PublicKey.default,
    vaa,
    PublicKey.default,
  );

  return {
    tokenBridgeConfig,
    tokenBridgeClaim,
    tokenBridgeForeignEndpoint,
    tokenBridgeCustody,
    tokenBridgeCustodySigner,
    tokenBridgeMintAuthority: null,
    tokenBridgeWrappedMeta: null,
    mint,
  };
}

function completeWrappedTokenBridgeAccounts(params: {
  tokenBridgeProgramId: PublicKey;
  wormholeProgramId: PublicKey;
  vaa: VaaMessage;
}): {
  tokenBridgeConfig: PublicKey;
  tokenBridgeClaim: PublicKey;
  tokenBridgeForeignEndpoint: PublicKey;
  tokenBridgeCustody: null;
  tokenBridgeCustodySigner: null;
  tokenBridgeMintAuthority: PublicKey;
  tokenBridgeWrappedMeta: PublicKey;
  mint: PublicKey;
} {
  const { tokenBridgeProgramId, wormholeProgramId, vaa } = params;

  const {
    tokenBridgeConfig,
    tokenBridgeClaim,
    tokenBridgeForeignEndpoint,
    tokenBridgeMintAuthority,
    tokenBridgeWrappedMeta,
    tokenBridgeWrappedMint,
  } = getCompleteTransferWrappedWithPayloadCpiAccounts(
    tokenBridgeProgramId,
    wormholeProgramId,
    PublicKey.default,
    vaa,
    PublicKey.default,
  );

  return {
    tokenBridgeConfig,
    tokenBridgeClaim,
    tokenBridgeForeignEndpoint,
    tokenBridgeCustody: null,
    tokenBridgeCustodySigner: null,
    tokenBridgeMintAuthority,
    tokenBridgeWrappedMeta,
    mint: tokenBridgeWrappedMint,
  };
}

/**
 * Detects the network from a Solana connection.
 */
function networkFromConnection(connection: Connection): Network {
  function clusterRpcEndpoint(cluster: Cluster) {
    return new Connection(clusterApiUrl(cluster), 'singleGossip').rpcEndpoint;
  }
  const mainnet = clusterRpcEndpoint('mainnet-beta');
  const devnet = clusterRpcEndpoint('devnet');
  const testnet = clusterRpcEndpoint('testnet');

  switch (connection.rpcEndpoint) {
    case mainnet:
      return 'Mainnet';
    case devnet:
      return 'Devnet';
    case testnet:
      return 'Testnet';
    default: // We consider that it is localnet, and use the mainnet values:
      return 'Mainnet';
  }
}

function myDebug(message?: any, ...optionalParams: any[]) {
  console.debug('[SolanaTokenBridgeRelayer]', message, ...optionalParams);
}

/**
 * Crappy fix for allowing the tests to run correctly.
 */
function patchTest(connection: Connection, idl: any) {
  return connection.rpcEndpoint.includes('localhost')
    ? { ...idl, address: '7TLiBkpDGshV4o3jmacTCx93CLkmo3VjZ111AsijN9f8' }
    : idl;
}
