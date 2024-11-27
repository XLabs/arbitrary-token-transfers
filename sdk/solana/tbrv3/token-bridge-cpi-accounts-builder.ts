import { PublicKey } from '@solana/web3.js';
import * as tokenBridge from '@wormhole-foundation/sdk-solana-tokenbridge';
import { VaaMessage, WormholeAddress } from './token-bridge-relayer.js';
import { chainToChainId } from '@wormhole-foundation/sdk-base';

/** Helper allowing to generate the list of accounts needed during a CPI. */
export class TokenBridgeCpiAccountsBuilder {
  constructor(
    public programId: PublicKey,
    public tokenBridgeProgramId: PublicKey,
    public wormholeProgramId: PublicKey,
  ) {}

  transferNative(mint: PublicKey): {
    tokenBridgeConfig: PublicKey;
    tokenBridgeCustody: PublicKey;
    tokenBridgeAuthoritySigner: PublicKey;
    tokenBridgeCustodySigner: PublicKey;
    tokenBridgeWrappedMeta: null;
    wormholeBridge: PublicKey;
    tokenBridgeEmitter: PublicKey;
    tokenBridgeSequence: PublicKey;
    mint: PublicKey;
    wormholeFeeCollector: PublicKey;
  } {
    const {
      tokenBridgeConfig,
      tokenBridgeCustody,
      tokenBridgeAuthoritySigner,
      tokenBridgeCustodySigner,
      wormholeBridge,
      tokenBridgeEmitter,
      tokenBridgeSequence,
      wormholeFeeCollector,
    } = tokenBridge.getTransferNativeWithPayloadCpiAccounts(
      this.programId,
      this.tokenBridgeProgramId,
      this.wormholeProgramId,
      PublicKey.default, // we don't need payer
      PublicKey.default, // we don't need message
      PublicKey.default, // we don't need fromTokenAccount
      mint,
    );

    return {
      tokenBridgeConfig,
      tokenBridgeCustody,
      tokenBridgeAuthoritySigner,
      tokenBridgeCustodySigner,
      tokenBridgeWrappedMeta: null,
      wormholeBridge,
      tokenBridgeEmitter,
      tokenBridgeSequence,
      mint,
      wormholeFeeCollector,
    };
  }

  transferWrapped({ chain, address }: WormholeAddress): {
    tokenBridgeConfig: PublicKey;
    tokenBridgeCustody: null;
    tokenBridgeAuthoritySigner: PublicKey;
    tokenBridgeCustodySigner: null;
    tokenBridgeWrappedMeta: PublicKey;
    wormholeBridge: PublicKey;
    tokenBridgeEmitter: PublicKey;
    tokenBridgeSequence: PublicKey;
    mint: PublicKey;
    wormholeFeeCollector: PublicKey;
  } {
    const {
      tokenBridgeConfig,
      tokenBridgeAuthoritySigner,
      wormholeBridge,
      tokenBridgeEmitter,
      tokenBridgeSequence,
      tokenBridgeWrappedMeta,
      tokenBridgeWrappedMint,
      wormholeFeeCollector,
    } = tokenBridge.getTransferWrappedWithPayloadCpiAccounts(
      this.programId,
      this.tokenBridgeProgramId,
      this.wormholeProgramId,
      PublicKey.default, // we don't need payer
      PublicKey.default, // we don't need message
      PublicKey.default, // we don't need fromTokenAccount
      chainToChainId(chain),
      address.toUint8Array(),
    );

    return {
      tokenBridgeConfig,
      tokenBridgeCustody: null,
      tokenBridgeAuthoritySigner,
      tokenBridgeCustodySigner: null,
      tokenBridgeWrappedMeta,
      wormholeBridge,
      tokenBridgeEmitter,
      tokenBridgeSequence,
      mint: tokenBridgeWrappedMint,
      wormholeFeeCollector,
    };
  }

  completeNative(vaa: VaaMessage): {
    tokenBridgeConfig: PublicKey;
    tokenBridgeClaim: PublicKey;
    tokenBridgeForeignEndpoint: PublicKey;
    tokenBridgeCustody: PublicKey;
    tokenBridgeCustodySigner: PublicKey;
    tokenBridgeMintAuthority: null;
    tokenBridgeWrappedMeta: null;
    mint: PublicKey;
  } {
    const {
      tokenBridgeConfig,
      tokenBridgeClaim,
      tokenBridgeForeignEndpoint,
      tokenBridgeCustody,
      tokenBridgeCustodySigner,
      mint,
    } = tokenBridge.getCompleteTransferNativeWithPayloadCpiAccounts(
      this.tokenBridgeProgramId,
      this.wormholeProgramId,
      PublicKey.default,
      vaa,
      PublicKey.default,
    );

    return {
      tokenBridgeConfig,
      tokenBridgeClaim,
      tokenBridgeForeignEndpoint,
      tokenBridgeCustody,
      tokenBridgeCustodySigner,
      tokenBridgeMintAuthority: null,
      tokenBridgeWrappedMeta: null,
      mint,
    };
  }

  completeWrapped(vaa: VaaMessage): {
    tokenBridgeConfig: PublicKey;
    tokenBridgeClaim: PublicKey;
    tokenBridgeForeignEndpoint: PublicKey;
    tokenBridgeCustody: null;
    tokenBridgeCustodySigner: null;
    tokenBridgeMintAuthority: PublicKey;
    tokenBridgeWrappedMeta: PublicKey;
    mint: PublicKey;
  } {
    const {
      tokenBridgeConfig,
      tokenBridgeClaim,
      tokenBridgeForeignEndpoint,
      tokenBridgeMintAuthority,
      tokenBridgeWrappedMeta,
      tokenBridgeWrappedMint,
    } = tokenBridge.getCompleteTransferWrappedWithPayloadCpiAccounts(
      this.tokenBridgeProgramId,
      this.wormholeProgramId,
      PublicKey.default,
      vaa,
      PublicKey.default,
    );

    return {
      tokenBridgeConfig,
      tokenBridgeClaim,
      tokenBridgeForeignEndpoint,
      tokenBridgeCustody: null,
      tokenBridgeCustodySigner: null,
      tokenBridgeMintAuthority,
      tokenBridgeWrappedMeta,
      mint: tokenBridgeWrappedMint,
    };
  }
}
