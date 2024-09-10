import * as anchor from '@coral-xyz/anchor';
import { Program, BN, web3 } from '@coral-xyz/anchor';
import {
  PublicKey, Connection
} from '@solana/web3.js';
import { Chain, chainToChainId, encoding } from '@wormhole-foundation/sdk-base';
import { QuoterClient } from 'solana-price-oracle-sdk';
import { SYSTEM_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/native/system';

import { TokenBridgeRelayer } from '../../../target/types/token_bridge_relayer';
import IDL from '../../../target/idl/token_bridge_relayer.json';
import {
  getTransferNativeWithPayloadCpiAccounts,
  getTransferWrappedWithPayloadCpiAccounts,
  getCompleteTransferNativeWithPayloadCpiAccounts,
  getCompleteTransferWrappedWithPayloadCpiAccounts,
} from '@wormhole-foundation/sdk-solana-tokenbridge/';
import { VAA } from '@wormhole-foundation/sdk-definitions';

type UniversalAddress = number[] | Uint8Array | Buffer;

interface TransferNativeParameters {
  recipientChain: Chain,
  recipientAddress: UniversalAddress,
  mint: PublicKey,
  userTokenAccount: PublicKey,
  transferredAmount: BN,
  gasDropoffAmount: BN,
  maxFeeSol: BN,
}

interface TransferWrappedParameters {
  recipientChain: Chain,
  recipientAddress: UniversalAddress,
  userTokenAccount: PublicKey,
  transferredAmount: BN,
  gasDropoffAmount: BN,
  maxFeeSol: BN,
}

type TbrConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['tbrConfigState'];
type ChainConfigAccount = anchor.IdlAccounts<TokenBridgeRelayer>['chainConfigState'];
type PeerAccount = anchor.IdlAccounts<TokenBridgeRelayer>['peerState'];
type SignerSequenceAccount = anchor.IdlAccounts<TokenBridgeRelayer>['signerSequenceState'];

export interface TbrAddresses {
  config(): PublicKey,
  chainConfig(chain: Chain): PublicKey,
  peer(chain: Chain, peerAddress: UniversalAddress): PublicKey,
  signerSequence(signer: PublicKey): PublicKey,
}

export interface ReadTbrAccounts {
  config(): Promise<TbrConfigAccount>,
  chainConfig(chain: Chain): Promise<ChainConfigAccount>,
  peer(chain: Chain, peerAddress: UniversalAddress): Promise<PeerAccount>,
  signerSequence(signer: PublicKey): Promise<SignerSequenceAccount>,
}

export class TbrClient {
  private _connection: Connection;
  private readonly program: anchor.Program<TokenBridgeRelayer>;
  private quoterClient: QuoterClient;
  private tokenBridgeProgramId: PublicKey;
  private wormholeProgramId: PublicKey;

  constructor(
    connection: Connection,
    { tokenBridgeProgramId, wormholeProgramId }: { tokenBridgeProgramId: PublicKey, wormholeProgramId: PublicKey }
  ) {
    this._connection = connection;
    this.program = new Program<TokenBridgeRelayer>(IDL as any, { connection });
    this.quoterClient = new QuoterClient(connection);
    this.tokenBridgeProgramId = tokenBridgeProgramId;
    this.wormholeProgramId = wormholeProgramId;
  }

  get connection(): Connection {
    return this._connection;
  }

  get address(): TbrAddresses {
    return {
      config: () => pda.tbrConfig(this.program.programId),
      chainConfig: (chain: Chain) => pda.chainConfig(this.program.programId, chain),
      peer: (chain: Chain, peerAddress: UniversalAddress) => pda.peer(this.program.programId, chain, peerAddress),
      signerSequence: (signer: PublicKey) => pda.signerSequence(this.program.programId, signer),
    };
  }

  get read(): ReadTbrAccounts {
    return {
      config: () => this.program.account.tbrConfigState.fetch(this.address.config()),
      chainConfig: (chain: Chain) => this.program.account.chainConfigState.fetch(this.address.chainConfig(chain)),
      peer: (chain: Chain, peerAddress: UniversalAddress) => this.program.account.peerState.fetch(this.address.peer(chain, peerAddress)),
      signerSequence: (signer: PublicKey) => this.program.account.signerSequenceState.fetch(this.address.signerSequence(signer)),
    };
  }

  async initialize(owner: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.initialize().accounts({
      owner,
    }).instruction()
  }

  /* Roles */

  async submitOwnerTransferRequest(signer: PublicKey, newOwner: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.submitOwnerTransferRequest(newOwner).accounts({
      signer,
    }).instruction();
  }

  async confirmOwnerTransferRequest(signer: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.confirmOwnerTransferRequest().accounts({
      signer,
    }).instruction()
  }

  async cancelOwnerTransferRequest(signer: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.cancelOwnerTransferRequest().accounts({
      signer,
    }).instruction()
  }

  async updateAdmin(signer: PublicKey, newAdmin: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateAdmin(newAdmin).accounts({
      signer,
    }).instruction()
  }

  /* Peer management */

  async registerPeer(signer: PublicKey, chain: Chain, peerAddress: UniversalAddress): Promise<web3.TransactionInstruction> {
    return this.program.methods.registerPeer(chainToChainId(chain), Array.from(peerAddress)).accountsStrict({
      signer,
      tbrConfig: this.address.config(),
      peer: this.address.peer(chain, peerAddress),
      chainConfig: this.address.chainConfig(chain),
      systemProgram: SYSTEM_PROGRAM_ID,
    }).instruction()
  }

  async updateCanonicalPeer(signer: PublicKey, chain: Chain, peerAddress: UniversalAddress): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateCanonicalPeer(chainToChainId(chain), Array.from(peerAddress)).accountsStrict({
      owner: signer,
      tbrConfig: this.address.config(),
      peer: this.address.peer(chain, peerAddress),
      chainConfig: this.address.chainConfig(chain),
      systemProgram: SYSTEM_PROGRAM_ID,
    }).instruction()
  }

  /* Config update */

  async setPauseForOutboundTransfers(signer: PublicKey, paused: boolean): Promise<web3.TransactionInstruction> {
    return this.program.methods.setPauseForOutboundTransfers(paused).accounts({
      signer,
    }).instruction()
  }

  async updateFeeRecipient(signer: PublicKey, newFeeRecipient: PublicKey): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateFeeRecipient(newFeeRecipient).accounts({
      signer,
    }).instruction()
  }

  async updateMaxGasDropoff(
    signer: PublicKey,
    chain: Chain,
    maxGasDropoff: BN,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateMaxGasDropoff(chainToChainId(chain), maxGasDropoff).accountsStrict({
      signer,
      chainConfig: this.address.chainConfig(chain),
      tbrConfig: this.address.config(),
    }).instruction()
  }

  async updateRelayerFee(signer: PublicKey, relayerFee: BN): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateRelayerFee(relayerFee).accounts({
      signer,
    }).instruction()
  }

  async updateEvmTransactionConfig(
    signer: PublicKey,
    evmTransactionGas: BN,
    evmTransactionSize: BN,
  ): Promise<web3.TransactionInstruction> {
    return this.program.methods.updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize).accounts({
      signer,
    }).instruction()
  }

  /* Transfers */

  async transferNativeTokens(signer: PublicKey, params: TransferNativeParameters): Promise<web3.TransactionInstruction> {
    const {
      recipientChain,
      recipientAddress,
      mint,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeSol,
    } = params;

    const { feeRecipient } = await this.read.config();
    let payerSequenceNumber = new BN(0);
    try {
      payerSequenceNumber = (await this.read.signerSequence(signer)).value;
    } catch { };
    const tokenBridgeAccounts = transferNativeTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      mint,
    });

    return this.program.methods.transferNativeTokens(
      chainToChainId(recipientChain),
      Array.from(recipientAddress),
      transferredAmount,
      gasDropoffAmount,
      maxFeeSol,
    ).accountsPartial({
      payer: signer,
      tbrConfig: this.address.config(),
      chainConfig: this.address.chainConfig(recipientChain),
      mint,
      userTokenAccount,
      temporaryAccount: pda.temporary(this.program.programId, mint),
      feeRecipient,
      oracleConfig: this.quoterClient.address.config(),
      oracleEvmPrices: this.quoterClient.address.evmPrices(recipientChain),
      ...tokenBridgeAccounts,
      wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
      payerSequence: this.address.signerSequence(signer),
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
    }).instruction()
  }

  async transferWrappedTokens(signer: PublicKey, params: TransferWrappedParameters): Promise<web3.TransactionInstruction> {
    const {
      recipientChain,
      recipientAddress,
      userTokenAccount,
      transferredAmount,
      gasDropoffAmount,
      maxFeeSol,
    } = params;

    const chainId = chainToChainId(recipientChain);

    const { feeRecipient } = await this.read.config();
    let payerSequenceNumber = new BN(0);
    try {
      payerSequenceNumber = (await this.read.signerSequence(signer)).value;
    } catch { };
    const tokenBridgeAccounts = transferWrappedTokenBridgeAccounts({
      programId: this.program.programId,
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      tokenChain: chainId,
      tokenAddress: Buffer.from(recipientAddress),
    });

    return this.program.methods.transferWrappedTokens(
      chainId,
      Array.from(recipientAddress),
      transferredAmount,
      gasDropoffAmount,
      maxFeeSol,
    ).accountsPartial({
      payer: signer,
      tbrConfig: this.address.config(),
      chainConfig: this.address.chainConfig(recipientChain),
      userTokenAccount,
      temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
      feeRecipient,
      oracleConfig: this.quoterClient.address.config(),
      oracleEvmPrices: this.quoterClient.address.evmPrices(recipientChain),
      ...tokenBridgeAccounts,
      wormholeMessage: pda.wormholeMessage(this.program.programId, signer, payerSequenceNumber),
      payerSequence: this.address.signerSequence(signer),
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
    }).instruction()
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
    vaa: VAA<"TokenBridge:TransferWithPayload">,
    recipientTokenAccount: PublicKey,
    recipient: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeNativeTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });

    return this.program.methods.completeNativeTransfer(Array.from(vaa.hash)).accountsPartial({
      payer: signer,
      tbrConfig: this.address.config(),
      recipientTokenAccount,
      recipient,
      vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
      temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
      ...tokenBridgeAccounts,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
    }).instruction()
  }

  async completeWrappedTransfer(
    signer: PublicKey,
    vaa: VAA<"TokenBridge:TransferWithPayload">,
    recipientTokenAccount: PublicKey,
    recipient: PublicKey,
  ): Promise<web3.TransactionInstruction> {
    const tokenBridgeAccounts = completeWrappedTokenBridgeAccounts({
      tokenBridgeProgramId: this.tokenBridgeProgramId,
      wormholeProgramId: this.wormholeProgramId,
      vaa,
    });

    return this.program.methods.completeWrappedTransfer(Array.from(vaa.hash)).accountsPartial({
      payer: signer,
      tbrConfig: this.address.config(),
      recipientTokenAccount,
      recipient,
      vaa: pda.vaa(this.wormholeProgramId, vaa.hash),
      temporaryAccount: pda.temporary(this.program.programId, tokenBridgeAccounts.mint),
      ...tokenBridgeAccounts,
      tokenBridgeProgram: this.tokenBridgeProgramId,
      wormholeProgram: this.wormholeProgramId,
    }).instruction()
  }
}


