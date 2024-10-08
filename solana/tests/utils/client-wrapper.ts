import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, TransactionSignature } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
  VaaMessage,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import {
  sendAndConfirmIxs,
  wormholeProgramId,
  tokenBridgeProgramId,
  newProvider,
  keypairFromFile,
} from './helpers.js';
import { SolanaWormholeCore } from '@wormhole-foundation/sdk-solana-core';
import { SolanaAutomaticTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';

const LOCALNET_ADDRESS = '7TLiBkpDGshV4o3jmacTCx93CLkmo3VjZ111AsijN9f8';

export class TbrWrapper {
  readonly client: SolanaTokenBridgeRelayer;
  readonly provider: AnchorProvider;
  readonly logs: { [key: string]: string[] };
  readonly logsSubscriptionId: number;

  constructor(provider: AnchorProvider, accountType: 'owner' | 'admin' | 'regular') {
    this.provider = provider;
    if (accountType === 'regular') {
      this.client = new SolanaTokenBridgeRelayer(provider, LOCALNET_ADDRESS);
    } else {
      this.client = new SolanaTokenBridgeRelayer({ connection: provider.connection }, LOCALNET_ADDRESS);
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
    owner: PublicKey;
    feeRecipient: PublicKey;
    admins: PublicKey[];
  }): Promise<TransactionSignature> {
    const authorityProvider = newProvider(
      await keypairFromFile('./target/deploy/token_bridge_relayer-keypair.json'),
    );
    const client = new SolanaTokenBridgeRelayer(authorityProvider);
    console.log('Authority Key --', authorityProvider.publicKey.toString());
    console.log('Program ID -----', client.program.programId.toString());

    return sendAndConfirmIxs(authorityProvider, await client.initialize(args));
  }

  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, this.client.submitOwnerTransferRequest(newOwner));
  }

  async confirmOwnerTransferRequest(): Promise<TransactionSignature> {
    return await sendAndConfirmIxs(this.provider, this.client.confirmOwnerTransferRequest());
  }

  async cancelOwnerTransferRequest(): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, this.client.cancelOwnerTransferRequest());
  }

  async addAdmin(newAdmin: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, this.client.addAdmin(newAdmin));
  }

  async removeAdmin(adminToRemove: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, this.client.removeAdmin(this.publicKey, adminToRemove));
  }

  async registerPeer(chain: Chain, peerAddress: UniversalAddress): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.registerPeer(this.publicKey, chain, peerAddress),
    );
  }

  async updateCanonicalPeer(
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, this.client.updateCanonicalPeer(chain, peerAddress));
  }

  async setPauseForOutboundTransfers(chain: Chain, paused: boolean): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.setPauseForOutboundTransfers(this.publicKey, chain, paused),
    );
  }

  async updateMaxGasDropoff(chain: Chain, maxGasDropoff: number): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.updateMaxGasDropoff(this.publicKey, chain, maxGasDropoff),
    );
  }

  async updateRelayerFee(chain: Chain, relayerFee: number): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.updateRelayerFee(this.publicKey, chain, relayerFee),
    );
  }

  async updateFeeRecipient(newFeeRecipient: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.updateFeeRecipient(this.publicKey, newFeeRecipient),
    );
  }

  async updateEvmTransactionConfig(
    evmTransactionGas: bigint,
    evmTransactionSize: bigint,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.updateEvmTransactionConfig(this.publicKey, evmTransactionGas, evmTransactionSize),
    );
  }

  async transferNativeTokens(params: TransferNativeParameters): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.transferNativeTokens(this.publicKey, params),
    );
  }

  async transferWrappedTokens(params: TransferWrappedParameters): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.transferWrappedTokens(this.publicKey, params),
    );
  }

  async completeNativeTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.completeNativeTransfer(this.publicKey, vaa, recipientTokenAccount),
    );
  }

  async completeWrappedTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      this.client.completeWrappedTransfer(this.publicKey, vaa, recipientTokenAccount),
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
