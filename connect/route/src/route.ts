import {
  amount,
  api,
  AttestationReceipt,
  Chain,
  ChainAddress,
  ChainContext,
  finality,
  guardians,
  isSignOnlySigner,
  Network,
  QuoteWarning,
  routes,
  amount as sdkAmount,
  signAndSendWait,
  Signer,
  TokenId,
  TokenTransfer,
  TransferReceipt,
  TransferState,
  Wormhole,
} from '@wormhole-foundation/sdk-connect';
import {
  isNative,
  toNative,
  UniversalOrNative,
} from '@wormhole-foundation/sdk-definitions';
import {
  SupportedChains,
  tokenBridgeRelayerV3Chains,
} from '@xlabs-xyz/arbitrary-token-transfers-definitions';
import '@xlabs-xyz/arbitrary-token-transfer-evm-route';
import '@xlabs-xyz/arbitrary-token-transfer-solana-route';

interface TransferOptions {
  nativeGas: number; // this is a percentage
  unwrapIntent: boolean;
}

interface ValidatedTransferOptions extends TransferOptions {
  gasDropOff: sdkAmount.Amount;
}

interface QuotedTransferOptions extends ValidatedTransferOptions {
  allowances: Record<string, bigint>;
}

type Receipt = TransferReceipt<AttestationReceipt<'AutomaticTokenBridgeV3'>>;

export interface AutomaticTokenBridgeRouteV3Config {
  allowedTokenAddresses?: TokenId<Chain>[];
}

