import { AnchorProvider } from '@coral-xyz/anchor';
import anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, TransactionSignature } from '@solana/web3.js';
import { Chain, encoding } from '@wormhole-foundation/sdk-base';
import { deserializePayload, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  SolanaPriceOracle,
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
  VaaMessage,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import {
  getBlockTime,
  sendAndConfirmIxs,
  TestProvider,
  TestsHelper,
  WormholeContracts,
} from './helpers.js';
import { SolanaWormholeCore, utils as coreUtils } from '@wormhole-foundation/sdk-solana-core';
import { SolanaTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';
import { mocks } from '@wormhole-foundation/sdk-definitions/testing';
import { SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { signAndSendWait } from '@wormhole-foundation/sdk-connect';

import testProgramKeypair from '../../programs/token-bridge-relayer/test-program-keypair.json' with { type: 'json' };
import { deserializeTbrV3Message, serializeTbrV3Message } from 'common-arbitrary-token-transfer';

const $ = new TestsHelper();

export class TbrWrapper {
  readonly client: SolanaTokenBridgeRelayer;
  readonly provider: TestProvider;
  readonly logs: { [key: string]: string[] };
  readonly logsSubscriptionId: number;

  constructor(provider: TestProvider, tbrClient: SolanaTokenBridgeRelayer) {
    this.provider = provider;
    this.client = tbrClient;
    this.logs = {};

    this.logsSubscriptionId = provider.connection.onLogs(
      'all',
      (l) => (this.logs[l.signature] = l.logs),
    );
  }

  static from(
    provider: TestProvider,
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

  static async create(provider: TestProvider) {
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
      { signers },
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
  private sequence = 0n;
  public readonly guardians: mocks.MockGuardians;

  constructor(provider: AnchorProvider) {
    this.provider = provider;

    this.client = new SolanaWormholeCore(
      WormholeContracts.Network,
      'Solana',
      provider.connection,
      WormholeContracts.addresses,
    );
    (this.client.coreBridge.idl.instructions[0].accounts[1].isSigner as boolean) = true;

    const guardianKey = 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0';
    this.guardians = new mocks.MockGuardians(0, [guardianKey]);
  }

  async initialize() {
    const guardianSetExpirationTime = 1_000_000;
    const fee = new anchor.BN(1_000_000);
    const initialGuardians = [
      Array.from(encoding.hex.decode('beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe')), //address associated with the private key
    ];

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

    return await sendAndConfirmIxs(this.provider, ix, { signers: [guardianSet] });
  }

  async parseVaa(key: PublicKey) {
    const vaa = await this.client.parsePostMessageAccount(key);
    const payload = deserializePayload('TokenBridge:TransferWithPayload', vaa.payload);
    const innerPayload = deserializeTbrV3Message(payload.payload);

    return { ...vaa, payload: { ...payload, payload: innerPayload } };
  }

  async postVaa(
    payer: Keypair,
    guardians: mocks.MockGuardians,
    sourceChain: Chain,
    sourceAddress: UniversalAddress,
    message_: { recipient: UniversalAddress; gasDropoff: number; unwrapIntent?: boolean },
  ): Promise<PublicKey> {
    const message = { unwrapIntent: message_.unwrapIntent ?? false, ...message_ };
    const seq = this.sequence++;
    const timestamp = await getBlockTime(this.client.connection);

    const emittingPeer = new mocks.MockEmitter(sourceAddress, sourceChain, seq);

    const published = emittingPeer.publishMessage(
      0, // nonce,
      serializeTbrV3Message(message),
      0, // consistencyLevel
      timestamp,
    );
    const vaa = guardians.addSignatures(published, [0]);

    const txs = this.client.postVaa(payer.publicKey, vaa);
    const signer = new SolanaSendSigner(this.client.connection, 'Solana', payer, false, {});
    await signAndSendWait(txs, signer);

    return coreUtils.derivePostedVaaKey(WormholeContracts.coreBridge, Buffer.from(vaa.hash));
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
