import anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  Chain,
  encoding,
  layout,
  Network,
  signAndSendWait,
} from '@wormhole-foundation/sdk-connect';
import { SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { SolanaWormholeCore, utils as coreUtils } from '@wormhole-foundation/sdk-solana-core';
import {
  serializePayload,
  serialize as serializeVaa,
  deserialize as deserializeVaa,
  UniversalAddress,
  createVAA,
  Contracts,
} from '@wormhole-foundation/sdk-definitions';
import { mocks } from '@wormhole-foundation/sdk-definitions/testing';
import { VaaMessage } from '@xlabs-xyz/solana-arbitrary-token-transfers';

import { getBlockTime, sendAndConfirmIxs, TestProvider } from './helpers.js';
import { accountDataLayout } from './layout.js';
import { serializeTbrV3Message } from 'common-arbitrary-token-transfer';

const guardianKey = 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0';
const guardianAddress = 'beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe';
const guardians = new mocks.MockGuardians(0, [guardianKey]);

export class WormholeCoreWrapper<N extends Network> {
  public readonly provider: TestProvider;
  public readonly client: SolanaWormholeCore<N, 'Solana'>;
  private sequence = 0n;
  private readonly toProgram: PublicKey;

  /**
   *
   * @param solanaProgram The Solana Program used as a destination for the VAAs, _i.e._ the program being tested.
   * @param contracts At least the core program address `coreBridge` must be provided.
   */
  constructor(provider: TestProvider, network: N, testedProgram: PublicKey, contracts: Contracts) {
    this.provider = provider;
    this.toProgram = testedProgram;
    this.client = new SolanaWormholeCore(network, 'Solana', provider.connection, contracts);
  }

  get guardians(): mocks.MockGuardians {
    return guardians;
  }

  get pda() {
    return {
      guardianSet: (): PublicKey =>
        this.findPda(Buffer.from('GuardianSet'), Buffer.from([0, 0, 0, 0])),
      bridge: (): PublicKey => this.findPda(Buffer.from('Bridge')),
      feeCollector: (): PublicKey => this.findPda(Buffer.from('fee_collector')),
    };
  }

  async initialize() {
    const guardianSetExpirationTime = 1_000_000;
    const fee = new anchor.BN(1_000_000);
    const initialGuardians = [Array.from(encoding.hex.decode(guardianAddress))];

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
        address: new UniversalAddress(this.toProgram.toBuffer()),
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

    return coreUtils.derivePostedVaaKey(this.client.coreBridge.programId, Buffer.from(vaa.hash));
  }

  private findPda(...seeds: Array<Buffer | Uint8Array>) {
    return PublicKey.findProgramAddressSync(seeds, this.client.coreBridge.programId)[0];
  }
}