export class AutomaticTokenBridgeRouteV3<N extends Network>
  extends routes.AutomaticRoute<N, any, any, any>
  implements routes.StaticRouteMethods<typeof AutomaticTokenBridgeRouteV3>
{
  static NATIVE_GAS_DROPOFF_SUPPORTED = true;
  static IS_AUTOMATIC = true;

  static meta = {
    name: 'AutomaticTokenBridgeV3',
  };

  static supportedNetworks(): Network[] {
    return ['Mainnet', 'Testnet'];
  }

  static supportedChains(network: Network): Chain[] {
    const chains = tokenBridgeRelayerV3Chains.get(network);
    return [...(chains || [])];
  }

  static config: AutomaticTokenBridgeRouteV3Config | undefined = undefined;

  static async supportedSourceTokens(fromChain: ChainContext<Network>): Promise<TokenId[]> {
    const allowedTokenAddresses = this.config?.allowedTokenAddresses || [];
    const isWhitelistConfigAvailable = this.config && allowedTokenAddresses.length > 0;
    return Object.values(fromChain.config.tokenMap!).map((td) =>
      Wormhole.tokenId(td.chain, td.address),
    ).filter((token) => !(isWhitelistConfigAvailable && !allowedTokenAddresses.some(
      (whitelistedToken) =>
        whitelistedToken.chain === token.chain &&
        whitelistedToken.address.toString() === token.address.toString()
    )))
  }

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

    return tbr.isChainAvailable(request.toChain.chain);
  }

  async validate(
    request: routes.RouteTransferRequest<N>,
    params: routes.TransferParams<TransferOptions>,
  ): Promise<routes.ValidationResult<TransferOptions>> {
    try {
      if (tokenBridgeRelayerV3Chains.has(request.fromChain.chain))
        throw new Error('Source chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');

      const destinationDecimals = await request.toChain.getDecimals('native');

      const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

      const options: ValidatedTransferOptions = {
        ...tbr.getDefaultOptions(),
        ...this.getDefaultOptions(),
        ...params.options,
        gasDropOff: sdkAmount.fromBaseUnits(0n, destinationDecimals),
      };

      if (options.nativeGas) {
        if (options.nativeGas > 1.0 || options.nativeGas < 0.0) {
          throw new Error('Native gas must be between 0.0 and 1.0 (0% and 100%)');
        }

        const stbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');
        // expect them to return in the gas token (e.g. eth, avax, sol)
        const { maxGasDropoff: rawMaxGasDropoff } = await stbr.baseRelayingParams(
          request.toChain.chain,
        );
        const maxGasDropoff = sdkAmount.units(
          sdkAmount.parse(rawMaxGasDropoff, destinationDecimals),
        );

        const perc = BigInt(Math.floor(options.nativeGas * 100));
        const dropoff = (maxGasDropoff * perc) / 100n;

        options.gasDropOff = sdkAmount.fromBaseUnits(dropoff, destinationDecimals);
      }

      return {
        valid: true,
        params: {
          amount: request.parseAmount(params.amount).amount,
          options,
        },
      };
    } catch (e) {
      console.error('Validation error:', e);
      return { valid: false, params, error: e as Error };
    }
  }

  private async checkGovernorLimits(
    request: routes.RouteTransferRequest<N>,
    srcAmountTruncated: amount.Amount,
  ): Promise<QuoteWarning[]> {
    // Ensure the transfer would not violate governor transfer limits
    const [tokens, limits] = await Promise.all([
      api.getGovernedTokens(this.wh.config.api),
      api.getGovernorLimits(this.wh.config.api),
    ]);

    const { fromChain, source } = request;
    const token = source.id;

    const srcTb = await fromChain.getProtocol('TokenBridge');

    const warnings: QuoteWarning[] = [];
    if (limits !== null && fromChain.chain in limits && tokens !== null) {
      let origAsset: TokenId;
      if (isNative(token.address)) {
        origAsset = await fromChain.getNativeWrappedTokenId();
      } else {
        try {
          origAsset = await srcTb.getOriginalAsset(token.address);
        } catch (e: any) {
          if (!e.message.includes('not a wrapped asset')) throw e;
          origAsset = {
            chain: fromChain.chain,
            address: token.address,
          };
        }
      }

      if (origAsset.chain in tokens && origAsset.address.toString() in tokens[origAsset.chain]!) {
        const limit = limits[fromChain.chain]!;
        const tokenPrice = tokens[origAsset.chain]![origAsset.address.toString()]!;
        const notionalTransferAmt = tokenPrice * amount.whole(srcAmountTruncated);

        if (limit.maxSize && notionalTransferAmt > limit.maxSize) {
          warnings.push({
            type: 'GovernorLimitWarning',
            reason: 'ExceedsLargeTransferLimit',
          });
        }

        if (notionalTransferAmt > limit.available) {
          warnings.push({
            type: 'GovernorLimitWarning',
            reason: 'ExceedsRemainingNotional',
          });
        }
      }
    }

    return warnings;
  }

  async quote(
    request: routes.RouteTransferRequest<N>,
    params: routes.ValidatedTransferParams<ValidatedTransferOptions>,
  ): Promise<
    routes.QuoteResult<TransferOptions, routes.ValidatedTransferParams<QuotedTransferOptions>>
  > {
    try {
      const sourceChain = request.fromChain.chain;
      const targetChain = request.toChain.chain;

      if (tokenBridgeRelayerV3Chains.has(request.fromChain.chain))
        throw new Error('Source chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');

      const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

      const gasDropoff = BigInt(params.options.gasDropOff?.amount) || 0n;

      // Note that here we're assuming that the EVM instances have the same wrapped gas token
      // configured as the wormhole SDK.
      const srcWrapped = await request.fromChain.getNativeWrappedTokenId();
      const { allowances, fee, isPaused } = await tbr.relayingFee({
        token:
          request.source.id.address === 'native'
            ? (srcWrapped.address as UniversalOrNative<SupportedChains>)
            : request.source.id.address,
        gasDropoff,
        targetChain,
      });

      if (isPaused) throw new Error(`Relaying to ${targetChain} is paused`);

      const srcNativeDecimals = await request.fromChain.getDecimals('native');
      const dstNativeDecimals = await request.toChain.getDecimals('native');

      let dstToken = await TokenTransfer.lookupDestinationToken(
        request.fromChain,
        request.toChain,
        request.source.id,
      );

      // if the destination token is the chain's wrapped gas token
      // and the intent is to unwrap, set the destination token to the native token
      const dstWrapped = await request.toChain.getNativeWrappedTokenId();
      const dstIsWrapped =
        dstToken.address !== 'native' &&
        dstWrapped.address !== 'native' &&
        dstToken.address.equals(dstWrapped.address.toUniversalAddress());
      if (dstIsWrapped && params.options.unwrapIntent) {
        dstToken = { address: 'native', chain: targetChain };
      }

      const dstTokenDecimals = await request.toChain.getDecimals(dstToken.address);

      // recall that the token bridge normalizes to 8 decimals for tokens above that
      const srcAmount = sdkAmount.fromBaseUnits(BigInt(params.amount), request.source.decimals);
      const truncatedSrcAmount = sdkAmount.truncate(srcAmount, TokenTransfer.MAX_DECIMALS);
      const dstAmount = sdkAmount.scale(truncatedSrcAmount, dstTokenDecimals);

      const eta = finality.estimateFinalityTime(sourceChain) + guardians.guardianAttestationEta;

      const warnings = await this.checkGovernorLimits(request, truncatedSrcAmount);

      return {
        success: true,
        sourceToken: {
          amount: truncatedSrcAmount,
          token: request.source.id,
        },
        destinationToken: {
          amount: dstAmount,
          token: dstToken,
        },
        params: {
          ...params,
          options: {
            ...params.options,
            allowances,
          },
        },
        destinationNativeGas: {
          amount: gasDropoff.toString(),
          decimals: dstNativeDecimals,
        },
        relayFee: {
          amount: {
            amount: fee.toString(),
            decimals: srcNativeDecimals,
          },
          // fees are paid in the source gas token
          token: { address: 'native', chain: sourceChain },
        },
        eta,
        warnings,
      };
    } catch (e) {
      console.error('Quote error:', e);
      return { success: false, error: e as Error };
    }
  }

  async initiate(
    request: routes.RouteTransferRequest<N>,
    signer: Signer,
    quote: routes.Quote<TransferOptions, routes.ValidatedTransferParams<QuotedTransferOptions>>,
    to: ChainAddress<SupportedChains>,
  ): Promise<Receipt> {
    if (isSignOnlySigner(signer)) throw new Error('Signer must be able to send transactions');

    const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

    const fee = Number(quote.relayFee?.amount.amount || 0);
    const gasDropOff = quote.params.options.gasDropOff || { amount: 0n, decimals: 0 };

    // TODO: how to specify chain specific args (e.g. acquireMode)? Would need UI work
    const transferTxs = tbr.transfer({
      ...quote.params.options,
      amount: BigInt(quote.params.amount),
      recipient: {
        address: to.address.toUniversalAddress(),
        chain: to.chain,
      },
      sender: toNative(request.fromChain.chain, signer.address()),
      token: request.source.id,
      gasDropOff,
      fee,
      allowances: quote.params.options.allowances,
      unwrapIntent: quote.params.options.unwrapIntent,
    });

    const originTxs = await signAndSendWait(transferTxs, signer);

    return {
      originTxs,
      from: request.fromChain.chain,
      to: to.chain,
      state: TransferState.SourceInitiated,
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
      unwrapIntent: true,
    };
  }
}