const chainSeed = (chain: Chain) => encoding.bignum.toBytes(chainToChainId(chain), 2);
const pda = {
  tbrConfig: (programId: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('redeemer')],
      programId,
    )[0]
  },

  peer: (programId: PublicKey, chain: Chain, peerAddress: UniversalAddress): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('peer'),
        chainSeed(chain),
        Buffer.from(peerAddress),
      ],
      programId,
    )[0]
  },

  chainConfig: (programId: PublicKey, chain: Chain): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('chainconfig'),
        chainSeed(chain),
      ],
      programId,
    )[0]
  },

  signerSequence: (programId: PublicKey, signer: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('seq'),
        signer.toBuffer(),
      ],
      programId,
    )[0]
  },

  // Internal:

  temporary: (programId: PublicKey, mint: PublicKey): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('tmp'),
        mint.toBuffer(),
      ],
      programId,
    )[0]
  },

  vaa: (programId: PublicKey, vaaHash: Uint8Array): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('PostedVAA'),
        vaaHash,
      ],
      programId,
    )[0]
  },

  wormholeMessage: (programId: PublicKey, payer: PublicKey, payerSequence: BN): PublicKey => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('bridged'),
        payer.toBuffer(),
        payerSequence.toBuffer(),
      ],
      programId,
    )[0]
  },
}

