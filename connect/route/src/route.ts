import {
  amount as sdkAmount,
  AttestationReceipt,
  Chain,
  ChainAddress,
  ChainContext,
  finality,
  guardians,
  isSignOnlySigner,
  Network,
  routes,
  signAndSendWait,
  Signer,
  TokenId,
  TokenTransfer,
  TransferReceipt,
  TransferState,
  Wormhole,
} from "@wormhole-foundation/sdk-connect";
import { toNative } from "@wormhole-foundation/sdk-definitions";
import "@xlabs-xyz/arbitrary-token-transfers-definitions";
import { SupportedChains, tokenBridgeRelayerV3Chains, AcquireMode } from "@xlabs-xyz/arbitrary-token-transfers-definitions";

interface TransferOptions {
  nativeGas: number; // this is a percentage
  acquireMode: AcquireMode;
}

interface ValidatedTransferOptions extends TransferOptions {
  gasDropOff: sdkAmount.Amount;
}

type Receipt = TransferReceipt<AttestationReceipt<"AutomaticTokenBridgeV3">>;

export class AutomaticTokenBridgeRouteV3<N extends Network>
  extends routes.AutomaticRoute<N, any, any, any>
  implements routes.StaticRouteMethods<typeof AutomaticTokenBridgeRouteV3>
{
  static NATIVE_GAS_DROPOFF_SUPPORTED = true;
  static IS_AUTOMATIC = true;

  static meta = {
    name: "AutomaticTokenBridgeV3",
  };

  static supportedNetworks(): Network[] {
    return ["Mainnet", "Testnet"];
  }

  static supportedChains(network: Network): Chain[] {
    const chains = tokenBridgeRelayerV3Chains.get(network);
    return [...(chains || [])];
  }

  // get the list of source tokens that are possible to send
  static async supportedSourceTokens(fromChain: ChainContext<Network>): Promise<TokenId[]> {
    // TODO: verify if there's any restriction as to which tokens can be sent
    return Object.values(fromChain.config.tokenMap!).map((td) =>
      Wormhole.tokenId(td.chain, td.address),
    );
  }

  // get the list of destination tokens that may be received on the destination chain
  static async supportedDestinationTokens<N extends Network>(
    sourceToken: TokenId,
    fromChain: ChainContext<N>,
    toChain: ChainContext<N>,
  ): Promise<TokenId[]> {
    try {
      return [await TokenTransfer.lookupDestinationToken(fromChain, toChain, sourceToken)];
    } catch (e) {
      console.error(`Failed to get destination token: ${e}`);
      return [];
    }
  }

  static isProtocolSupported<N extends Network>(chain: ChainContext<N>): boolean {
    return chain.supportsProtocol('AutomaticTokenBridgeV3');
  }

  async isAvailable(request: routes.RouteTransferRequest<N>): Promise<boolean> {
    const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

    const { isPaused } = await tbr.relayingFee({
      targetChain: request.toChain.chain as any,
      gasDropoff: 0
    });

    return !isPaused;
  }

  async validate(
    request: routes.RouteTransferRequest<N>,
    params: routes.TransferParams<TransferOptions>,
  ): Promise<routes.ValidationResult<TransferOptions>> {
    try {
      if (tokenBridgeRelayerV3Chains.has(request.fromChain.chain)) throw new Error('Source chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');

      // const stbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');
      // const dtbr = await request.toChain.getProtocol('AutomaticTokenBridgeV3');
      const destinationDecimals = await request.toChain.getDecimals('native');

      const options: ValidatedTransferOptions = {
        ...this.getDefaultOptions(),
        ...params.options,
        gasDropOff: sdkAmount.fromBaseUnits(0n, destinationDecimals)
      };

      if (options.nativeGas) {
        if (options.nativeGas > 1.0 || options.nativeGas < 0.0) {
          throw new Error("Native gas must be between 0.0 and 1.0 (0% and 100%)");
        }

        // TODO: check max gas drop off (see existing implementation)
        // TODO: check gas dropoff units for each platform (evm is twei, but solana?)
        // const { maxGasDropoff } = await dtbr.baseRelayingParams(request.toChain.chain);
        // const dropoff = request.parseAmount(params.amount) * options.nativeGas;
        // if ()
        // ================================================ //

        const stbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

        const { maxGasDropoff } = await stbr.baseRelayingParams(request.toChain.chain);

        const perc = BigInt(Math.floor(options.nativeGas * 100));
        const dropoff = BigInt(maxGasDropoff) * perc / 100n;

        options.gasDropOff = sdkAmount.fromBaseUnits(
          dropoff,
          destinationDecimals
        );

        // ================================================ //
      }

      return {
        valid: true,
        params: {
          amount: request.parseAmount(params.amount).amount,
          options
        }
      };
    } catch (e) {
      console.error('Validation error:', e);
      return { valid: false, params, error: e as Error };
    }
  }

  async quote(
    request: routes.RouteTransferRequest<N>,
    params: routes.ValidatedTransferParams<ValidatedTransferOptions>,
  ): Promise<routes.QuoteResult<TransferOptions, routes.ValidatedTransferParams<ValidatedTransferOptions>>> {
    try {
      const sourceChain = request.fromChain.chain;
      const targetChain = request.toChain.chain;

      if (tokenBridgeRelayerV3Chains.has(request.fromChain.chain)) throw new Error('Source chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');

      const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

      const gasDropoff = Number(params.options.gasDropOff?.amount || 0) / 1e18;

      const { fee, isPaused } = await tbr.relayingFee({
        gasDropoff,
        targetChain
      });

      if (isPaused) throw new Error(`Relaying to ${targetChain} is paused`);

      const srcDecimals = await request.fromChain.getDecimals('native');
      const dstDecimals = await request.toChain.getDecimals('native');

      const feeToken: TokenId = { address: 'native', chain: sourceChain }

      // convert from eth to wei since the ui needs it in base units
      const feeAmount = BigInt(Math.floor(fee * 1e10)) * BigInt(Math.floor(10 ** Math.abs(srcDecimals - 10)));

      const eta = finality.estimateFinalityTime(sourceChain) + guardians.guardianAttestationEta;

      return {
        success: true,
        sourceToken: {
          amount: {
            amount: params.amount,
            decimals: request.source.decimals,
          },
          token: request.source.id
        },
        destinationToken: {
          amount: {
            amount: params.amount,
            decimals: request.destination.decimals,
          },
          token: request.destination.id
        },
        params,
        destinationNativeGas: {
          amount: gasDropoff.toString(),
          decimals: dstDecimals
        },
        relayFee: {
          amount: {
            amount: feeAmount.toString(),
            decimals: srcDecimals
          },
          token: feeToken
        },
        eta,
      };
    } catch (e) {
      console.error('Quote error:', e);
      return { success: false, error: e as Error };
    }
  }

  async initiate(
    request: routes.RouteTransferRequest<N>,
    signer: Signer,
    quote: routes.Quote<TransferOptions, routes.ValidatedTransferParams<ValidatedTransferOptions>>,
    to: ChainAddress<SupportedChains>,
  ): Promise<Receipt> {
    if (isSignOnlySigner(signer)) throw new Error('Signer must be able to send transactions');

    const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

    // convert the fee back from wei to eth
    const fee = Number(quote.relayFee?.amount.amount || 0) / 1e18;

    // const gasDropoff = Number(quote.params.options.gasDropOff?.amount || 0);
    const gasDropOff = Number(quote.params.options.gasDropOff?.amount || 0) / 1e18;

    // TODO: how to specify chain specific args (e.g. acquireMode)?
    const transferTxs = tbr.transfer({
      amount: BigInt(quote.params.amount),
      recipient: {
        address: to.address.toUniversalAddress(),
        chain: to.chain
      },
      sender: toNative(request.fromChain.chain, signer.address()),
      token: request.source.id,
      gasDropOff,
      fee,
      // TODO: solve type issue
      // @ts-ignore
      acquireMode: quote.params.options.acquireMode,
    });

    const originTxs = await signAndSendWait(
      transferTxs,
      signer
    );

    return {
      originTxs,
      from: request.fromChain.chain,
      to: to.chain,
      state: TransferState.SourceInitiated
    };
  }

  async *track(receipt: Receipt, timeout?: number): AsyncGenerator<any, any, unknown> {
    try {
      yield* TokenTransfer.track(this.wh, receipt, timeout);
    } catch (e) {
      throw e;
    }
  }

  getDefaultOptions(): TransferOptions {
    return {
      nativeGas: 0,
      acquireMode: {
        mode: 'Preapproved'
      }
    };
  }
}
