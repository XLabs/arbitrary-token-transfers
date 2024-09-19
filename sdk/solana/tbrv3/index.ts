import anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import {
  PublicKey,
  Connection,
  SystemProgram,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import * as borsh from 'borsh';
import { Chain, chainToChainId, encoding } from '@wormhole-foundation/sdk-base';
import { VAA } from '@wormhole-foundation/sdk-definitions';
import {
  getTransferNativeWithPayloadCpiAccounts,
  getTransferWrappedWithPayloadCpiAccounts,
  getCompleteTransferNativeWithPayloadCpiAccounts,
  getCompleteTransferWrappedWithPayloadCpiAccounts,
} from '@wormhole-foundation/sdk-solana-tokenbridge';
import { SolanaPriceOracleClient } from '@xlabs/solana-price-oracle-sdk';

import { TokenBridgeRelayer } from './idl/token_bridge_relayer.js';
import IDL from '../../../target/idl/token_bridge_relayer.json' with { type: 'json' };

// Export IDL
export * from './idl/token_bridge_relayer.js';
export const idl = IDL;
export { SolanaPriceOracleClient } from '@xlabs/solana-price-oracle-sdk';

//================== Should be in a package
import { CustomConversion, Layout, layout, LayoutItem } from '@wormhole-foundation/sdk-base';
import { layoutItems } from '@wormhole-foundation/sdk-definitions';

//TODO eliminate copy paste from oracle sdk and unify in some shared repo
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
//==================

/**
 * 32 bytes.
 */
// TODO: is this intentional?
export type UniversalAddress = number[] | Uint8Array | Buffer;
export type VaaMessage = VAA<'TokenBridge:TransferWithPayload'>;

export interface TransferNativeParameters {
  recipientChain: Chain;
  recipientAddress: UniversalAddress;
  mint: PublicKey;
  tokenAccount: PublicKey;
  transferredAmount: anchor.BN;
  gasDropoffAmount: number;
  maxFeeKlamports: anchor.BN;
  unwrapIntent: boolean;
}

export interface TransferWrappedParameters {
  recipientChain: Chain;
  recipientAddress: UniversalAddress;
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
export type AdminAccount = anchor.IdlAccounts<TokenBridgeRelayer>['adminState'];

export interface TbrAddresses {
  config(): PublicKey;
  chainConfig(chain: Chain): PublicKey;
  peer(chain: Chain, peerAddress: UniversalAddress): PublicKey;
  signerSequence(signer: PublicKey): PublicKey;
  adminBadge(signer: PublicKey): PublicKey;
}

export interface ReadTbrAccounts {
  config(): Promise<TbrConfigAccount>;
  chainConfig(chain: Chain): Promise<ChainConfigAccount>;
  peer(chain: Chain, peerAddress: UniversalAddress): Promise<PeerAccount>;
  signerSequence(signer: PublicKey): Promise<SignerSequenceAccount>;
  adminBadge(signer: PublicKey): Promise<AdminAccount>;
}

export class SolanaTokenBridgeRelayer {
  public readonly program: anchor.Program<TokenBridgeRelayer>;
  private readonly priceOracleClient: SolanaPriceOracleClient;
  private readonly tokenBridgeProgramId: PublicKey;
  private readonly wormholeProgramId: PublicKey;

  constructor(
    provider: anchor.Provider,
    {
      tokenBridgeProgramId,
      wormholeProgramId,
    }: { tokenBridgeProgramId: PublicKey; wormholeProgramId: PublicKey },
  ) {
    this.program = new Program(IDL as any, provider);
    this.priceOracleClient = new SolanaPriceOracleClient(provider.connection);
    this.tokenBridgeProgramId = tokenBridgeProgramId;
    this.wormholeProgramId = wormholeProgramId;
  }

  get connection(): Connection {
    return this.program.provider.connection;
  }

  get address(): TbrAddresses {
    return {
      config: () => pda.tbrConfig(this.program.programId),
      chainConfig: (chain: Chain) => pda.chainConfig(this.program.programId, chain),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        pda.peer(this.program.programId, chain, peerAddress),
      signerSequence: (signer: PublicKey) => pda.signerSequence(this.program.programId, signer),
      adminBadge: (admin: PublicKey) => pda.admin(this.program.programId, admin),
    };
  }

  get read(): ReadTbrAccounts {
    return {
      config: () => this.program.account.tbrConfigState.fetch(this.address.config()),
      chainConfig: (chain: Chain) =>
        this.program.account.chainConfigState.fetch(this.address.chainConfig(chain)),
      peer: (chain: Chain, peerAddress: UniversalAddress) =>
        this.program.account.peerState.fetch(this.address.peer(chain, peerAddress)),
      signerSequence: (signer: PublicKey) =>
        this.program.account.signerSequenceState.fetch(this.address.signerSequence(signer)),
      adminBadge: (admin: PublicKey) =>
        this.program.account.adminState.fetch(this.address.adminBadge(admin)),
    };
  }

  /* Initialize */

  async initialize(owner: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .initialize()
      .accounts({
        owner,
      })
      .instruction();
  }

  /* Roles */

  async submitOwnerTransferRequest(
    owner: PublicKey,
    newOwner: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .submitOwnerTransferRequest(newOwner)
      .accounts({
        owner,
      })
      .instruction();
  }

  async confirmOwnerTransferRequest(newOwner: PublicKey): Promise<web3.TransactionInstruction> {
    const previousOwner = (await this.read.config()).owner;

    return this.program.methods
      .confirmOwnerTransferRequest()
      .accounts({
        newOwner,
        previousOwner,
      })
      .instruction();
  }

  async cancelOwnerTransferRequest(owner: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .cancelOwnerTransferRequest()
      .accounts({
        owner,
      })
      .instruction();
  }

  async addAdmin(owner: PublicKey, newAdmin: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .addAdmin(newAdmin)
      .accountsStrict({
        owner,
        tbrConfig: this.address.config(),
        adminBadge: this.address.adminBadge(newAdmin),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async removeAdmin(
    signer: PublicKey,
    adminToRemove: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .removeAdmin(adminToRemove)
      .accountsStrict({
        signer,
        adminBadge: this.address.adminBadge(signer),
        tbrConfig: this.address.config(),
        adminBadgeToBeRemoved: this.address.adminBadge(adminToRemove),
      })
      .instruction();
  }

  /* Peer management */

  async registerPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .registerPeer(chainToChainId(chain), Array.from(peerAddress))
      .accountsStrict({
        signer,
        adminBadge: this.address.adminBadge(signer),
        tbrConfig: this.address.config(),
        peer: this.address.peer(chain, peerAddress),
        chainConfig: this.address.chainConfig(chain),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async updateCanonicalPeer(
    signer: PublicKey,
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateCanonicalPeer(chainToChainId(chain), Array.from(peerAddress))
      .accountsStrict({
        owner: signer,
        tbrConfig: this.address.config(),
        peer: this.address.peer(chain, peerAddress),
        chainConfig: this.address.chainConfig(chain),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /* Chain config update */

  async setPauseForOutboundTransfers(
    signer: PublicKey,
    chain: Chain,
    paused: boolean,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .setPauseForOutboundTransfers(chainToChainId(chain), paused)
      .accountsStrict({
        signer,
        adminBadge: this.address.adminBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  async updateMaxGasDropoff(
    signer: PublicKey,
    chain: Chain,
    maxGasDropoff: number,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateMaxGasDropoff(chainToChainId(chain), maxGasDropoff)
      .accountsStrict({
        signer,
        adminBadge: this.address.adminBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  async updateRelayerFee(
    signer: PublicKey,
    chain: Chain,
    relayerFee: number,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateRelayerFee(chainToChainId(chain), relayerFee)
      .accountsStrict({
        signer,
        adminBadge: this.address.adminBadge(signer),
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  /* Config update */

  async updateFeeRecipient(
    signer: PublicKey,
    newFeeRecipient: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateFeeRecipient(newFeeRecipient)
      .accounts({
        signer,
      })
      .instruction();
  }

  async updateEvmTransactionConfig(
    signer: PublicKey,
    evmTransactionGas: anchor.BN,
    evmTransactionSize: anchor.BN,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize)
      .accounts({
        signer,
      })
      .instruction();
  }

  /* Transfers */

  async transferNativeTokens(
    signer: PublicKey,
    params: TransferNativeParameters,
  ): Promise<web3.TransactionInstruction> {
    const {
      recipientChain,
      recipientAddress,
      mint,
      tokenAccount: userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeKlamports: maxFeeSol,
      unwrapIntent,
    } = params;

    const { feeRecipient } = await this.read.config();
    let payerSequenceNumber = new anchor.BN(0);

    try {
      payerSequenceNumber = (await this.read.signerSequence(signer)).value;
    } catch {
      console.log("failed!!!");
    }

    console.log("payerSequenceNumber", payerSequenceNumber.toString());

    const tokenBridgeAccounts = transferNativeTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      mint,
    });

    return this.program.methods
      .transferTokens(
        chainToChainId(recipientChain),
        Array.from(recipientAddress),
        transferredAmount,
        unwrapIntent,
        gasDropoffAmount,
        maxFeeSol,
      )
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        chainConfig: this.address.chainConfig(recipientChain),
        mint,
        userTokenAccount,
        temporaryAccount: pda.temporary(this.program.programId, mint),
        feeRecipient,
        oracleConfig: this.priceOracleClient.address.config(),
        oracleEvmPrices: this.priceOracleClient.address.evmPrices(recipientChain),
        ...tokenBridgeAccounts,
        wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
        payerSequence: this.address.signerSequence(signer),
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  async transferWrappedTokens(
    signer: PublicKey,
    params: TransferWrappedParameters,
  ): Promise<web3.TransactionInstruction> {
    const {
      recipientChain,
      recipientAddress,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeKlamports,
      unwrapIntent,
    } = params;

    const chainId = chainToChainId(recipientChain);

    const { feeRecipient } = await this.read.config();
    let payerSequenceNumber = new anchor.BN(0);
    try {
      payerSequenceNumber = (await this.read.signerSequence(signer)).value;
    } catch {}
    const tokenBridgeAccounts = transferWrappedTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      tokenChain: chainId,
      tokenAddress: Buffer.from(recipientAddress),
    });

    return this.program.methods
      .transferTokens(
        chainId,
        Array.from(recipientAddress),
        transferredAmount,
        unwrapIntent,
        gasDropoffAmount,
        maxFeeKlamports,
      )
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        chainConfig: this.address.chainConfig(recipientChain),
        userTokenAccount,
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        feeRecipient,
        oracleConfig: this.priceOracleClient.address.config(),
        oracleEvmPrices: this.priceOracleClient.address.evmPrices(recipientChain),
        ...tokenBridgeAccounts,
        wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
        payerSequence: this.address.signerSequence(signer),
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  /**
   *
   * @param signer
   * @param vaa
   * @param recipientTokenAccount The account receiving the SPL tokens.
   * @param recipient The account receiving the gas dropoff.
   */
  async completeNativeTransfer(
    signer: PublicKey,
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeNativeTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });
    const { recipient } = layout.deserializeLayout(TBRv3Message, vaa.payload.payload);

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
        peer: pda.peer(this.program.programId, vaa.emitterChain, vaa.payload.from.toUint8Array()),
      })
      .instruction();
  }

  async completeWrappedTransfer(
    signer: PublicKey,
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeWrappedTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });
    const { recipient } = layout.deserializeLayout(TBRv3Message, vaa.payload.payload);

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
        peer: pda.peer(this.program.programId, vaa.emitterChain, vaa.payload.from.toUint8Array()),
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
      .relayingFee(chainToChainId(chain), dropoffAmount)
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
  tbrConfig: (programId: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync([Buffer.from('redeemer')], programId)[0];
  },

  peer: (programId: PublicKey, chain: Chain, peerAddress: UniversalAddress): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('peer'), chainSeed(chain), Buffer.from(peerAddress)],
      programId,
    )[0];
  },

  chainConfig: (programId: PublicKey, chain: Chain): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('chainconfig'), chainSeed(chain)],
      programId,
    )[0];
  },

  signerSequence: (programId: PublicKey, signer: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync([Buffer.from('seq'), signer.toBuffer()], programId)[0];
  },

  admin: (programId: PublicKey, admin: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync([Buffer.from('admin'), admin.toBuffer()], programId)[0];
  },

  // Internal:

  temporary: (programId: PublicKey, mint: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync([Buffer.from('tmp'), mint.toBuffer()], programId)[0];
  },

  vaa: (programId: PublicKey, vaaHash: Uint8Array): PublicKey => {
    return PublicKey.findProgramAddressSync([Buffer.from('PostedVAA'), vaaHash], programId)[0];
  },

  wormholeMessage: (
    programId: PublicKey,
    payer: PublicKey,
    payerSequence: anchor.BN,
  ): PublicKey => {
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
    wormholeFeeCollector
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
    wormholeFeeCollector
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