function transferNativeTokenBridgeAccounts(params: {
  programId: PublicKey,
  tokenBridgeProgramId: PublicKey,
  wormholeProgramId: PublicKey,
  mint: PublicKey,
}): {
  tokenBridgeConfig: PublicKey,
  tokenBridgeCustody: PublicKey,
  tokenBridgeAuthoritySigner: PublicKey,
  tokenBridgeCustodySigner: PublicKey,
  tokenBridgeWrappedMeta: null,
  wormholeBridge: PublicKey,
  tokenBridgeEmitter: PublicKey,
  tokenBridgeSequence: PublicKey,
} {
  const {
    programId,
    tokenBridgeProgramId,
    wormholeProgramId,
    mint,
  } = params;

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
    mint
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
  programId: PublicKey,
  tokenBridgeProgramId: PublicKey,
  wormholeProgramId: PublicKey,
  tokenChain: number,
  tokenAddress: Buffer,
}): {
  tokenBridgeConfig: PublicKey,
  tokenBridgeCustody: null,
  tokenBridgeAuthoritySigner: PublicKey,
  tokenBridgeCustodySigner: null,
  tokenBridgeWrappedMeta: PublicKey,
  wormholeBridge: PublicKey,
  tokenBridgeEmitter: PublicKey,
  tokenBridgeSequence: PublicKey,
  mint: PublicKey,
} {
  const {
    programId,
    tokenBridgeProgramId,
    wormholeProgramId,
    tokenChain,
    tokenAddress,
  } = params;

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
  tokenBridgeProgramId: PublicKey,
  wormholeProgramId: PublicKey,
  vaa: VAA<"TokenBridge:TransferWithPayload">,
}): {
  tokenBridgeConfig: PublicKey,
  tokenBridgeClaim: PublicKey,
  tokenBridgeForeignEndpoint: PublicKey,
  tokenBridgeCustody: PublicKey,
  tokenBridgeCustodySigner: PublicKey,
  tokenBridgeMintAuthority: null,
  tokenBridgeWrappedMeta: null,
  mint: PublicKey,
} {
  const {
    tokenBridgeProgramId,
    wormholeProgramId,
    vaa,
  } = params;

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
    PublicKey.default
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
  }
}

function completeWrappedTokenBridgeAccounts(params: {
  tokenBridgeProgramId: PublicKey,
  wormholeProgramId: PublicKey,
  vaa: VAA<"TokenBridge:TransferWithPayload">,
}): {
  tokenBridgeConfig: PublicKey,
  tokenBridgeClaim: PublicKey,
  tokenBridgeForeignEndpoint: PublicKey,
  tokenBridgeCustody: null,
  tokenBridgeCustodySigner: null,
  tokenBridgeMintAuthority: PublicKey,
  tokenBridgeWrappedMeta: PublicKey,
  mint: PublicKey
} {
  const {
    tokenBridgeProgramId,
    wormholeProgramId,
    vaa,
  } = params;

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
    PublicKey.default
  );

  return {
    tokenBridgeConfig,
    tokenBridgeClaim,
    tokenBridgeForeignEndpoint,
    tokenBridgeCustody: null,
    tokenBridgeCustodySigner: null,
    tokenBridgeMintAuthority,
    tokenBridgeWrappedMeta,
    mint: tokenBridgeWrappedMint
  };
}
