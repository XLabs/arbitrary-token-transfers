import { AnchorProvider } from '@coral-xyz/anchor';
import anchor from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
} from '@solana/web3.js';
import { Chain, chainToChainId, encoding, layout } from '@wormhole-foundation/sdk-base';
import {
  serializePayload,
  serialize as serializeVaa,
  deserialize as deserializeVaa,
  UniversalAddress,
  createVAA,
} from '@wormhole-foundation/sdk-definitions';
import {
  SolanaPriceOracle,
  SolanaTokenBridgeRelayer,
  TransferParameters,
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
import { serializeTbrV3Message } from 'common-arbitrary-token-transfer';
import { accountDataLayout } from './layout.js';
import { TokenBridgePdas, WormholeCorePdas } from './wormhole-pdas.js';

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
    debug: boolean,
  ) {
    const clientProvider =
      accountType === 'regular' ? provider : { connection: provider.connection };

    const client = new SolanaTokenBridgeRelayer(
      clientProvider,
      'Localnet',
      $.pubkey.from(testProgramKeypair),
      oracleClient,
      debug,
    );

    return new TbrWrapper(provider, client);
  }

  static async create(provider: TestProvider, debug: boolean) {
    const client = await SolanaTokenBridgeRelayer.create(
      { connection: provider.connection },
      debug,
    );

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

  async transferTokens(
    params: TransferParameters,
    signers?: Keypair[],
  ): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.transferTokens(this.publicKey, params),
      { signers },
    );
  }

  async completeTransfer(vaa: VaaMessage): Promise<TransactionSignature> {
    return sendAndConfirmIxs(
      this.provider,
      await this.client.completeTransfer(this.publicKey, vaa),
    );
  }

  async relayingFee(chain: Chain, dropoffAmount: number): Promise<number> {
    return this.client.relayingFee(chain, dropoffAmount);
  }
}

const guardianKey = 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0';
const guardians = new mocks.MockGuardians(0, [guardianKey]);

