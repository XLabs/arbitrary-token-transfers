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
      gasDropoff: 0n
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

        const stbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');
        // expect them to return in the gas token (e.g. eth, avax, sol)
        const { maxGasDropoff: rawMaxGasDropoff } = await stbr.baseRelayingParams(request.toChain.chain);
        const maxGasDropoff = sdkAmount.units(
          sdkAmount.parse(rawMaxGasDropoff, destinationDecimals)
        );
        
        const perc = BigInt(Math.floor(options.nativeGas * 100));
        const dropoff = maxGasDropoff * perc / 100n;

        options.gasDropOff = sdkAmount.fromBaseUnits(
          dropoff,
          destinationDecimals
        );
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

      const gasDropoff = BigInt(params.options.gasDropOff?.amount) || 0n;

      const { fee, isPaused } = await tbr.relayingFee({
        gasDropoff,
        targetChain
      });

      if (isPaused) throw new Error(`Relaying to ${targetChain} is paused`);

      const srcNativeDecimals = await request.fromChain.getDecimals('native');
      const dstNativeDecimals = await request.toChain.getDecimals('native');

      const dstToken = await TokenTransfer.lookupDestinationToken(
        request.fromChain,
        request.toChain,
        request.source.id
      );
      const dstTokenDecimals = await request.toChain.getDecimals(dstToken.address);

      // recall that the token bridge normalizes to 8 decimals for tokens above that
      const srcAmount = sdkAmount.fromBaseUnits(BigInt(params.amount), request.source.decimals);
      const truncatedSrcAmount = sdkAmount.truncate(srcAmount, TokenTransfer.MAX_DECIMALS);
      const dstAmount = sdkAmount.scale(truncatedSrcAmount, dstTokenDecimals);

      const eta = finality.estimateFinalityTime(sourceChain) + guardians.guardianAttestationEta;

      return {
        success: true,
        sourceToken: {
          amount: truncatedSrcAmount,
          token: request.source.id
        },
        destinationToken: {
          amount: dstAmount,
          token: request.destination.id
        },
        params,
        destinationNativeGas: {
          amount: gasDropoff.toString(),
          decimals: dstNativeDecimals
        },
        relayFee: {
          amount: {
            amount: fee.toString(),
            decimals: srcNativeDecimals
          },
          // fees are paid in the source gas token
          token: { address: 'native', chain: sourceChain }
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

    const fee = Number(quote.relayFee?.amount.amount || 0);
    const gasDropOff = Number(quote.params.options.gasDropOff?.amount || 0);

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
      // TODO: receive through config
      unwrapIntent: true,
      // TODO: fix types
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