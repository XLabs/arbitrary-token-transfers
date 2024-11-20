import { SolanaTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { Chain, layout, Network } from '@wormhole-foundation/sdk-base';
import { Contracts, UniversalAddress, createVAA } from '@wormhole-foundation/sdk-definitions';
import { mocks } from '@wormhole-foundation/sdk-definitions/testing';
import { utils as coreUtils } from '@wormhole-foundation/sdk-solana-core';

import { getBlockTime, sendAndConfirm } from './helpers.js';
import { SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { signAndSendWait } from '@wormhole-foundation/sdk-connect';
import { layoutItems } from '@wormhole-foundation/sdk-definitions';

/** A Token Bridge wrapper allowing to write tests using this program in a local environment. */
export class TestingTokenBridge<N extends Network> {
  static sequence = 100n;
  public readonly signer: Signer;
  public readonly client: SolanaTokenBridge<N, 'Solana'>;
  public readonly guardians: mocks.MockGuardians;

  /**
   *
   * @param solanaProgram The Solana Program used as a destination for the VAAs, _i.e._ the program being tested.
   * @param contracts At least the addresses `coreBridge` and `tokenBridge` must be provided.
   */
  constructor(
    signer: Signer,
    connection: Connection,
    network: N,
    guardians: mocks.MockGuardians,
    contracts: Contracts,
  ) {
    this.signer = signer;
    this.guardians = guardians;
    this.client = new SolanaTokenBridge(network, 'Solana', connection, contracts);
  }

  get coreBridgeId() {
    return this.client.coreBridge.coreBridge.programId;
  }

  get keypair() {
    return Keypair.fromSecretKey(this.signer.secretKey);
  }

  get pda() {
    return {
      config: () => this.findPda(Buffer.from('config')),

      endpoint: (chain: Chain, address: UniversalAddress) => {
        return this.findPda(
          layout.serializeLayout({ ...layoutItems.chainItem(), endianness: 'big' }, chain),
          address.toUint8Array(),
        );
      },

      claim: (emitterAddress: UniversalAddress, sequence: bigint) => {
        const sequenceBytes = Buffer.alloc(8);
        sequenceBytes.writeBigUInt64BE(sequence);

        return this.findPda(emitterAddress.toUint8Array(), Buffer.from([0, 1]), sequenceBytes);
      },
    };
  }

  async initialize() {
    const ix = await this.client.tokenBridge.methods
      .initialize(this.coreBridgeId)
      .accounts({
        payer: this.signer.publicKey,
        config: this.pda.config(),
      })
      .instruction();

    return await sendAndConfirm(this.client.connection, ix, this.signer);
  }

  async registerPeer(chain: Chain, address: UniversalAddress) {
    const sequence = TestingTokenBridge.sequence++;
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
    const vaa = this.guardians.addSignatures(rawVaa, [0]);
    const txs = this.client.coreBridge.postVaa(this.signer.publicKey, vaa);
    const signer = new SolanaSendSigner(this.client.connection, 'Solana', this.keypair, false, {});
    await signAndSendWait(txs, signer);

    const vaaAddress = coreUtils.derivePostedVaaKey(this.coreBridgeId, Buffer.from(vaa.hash));

    const ix = await this.client.tokenBridge.methods
      .registerChain()
      .accounts({
        payer: this.signer.publicKey,
        vaa: vaaAddress,
        endpoint: this.pda.endpoint(chain, address),
        config: this.pda.config(),
        claim: this.pda.claim(emitterAddress, sequence),
        wormholeProgram: this.coreBridgeId,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendAndConfirm(this.client.connection, ix, this.signer);
  }

  async attestToken(
    emitter: UniversalAddress,
    chain: Chain,
    mint: UniversalAddress,
    info: { decimals: number },
  ) {
    const signer = new SolanaSendSigner(this.client.connection, 'Solana', this.keypair, false, {});

    const sequence = TestingTokenBridge.sequence++;
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
    const vaa = this.guardians.addSignatures(rawVaa, [0]);
    const txsPostVaa = this.client.coreBridge.postVaa(this.signer.publicKey, vaa);
    await signAndSendWait(txsPostVaa, signer);

    const txsAttest = this.client.submitAttestation(rawVaa, this.signer.publicKey);
    await signAndSendWait(txsAttest, signer);
  }

  private findPda(...seeds: Array<Buffer | Uint8Array>) {
    return PublicKey.findProgramAddressSync(seeds, this.client.tokenBridge.programId)[0];
  }
}