export class WormholeCoreWrapper {
  public readonly provider: AnchorProvider;
  public readonly client: SolanaWormholeCore<typeof WormholeContracts.Network, 'Solana'>;
  public readonly pda: WormholeCorePdas;
  private sequence = 0n;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.client = new SolanaWormholeCore(
      WormholeContracts.Network,
      'Solana',
      provider.connection,
      WormholeContracts.addresses,
    );
    this.pda = new WormholeCorePdas(WormholeContracts.coreBridge);
  }

  async initialize() {
    const guardianSetExpirationTime = 1_000_000;
    const fee = new anchor.BN(1_000_000);
    const initialGuardians = [
      Array.from(encoding.hex.decode('beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe')), //address associated with the private key
    ];

    // https://github.com/wormhole-foundation/wormhole/blob/main/solana/bridge/program/src/api/initialize.rs
    const ix = await this.client.coreBridge.methods
      .initialize(guardianSetExpirationTime, fee, initialGuardians)
      .accounts({
        bridge: this.pda.bridge(),
        guardianSet: this.pda.guardianSet(),
        feeCollector: this.pda.feeCollector(),
        payer: this.provider.publicKey,
      })
      .instruction();

    return await sendAndConfirmIxs(this.provider, ix);
  }

  /** Parse a VAA generated from the postVaa method, or from the Token Bridge during
   * and outbound transfer
   */
  async parseVaa(key: PublicKey): Promise<VaaMessage> {
    const info = await this.provider.connection.getAccountInfo(key);
    if (info === null) {
      throw new Error(`No message account exists at that address: ${key.toString()}`);
    }

    const message = layout.deserializeLayout(accountDataLayout, info.data);

    const vaa = createVAA('Uint8Array', {
      guardianSet: 0,
      timestamp: message.timestamp,
      nonce: message.nonce,
      emitterChain: message.emitterChain,
      emitterAddress: message.emitterAddress,
      sequence: message.sequence,
      consistencyLevel: message.consistencyLevel,
      signatures: [],
      payload: message.payload,
    });

    return deserializeVaa('TokenBridge:TransferWithPayload', serializeVaa(vaa));
  }

  /**
   * `source`: the peers (Token Bridge and TBR) emitting the transfer.
   * `token`: the origin of the token (chain and mint).
   */
  async postVaa(
    payer: Keypair,
    token: { amount: bigint; chain: Chain; address: UniversalAddress },
    source: { chain: Chain; tokenBridge: UniversalAddress; tbrPeer: UniversalAddress },
    message: { recipient: UniversalAddress; gasDropoff: number; unwrapIntent: boolean },
  ): Promise<PublicKey> {
    const seq = this.sequence++;
    const timestamp = await getBlockTime(this.client.connection);

    const emittingPeer = new mocks.MockEmitter(source.tokenBridge, source.chain, seq);

    const payload = serializePayload('TokenBridge:TransferWithPayload', {
      token,
      to: {
        address: new UniversalAddress($.pubkey.from(testProgramKeypair).toBuffer()),
        chain: 'Solana',
      },
      from: source.tbrPeer,
      payload: serializeTbrV3Message(message),
    });

    const published = emittingPeer.publishMessage(
      0, // nonce,
      payload,
      1, // consistencyLevel
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
  static sequence = 100n;
  public readonly provider: TestProvider;
  public readonly client: SolanaTokenBridge<typeof WormholeContracts.Network, 'Solana'>;
  public readonly pda: TokenBridgePdas;

  constructor(provider: TestProvider) {
    this.provider = provider;
    this.client = new SolanaTokenBridge(
      WormholeContracts.Network,
      'Solana',
      provider.connection,
      WormholeContracts.addresses,
    );
    this.pda = new TokenBridgePdas(WormholeContracts.tokenBridge);
  }

  async initialize() {
    const ix = await this.client.tokenBridge.methods
      .initialize(WormholeContracts.coreBridge)
      .accounts({
        payer: this.provider.publicKey,
        config: this.pda.config(),
      })
      .instruction();

    return await sendAndConfirmIxs(this.provider, ix);
  }

  async registerPeer(chain: Chain, address: UniversalAddress) {
    const sequence = TokenBridgeWrapper.sequence++;
    const timestamp = await getBlockTime(this.client.connection);
    const emitterAddress = new UniversalAddress('00'.repeat(31) + '04');
    const rawVaa = createVAA('TokenBridge:RegisterChain', {
      guardianSet: 0,
      timestamp,
      nonce: 0,
      emitterChain: 'Solana',
      emitterAddress,
      sequence,
      consistencyLevel: 1,
      signatures: [],
      payload: { chain: 'Solana', actionArgs: { foreignChain: chain, foreignAddress: address } },
    });
    const vaa = guardians.addSignatures(rawVaa, [0]);
    const txs = this.client.coreBridge.postVaa(this.provider.publicKey, vaa);
    const signer = new SolanaSendSigner(
      this.client.connection,
      'Solana',
      this.provider.keypair,
      false,
      {},
    );
    await signAndSendWait(txs, signer);

    const vaaAddress = coreUtils.derivePostedVaaKey(
      WormholeContracts.coreBridge,
      Buffer.from(vaa.hash),
    );

    const ix = await this.client.tokenBridge.methods
      .registerChain()
      .accounts({
        payer: this.provider.publicKey,
        vaa: vaaAddress,
        endpoint: this.pda.endpoint(chain, address),
        config: this.pda.config(),
        claim: this.pda.claim(emitterAddress, sequence),
        wormholeProgram: WormholeContracts.coreBridge,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendAndConfirmIxs(this.provider, ix);
  }

  async attestToken(
    emitter: UniversalAddress,
    chain: Chain,
    mint: UniversalAddress,
    info: { decimals: number },
  ) {
    const signer = new SolanaSendSigner(
      this.client.connection,
      'Solana',
      this.provider.keypair,
      false,
      {},
    );

    const sequence = TokenBridgeWrapper.sequence++;
    const timestamp = await getBlockTime(this.client.connection);
    const rawVaa = createVAA('TokenBridge:AttestMeta', {
      guardianSet: 0,
      timestamp,
      nonce: 0,
      emitterChain: chain,
      emitterAddress: emitter,
      sequence,
      consistencyLevel: 1,
      signatures: [],
      payload: {
        decimals: info.decimals,
        symbol: '12345678901234567890123456789012',
        name: '12345678901234567890123456789012',
        token: { chain, address: mint },
      },
    });
    const vaa = guardians.addSignatures(rawVaa, [0]);
    const txsPostVaa = this.client.coreBridge.postVaa(this.provider.publicKey, vaa);
    await signAndSendWait(txsPostVaa, signer);

    const txsAttest = this.client.submitAttestation(rawVaa, this.provider.publicKey);
    await signAndSendWait(txsAttest, signer);
  }
}
