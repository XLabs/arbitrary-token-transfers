import { PublicKey } from '@solana/web3.js';
import { Chain, chainToChainId } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';

export class WormholeCorePdas {
  constructor(public programId: PublicKey) {}

  private pda(...seeds: Array<Buffer | Uint8Array>) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }

  guardianSet() {
    return this.pda(Buffer.from('GuardianSet'), Buffer.from([0, 0, 0, 0]));
  }

  bridge() {
    return this.pda(Buffer.from('Bridge'));
  }

  feeCollector() {
    return this.pda(Buffer.from('fee_collector'));
  }
}

export class TokenBridgePdas {
  constructor(public programId: PublicKey) {}

  private pda(...seeds: Array<Buffer | Uint8Array>) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }

  config() {
    return this.pda(Buffer.from('config'));
  }

  endpoint(chain: Chain, address: UniversalAddress) {
    const chainBytes = Buffer.alloc(2);
    chainBytes.writeUInt16BE(chainToChainId(chain));

    return this.pda(chainBytes, address.toUint8Array());
  }

  claim(emitterAddress: UniversalAddress, sequence: bigint) {
    const sequenceBytes = Buffer.alloc(8);
    sequenceBytes.writeBigUInt64BE(sequence);

    return this.pda(emitterAddress.toUint8Array(), Buffer.from([0, 1]), sequenceBytes);
  }
}
