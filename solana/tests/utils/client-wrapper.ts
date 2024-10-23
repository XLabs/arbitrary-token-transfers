import { AnchorProvider } from '@coral-xyz/anchor';
import anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, TransactionSignature } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  SolanaPriceOracle,
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
  VaaMessage,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { sendAndConfirmIxs, TestsHelper, WormholeContracts } from './helpers.js';
import { SolanaWormholeCore } from '@wormhole-foundation/sdk-solana-core';
import { SolanaTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';

import testProgramKeypair from '../../programs/token-bridge-relayer/test-program-keypair.json' with { type: 'json' };

const $ = new TestsHelper();

export class TbrWrapper {
  readonly client: SolanaTokenBridgeRelayer;
  readonly provider: AnchorProvider;
  readonly logs: { [key: string]: string[] };
  readonly logsSubscriptionId: number;

  constructor(provider: AnchorProvider, tbrClient: SolanaTokenBridgeRelayer) {
    this.provider = provider;
    this.client = tbrClient;
    this.logs = {};

    this.logsSubscriptionId = provider.connection.onLogs(
      'all',
      (l) => (this.logs[l.signature] = l.logs),
    );
  }

  static from(
    provider: AnchorProvider,
    accountType: 'owner' | 'admin' | 'regular',
    oracleClient: SolanaPriceOracle,
  ) {
    const clientProvider =
      accountType === 'regular' ? provider : { connection: provider.connection };

    const client = new SolanaTokenBridgeRelayer(
      clientProvider,
      'Localnet',
      $.pubkey.from(testProgramKeypair),
      oracleClient,
    );

    return new TbrWrapper(provider, client);
  }

  static async create(provider: AnchorProvider) {
    const client = await SolanaTokenBridgeRelayer.create({ connection: provider.connection });

    return new TbrWrapper(provider, client);
  }

  get publicKey(): PublicKey {
    return this.provider.publicKey;
  }

  get account() {
    return this.client.account;
  }

  get read() {
    return this.client.read;
  }

  /** Unregister the logs event so that the test does not hang. */
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

  async initialize(args: {
    owner: PublicKey;
    feeRecipient: PublicKey;
    admins: PublicKey[];
  }): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, await this.client.initialize(args));
  }

  async submitOwnerTransferRequest(newOwner: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, await this.client.submitOwnerTransferRequest(newOwner));
  }

  async confirmOwnerTransferRequest(): Promise<TransactionSignature> {
    return await sendAndConfirmIxs(this.provider, await this.client.confirmOwnerTransferRequest());
  }

  async cancelOwnerTransferRequest(): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, await this.client.cancelOwnerTransferRequest());
  }

  async addAdmin(newAdmin: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(this.provider, await this.client.addAdmin(newAdmin));
  }

  async removeAdmin(adminToRemove: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.removeAdmin(this.publicKey, adminToRemove),
    );
  }

  async registerPeer(chain: Chain, peerAddress: UniversalAddress): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.registerPeer(this.publicKey, chain, peerAddress),
    );
  }

  async updateCanonicalPeer(
    chain: Chain,
    peerAddress: UniversalAddress,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.updateCanonicalPeer(chain, peerAddress),
    );
  }

  async setPauseForOutboundTransfers(chain: Chain, paused: boolean): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.setPauseForOutboundTransfers(this.publicKey, chain, paused),
    );
  }

  async updateMaxGasDropoff(chain: Chain, maxGasDropoff: number): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.updateMaxGasDropoff(this.publicKey, chain, maxGasDropoff),
    );
  }

  async updateRelayerFee(chain: Chain, relayerFee: number): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.updateRelayerFee(this.publicKey, chain, relayerFee),
    );
  }

  async updateFeeRecipient(newFeeRecipient: PublicKey): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.updateFeeRecipient(this.publicKey, newFeeRecipient),
    );
  }

  async updateEvmTransactionConfig(
    evmTransactionGas: bigint,
    evmTransactionSize: bigint,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.updateEvmTransactionConfig(
        this.publicKey,
        evmTransactionGas,
        evmTransactionSize,
      ),
    );
  }

  async transferNativeTokens(
    params: TransferNativeParameters,
    signers?: Keypair[],
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.transferNativeTokens(this.publicKey, params),
      signers,
    );
  }

  async transferWrappedTokens(params: TransferWrappedParameters): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.transferWrappedTokens(this.publicKey, params),
    );
  }

  async completeNativeTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.completeNativeTransfer(this.publicKey, vaa, recipientTokenAccount),
    );
  }

  async completeWrappedTransfer(
    vaa: VaaMessage,
    recipientTokenAccount: PublicKey,
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.completeWrappedTransfer(this.publicKey, vaa, recipientTokenAccount),
    );
  }

  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    return this.client.relayingFee(chain, dropoffAmount);
  }
}

export class WormholeCoreWrapper {
  public readonly provider: AnchorProvider;
  public readonly client: SolanaWormholeCore<typeof WormholeContracts.Network, 'Solana'>;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.client = new SolanaWormholeCore(
      WormholeContracts.Network,
      'Solana',
      provider.connection,
      WormholeContracts.addresses,
    );
    (this.client.coreBridge.idl.instructions[0].accounts[1].isSigner as boolean) = true;
  }

  async initialize() {
    const guardianSetExpirationTime = 1_000_000;
    const fee = new anchor.BN(1_000_000);
    const initialGuardians: number[][] = [];

    const guardianSet = await $.airdrop(Keypair.generate());
    const bridge = PublicKey.findProgramAddressSync(
      [Buffer.from('Bridge')],
      WormholeContracts.coreBridge,
    )[0];
    const feeCollector = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_collector')],
      WormholeContracts.coreBridge,
    )[0];

    // https://github.com/wormhole-foundation/wormhole/blob/main/solana/bridge/program/src/api/initialize.rs
    const ix = await this.client.coreBridge.methods
      .initialize(guardianSetExpirationTime, fee, initialGuardians)
      .accounts({
        bridge,
        guardianSet: guardianSet.publicKey,
        feeCollector,
        payer: this.provider.publicKey,
      })
      .signers([guardianSet])
      .instruction();

    return await sendAndConfirmIxs(this.provider, ix, [guardianSet]);
  }
}

export class TokenBridgeWrapper {
  public readonly provider: AnchorProvider;
  public readonly client: SolanaTokenBridge<typeof WormholeContracts.Network, 'Solana'>;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.client = new SolanaTokenBridge(
      WormholeContracts.Network,
      'Solana',
      provider.connection,
      WormholeContracts.addresses,
    );
  }

  async initialize() {
    const config = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      WormholeContracts.tokenBridge,
    )[0];

    const ix = await this.client.tokenBridge.methods
      .initialize(WormholeContracts.coreBridge)
      .accounts({
        payer: this.provider.publicKey,
        config,
      })
      .instruction();

    return await sendAndConfirmIxs(this.provider, ix);
  }
}
