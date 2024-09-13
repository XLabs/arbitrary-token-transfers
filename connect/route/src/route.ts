import {
  AttestationReceipt,
  Chain,
  ChainAddress,
  ChainContext,
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
import { AcquireMode, relayFeeUnit, tokenBridgeRelayerV3Chains } from "@xlabs-xyz/arbitrary-token-transfers-definitions";

interface TransferOptions {
  gasDropoff: bigint;
  acquireMode: AcquireMode;
}

type Receipt = TransferReceipt<AttestationReceipt<"AutomaticTokenBridgeV3">>;

export class AutomaticTokenBridgeRouteV3<N extends Network>
  extends routes.AutomaticRoute<N, any, any, any>
  implements routes.StaticRouteMethods<typeof AutomaticTokenBridgeRouteV3>
{
  static NATIVE_GAS_DROPOFF_SUPPORTED = true;
  static IS_AUTOMATIC = true;
  static meta = {
    name: "Token Bridge Relayer v3",
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
      if (request.fromChain.chain !== 'Ethereum' && request.fromChain.chain !== 'Solana') throw new Error('Sourche chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');
      const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

      const options = params.options ?? this.getDefaultOptions();

      const base = await tbr.baseRelayingParams(request.fromChain.chain);
      if (base.maxGasDropoff < options.gasDropoff) throw new Error(`Gas dropoff above max available ${base.maxGasDropoff}`);

      return {
        valid: true,
        params: {
          amount: "0",
          options
        }
      };
    } catch (e) {
      return { valid: false, params, error: e as Error };
    }
  }

  async quote(
    request: routes.RouteTransferRequest<N>,
    params: routes.ValidatedTransferParams<TransferOptions>,
  ): Promise<routes.QuoteResult<TransferOptions, routes.ValidatedTransferParams<TransferOptions>>> {
    try {
      const targetChain = request.fromChain.chain;
      if (targetChain !== 'Ethereum' && targetChain !== 'Solana') throw new Error('Sourche chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');

      const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

      const { fee, isPaused } = await tbr.relayingFee({
        gasDropoff: params.options.gasDropoff,
        targetChain
      });

      if (isPaused) throw new Error('Relaying is paused');

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
          amount: "0",
          decimals: await request.toChain.getDecimals('native')
        },
        relayFee: {
          amount: {
            amount: (fee * relayFeeUnit).toString(),
            decimals: await request.fromChain.getDecimals('native'),
          },
          token: {
            chain: targetChain,
            address: 'native'
          }
        },
      };
    } catch (e) {
      return { success: false, error: e as Error };
    }
  }

  async initiate(
    request: routes.RouteTransferRequest<N>,
    signer: Signer,
    quote: routes.Quote<any, any>,
    to: ChainAddress<'Ethereum' | 'Solana'>,
  ): Promise<Receipt> {
    if (isSignOnlySigner(signer)) throw new Error('Signer must be able to send transactions');

    const tbr = await request.fromChain.getProtocol('AutomaticTokenBridgeV3');

    // TODO: how to specify chain specific args (e.g. acquireMode)?
    const transferTxs = tbr.transfer({
      amount: BigInt(quote.params.amount),
      recipient: {
        address: to.address.toUniversalAddress(),
        chain: to.chain
      },
      sender: toNative(request.fromChain.chain, signer.address()),
      token: request.source.id,
      gasDropOff: quote.params.options.gasDropoff,
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

  track(receipt: any, timeout?: number): AsyncGenerator<any, any, unknown> {
    return {} as any;
  }

  getDefaultOptions(): TransferOptions {
    return {
      gasDropoff: 0n,
      acquireMode: {
        mode: 'Preapproved'
      }
    };
  }
}
