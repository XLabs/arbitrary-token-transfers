import anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Signer, TransactionSignature } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  SolanaPriceOracle,
  SolanaTokenBridgeRelayer,
  TransferParameters,
  VaaMessage,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { TestsHelper } from './helpers.js';

import testProgramKeypair from '../../programs/token-bridge-relayer/test-program-keypair.json' with { type: 'json' };

const $ = new TestsHelper();

export class TbrWrapper {
  readonly client: SolanaTokenBridgeRelayer;
  readonly signer: Signer;
  readonly logs: { [key: string]: string[] };
  readonly logsSubscriptionId: number;

  constructor(signer: Signer, tbrClient: SolanaTokenBridgeRelayer) {
    this.client = tbrClient;
    this.signer = signer;
    this.logs = {};

    this.logsSubscriptionId = this.client.connection.onLogs(
      'all',
      (l) => (this.logs[l.signature] = l.logs),
    );
  }

  static from(signer: Signer, oracleClient: SolanaPriceOracle, debug: boolean) {
    const client = new SolanaTokenBridgeRelayer(
      oracleClient.connection,
      'Localnet',
      $.pubkey.from(testProgramKeypair),
      oracleClient,
      debug,
    );

    return new TbrWrapper(signer, client);
  }

  static async create(signer: Signer, connection: Connection, debug: boolean) {
    const client = await SolanaTokenBridgeRelayer.create(connection, debug);

    return new TbrWrapper(signer, client);
  }

  get publicKey(): PublicKey {
    return this.signer.publicKey;
  }

  get account() {
    return this.client.account;
  }

  get read() {
    return this.client.read;
  }

  /** Unregister the logs event so that the test does not hang. */
  async close() {
    await this.client.connection.removeOnLogsListener(this.logsSubscriptionId);
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

  async initialize(args: {
    owner: PublicKey;
    feeRecipient: PublicKey;
    admins: PublicKey[];
  }): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.initialize(args), this.signer);
  }

  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.submitOwnerTransferRequest(newOwner), this.signer);
  }

  async confirmOwnerTransferRequest(): Promise<TransactionSignature> {
    return await $.sendAndConfirm(await this.client.confirmOwnerTransferRequest(), this.signer);
  }

  async cancelOwnerTransferRequest(): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.cancelOwnerTransferRequest(), this.signer);
  }

  async addAdmin(newAdmin: PublicKey): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.addAdmin(newAdmin), this.signer);
  }

  async removeAdmin(adminToRemove: PublicKey): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.removeAdmin(this.publicKey, adminToRemove),
      this.signer,
    );
  }

  async registerPeer(chain: Chain, peerAddress: UniversalAddress): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.registerPeer(this.publicKey, chain, peerAddress),
      this.signer,
    );
  }

  async updateCanonicalPeer(
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.updateCanonicalPeer(chain, peerAddress), this.signer);
  }

  async setPauseForOutboundTransfers(chain: Chain, paused: boolean): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.setPauseForOutboundTransfers(this.publicKey, chain, paused),
      this.signer,
    );
  }

  async updateMaxGasDropoff(chain: Chain, maxGasDropoff: number): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.updateMaxGasDropoff(this.publicKey, chain, maxGasDropoff),
      this.signer,
    );
  }

  async updateRelayerFee(chain: Chain, relayerFee: number): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.updateRelayerFee(this.publicKey, chain, relayerFee),
      this.signer,
    );
  }

  async updateFeeRecipient(newFeeRecipient: PublicKey): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.updateFeeRecipient(this.publicKey, newFeeRecipient),
      this.signer,
    );
  }

  async updateEvmTransactionConfig(
    evmTransactionGas: bigint,
    evmTransactionSize: bigint,
  ): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.updateEvmTransactionConfig(
        this.publicKey,
        evmTransactionGas,
        evmTransactionSize,
      ),
      this.signer,
    );
  }

  /** Only the token owner can call this method. */
  async transferTokens(params: TransferParameters): Promise<TransactionSignature> {
    return $.sendAndConfirm(
      await this.client.transferTokens(this.publicKey, params),
      this.signer, //...signers
    );
  }

  async completeTransfer(vaa: VaaMessage): Promise<TransactionSignature> {
    return $.sendAndConfirm(await this.client.completeTransfer(this.publicKey, vaa), this.signer);
  }

  async relayingFeeSimulated(chain: Chain, dropoffAmount: number): Promise<number> {
    return this.client.relayingFeeSimulated(this.signer.publicKey, chain, dropoffAmount);
  }

  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    return this.client.relayingFee(chain, dropoffAmount);
  }
}