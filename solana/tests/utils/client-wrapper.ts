import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, TransactionSignature } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import {
  TbrClient,
  ReadTbrAccounts,
  TransferNativeParameters,
  TransferWrappedParameters,
  UniversalAddress,
  VaaMessage,
} from "@xlabs-xyz/solana-arbitrary-token-transfers";
import { sendAndConfirmIx } from "./helpers.js";

export class ClientWrapper {
  private readonly client: TbrClient;
  readonly provider: AnchorProvider;
  readonly logs: { [key: string]: string[] };

  constructor(
    provider: AnchorProvider,
    params: { tokenBridgeProgramId: PublicKey; wormholeProgramId: PublicKey },
  ) {
    this.provider = provider;
    this.client = new TbrClient(provider.connection, params);
    this.logs = {};

    provider.connection.onLogs('all', (l) => (this.logs[l.signature] = l.logs));
  }

  get publicKey(): PublicKey {
    return this.provider.publicKey;
  }

  get read(): ReadTbrAccounts {
    return this.client.read;
  }

  displayLogs(signature: string) {
    //console.log('ALL', this._logs);
    let lines = this.logs[signature];
    if (lines === undefined) {
      lines = ['<logs not found>'];
    }
    console.log(`Signature '${signature}':`);
    for (const line of lines) {
      console.log(`  > ${line}`);
    }
  }

  async initialize(): Promise<TransactionSignature> {
    return sendAndConfirmIx(this.client.initialize(this.provider.publicKey), this.provider);
  }

  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.submitOwnerTransferRequest(this.publicKey, newOwner),
      this.provider,
    );
  }

  async confirmOwnerTransferRequest(): Promise<TransactionSignature> {
    return await sendAndConfirmIx(
      this.client.confirmOwnerTransferRequest(this.publicKey),
      this.provider,
    );
  }

  async cancelOwnerTransferRequest(): Promise<TransactionSignature> {
    return sendAndConfirmIx(this.client.cancelOwnerTransferRequest(this.publicKey), this.provider);
  }

  async updateAdmin(newAdmin: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIx(this.client.updateAdmin(this.publicKey, newAdmin), this.provider);
  }

  async registerPeer(chain: Chain, peerAddress: UniversalAddress): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.registerPeer(this.publicKey, chain, peerAddress),
      this.provider,
    );
  }

  async updateCanonicalPeer(
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateCanonicalPeer(this.publicKey, chain, peerAddress),
      this.provider,
    );
  }

  async setPauseForOutboundTransfers(chain: Chain, paused: boolean): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.setPauseForOutboundTransfers(this.publicKey, chain, paused),
      this.provider,
    );
  }

  async updateMaxGasDropoff(chain: Chain, maxGasDropoff: BN): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateMaxGasDropoff(this.publicKey, chain, maxGasDropoff),
      this.provider,
    );
  }

  async updateRelayerFee(chain: Chain, relayerFee: BN): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateRelayerFee(this.publicKey, chain, relayerFee),
      this.provider,
    );
  }

  async updateFeeRecipient(newFeeRecipient: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateFeeRecipient(this.publicKey, newFeeRecipient),
      this.provider,
    );
  }

  async updateEvmTransactionConfig(
    evmTransactionGas: BN,
    evmTransactionSize: BN,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateEvmTransactionConfig(this.publicKey, evmTransactionGas, evmTransactionSize),
      this.provider,
    );
  }

  async transferNativeTokens(params: TransferNativeParameters): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.transferNativeTokens(this.publicKey, params),
      this.provider,
    );
  }

  async transferWrappedTokens(params: TransferWrappedParameters): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.transferWrappedTokens(this.publicKey, params),
      this.provider,
    );
  }

  async completeNativeTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
    recipient: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.completeNativeTransfer(this.publicKey, vaa, recipientTokenAccount, recipient),
      this.provider,
    );
  }

  async completeWrappedTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
    recipient: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.completeWrappedTransfer(this.publicKey, vaa, recipientTokenAccount, recipient),
      this.provider,
    );
  }
}
