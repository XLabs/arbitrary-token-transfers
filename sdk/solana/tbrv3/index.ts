import * as anchor from '@coral-xyz/anchor';
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
import * as IDL from './idl/token_bridge_relayer.json' with { type: 'json' };

// Export IDL
export * from './idl/token_bridge_relayer.js';
export const idl = IDL;
export { SolanaPriceOracleClient } from '@xlabs/solana-price-oracle-sdk';

/**
 * 32 bytes.
 */
export type UniversalAddress = number[] | Uint8Array | Buffer;
export type VaaMessage = VAA<'TokenBridge:TransferWithPayload'>;

export interface TransferNativeParameters {
  recipientChain: Chain;
  recipientAddress: UniversalAddress;
  mint: PublicKey;
  tokenAccount: PublicKey;
  transferredAmount: anchor.BN;
  gasDropoffAmount: anchor.BN;
  maxFeeSol: anchor.BN;
  unwrapIntent: boolean;
}

export interface TransferWrappedParameters {
  recipientChain: Chain;
  recipientAddress: UniversalAddress;
  userTokenAccount: PublicKey;
  transferredAmount: anchor.BN;
  gasDropoffAmount: anchor.BN;
  maxFeeSol: anchor.BN;
  unwrapIntent: boolean;
}

export type TbrConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['tbrConfigState'];
export type ChainConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['chainConfigState'];
export type PeerAccount = anchor.IdlAccounts<TokenBridgeRelayer>['peerState'];
export type SignerSequenceAccount = anchor.IdlAccounts<TokenBridgeRelayer>['signerSequenceState'];

export interface TbrAddresses {
  config(): PublicKey;
  chainConfig(chain: Chain): PublicKey;
  peer(chain: Chain, peerAddress: UniversalAddress): PublicKey;
  signerSequence(signer: PublicKey): PublicKey;
}

export interface ReadTbrAccounts {
  config(): Promise<TbrConfigAccount>;
  chainConfig(chain: Chain): Promise<ChainConfigAccount>;
  peer(chain: Chain, peerAddress: UniversalAddress): Promise<PeerAccount>;
  signerSequence(signer: PublicKey): Promise<SignerSequenceAccount>;
}

export class TbrClient {
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
    this.program = new Program<TokenBridgeRelayer>(IDL as any, provider);
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
    signer: PublicKey,
    newOwner: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .submitOwnerTransferRequest(newOwner)
      .accounts({
        signer,
      })
      .instruction();
  }

  async confirmOwnerTransferRequest(signer: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .confirmOwnerTransferRequest()
      .accounts({
        signer,
      })
      .instruction();
  }

  async cancelOwnerTransferRequest(signer: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .cancelOwnerTransferRequest()
      .accounts({
        signer,
      })
      .instruction();
  }

  async addAdmin(signer: PublicKey, newAdmin: PublicKey): Promise<web3.TransactionInstruction> {
    throw new Error("doesn't work rn");
  }

  async removeAdmin(signer: PublicKey, newAdmin: PublicKey): Promise<web3.TransactionInstruction> {
    throw new Error("doesn't work rn");
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
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  async updateMaxGasDropoff(
    signer: PublicKey,
    chain: Chain,
    maxGasDropoff: anchor.BN,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateMaxGasDropoff(chainToChainId(chain), maxGasDropoff)
      .accountsStrict({
        signer,
        chainConfig: this.address.chainConfig(chain),
        tbrConfig: this.address.config(),
      })
      .instruction();
  }

  async updateRelayerFee(
    signer: PublicKey,
    chain: Chain,
    relayerFee: anchor.BN,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods
      .updateRelayerFee(chainToChainId(chain), relayerFee)
      .accountsStrict({
        signer,
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
      maxFeeSol,
      unwrapIntent,
    } = params;

    const { feeRecipient } = await this.read.config();
    let payerSequenceNumber = new anchor.BN(0);
    try {
      payerSequenceNumber = (await this.read.signerSequence(signer)).value;
    } catch {}
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
      maxFeeSol,
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
        maxFeeSol,
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
    recipient: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeNativeTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });

    return this.program.methods
      .completeTransfer(Array.from(vaa.hash))
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        recipientTokenAccount,
        recipient,
        vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        ...tokenBridgeAccounts,
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  async completeWrappedTransfer(
    signer: PublicKey,
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
    recipient: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeWrappedTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });

    return this.program.methods
      .completeTransfer(Array.from(vaa.hash))
      .accountsPartial({
        payer: signer,
        tbrConfig: this.address.config(),
        recipientTokenAccount,
        recipient,
        vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
        temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
        ...tokenBridgeAccounts,
        tokenBridgeProgram: this.tokenBridgeProgramId,
        wormholeProgram: this.wormholeProgramId,
      })
      .instruction();
  }

  /* Queries */

  async relayingFee(signer: PublicKey, chain: Chain, dropoffAmount: anchor.BN): Promise<anchor.BN> {
    assertProvider(this.program.provider);

    const tx = await this.program.methods
      .relayingFee(chainToChainId(chain), dropoffAmount)
      .accountsStrict({
        payer: signer,
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

    return new anchor.BN(result.toString());
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
    return PublicKey.findProgramAddressSync(
      [Buffer.from('bridged'), payer.toBuffer(), payerSequence.toBuffer()],
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
