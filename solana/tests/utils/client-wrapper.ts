import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, TransactionSignature } from '@solana/web3.js';
import { Chain, Network } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
  VaaMessage,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { sendAndConfirmIx, wormholeProgramId, tokenBridgeProgramId } from './helpers.js';
import { SolanaWormholeCore } from '@wormhole-foundation/sdk-solana-core';
import { SolanaAutomaticTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';

export class TbrWrapper {
  private readonly client: SolanaTokenBridgeRelayer;
  readonly provider: AnchorProvider;
  readonly logs: { [key: string]: string[] };
  readonly logsSubscriptionId: number;

  constructor(
    provider: AnchorProvider,
    network: Network,
    accountType: 'owner' | 'admin' | 'regular',
  ) {
    this.provider = provider;
    if (accountType === 'regular') {
      this.client = new SolanaTokenBridgeRelayer(provider, network);
    } else {
      this.client = new SolanaTokenBridgeRelayer({ connection: provider.connection }, network);
    }
    this.logs = {};

    this.logsSubscriptionId = provider.connection.onLogs(
      'all',
      (l) => (this.logs[l.signature] = l.logs),
    );
  }

  get publicKey(): PublicKey {
    return this.provider.publicKey;
  }

  get read() {
    return this.client.read;
  }

  async close() {
    await this.provider.connection.removeOnLogsListener(this.logsSubscriptionId);
  }

  displayLogs(signature: string) {
    let lines = this.logs[signature];
    if (lines === undefined) {
      lines = ['<logs not found>'];
    }
    console.log(`Signature '${signature}':`);
    for (const line of lines) {
      console.log(`  > ${line}`);
    }
  }

  static async initialize(args: {
    network: Network;
    owner: PublicKey;
    feeRecipient: PublicKey;
    admins: PublicKey[];
  }): Promise<TransactionSignature> {
    const provider = AnchorProvider.env();
    const client = new SolanaTokenBridgeRelayer(provider, 'Devnet');
    console.log('provider key', provider.publicKey);

    return sendAndConfirmIx(
      client.initialize({
        deployer: provider.publicKey,
        ...args,
      }),
      provider,
    );
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

  async addAdmin(newAdmin: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIx(this.client.addAdmin(this.publicKey, newAdmin), this.provider);
  }

  async removeAdmin(adminToRemove: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIx(this.client.removeAdmin(this.publicKey, adminToRemove), this.provider);
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

  async updateMaxGasDropoff(chain: Chain, maxGasDropoff: number): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.updateMaxGasDropoff(this.publicKey, chain, maxGasDropoff),
      this.provider,
    );
  }

  async updateRelayerFee(chain: Chain, relayerFee: number): Promise<TransactionSignature> {
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
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.completeNativeTransfer(this.publicKey, vaa, recipientTokenAccount),
      this.provider,
    );
  }

  async completeWrappedTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIx(
      this.client.completeWrappedTransfer(this.publicKey, vaa, recipientTokenAccount),
      this.provider,
    );
  }

  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    return this.client.relayingFee(chain, dropoffAmount);
  }
}

export class WormholeCoreWrapper {
  public readonly provider: AnchorProvider;
  public readonly client: SolanaWormholeCore<'Mainnet', 'Solana'>;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.client = new SolanaWormholeCore('Mainnet', 'Solana', provider.connection, {
      tokenBridge: tokenBridgeProgramId.toString(),
    });
  }

  async initialize() {
    //todo
  }
}

export class TokenBridgeWrapper {
  public readonly provider: AnchorProvider;
  public readonly client: SolanaAutomaticTokenBridge<'Mainnet', 'Solana'>;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.client = new SolanaAutomaticTokenBridge('Mainnet', 'Solana', provider.connection, {
      coreBridge: wormholeProgramId.toString(),
    });
  }

  async initialize() {
    //todo
  }
}
