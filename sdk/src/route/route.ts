import { LayoutToType } from "@wormhole-foundation/sdk-base";
import { toNative } from "@wormhole-foundation/sdk-definitions";
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
  TransferReceipt,
  TransferState,
} from "@wormhole-foundation/sdk-connect";
import { Tbrv3 } from "../tbrv3/evm/contract";
import { acquireModeItem, relayFeeUnit } from "../tbrv3/evm/layouts";

type AcquireMode = LayoutToType<typeof acquireModeItem>;

interface TransferOptions {
  gasDropoff: bigint;
  acquireMode: AcquireMode;
}

type Receipt = TransferReceipt<AttestationReceipt<"AutomaticTokenBridgeV3">>;

export class AutomaticTokenBridgeRoute<N extends Network>
  extends routes.AutomaticRoute<N, any, any, any>
  implements routes.StaticRouteMethods<typeof AutomaticTokenBridgeRoute>
{
  static NATIVE_GAS_DROPOFF_SUPPORTED = true;
  static IS_AUTOMATIC = true;
  static meta = {
    name: "Token Bridge Relayer v3",
  };

  static supportedNetworks(): Network[] {
    return ["Mainnet", "Testnet"];
  }
  // get the list of chains this route supports
  static supportedChains(network: Network): Chain[] {
    // if (network === 'Devnet') return [];
    // return Tbrv3.addresses[network] || [];
    return [];
  }

  // get the list of source tokens that are possible to send
  static async supportedSourceTokens(fromChain: ChainContext<Network>): Promise<TokenId[]> {
    return [];
  }

  // get the list of destination tokens that may be received on the destination chain
  static async supportedDestinationTokens<N extends Network>(
    sourceToken: TokenId,
    fromChain: ChainContext<N>,
    toChain: ChainContext<N>,
  ): Promise<TokenId[]> {
    return [];
  }

  static isProtocolSupported<N extends Network>(chain: ChainContext<N>): boolean {
    return chain.supportsProtocol('AutomaticTokenBridgeV3');
  }

  async isAvailable(request: routes.RouteTransferRequest<N>): Promise<boolean> {
    // TODO: check there's a TBRv3 contract address for the source and destination chains
    return false;
  }

  async validate(
    request: routes.RouteTransferRequest<N>,
    params: routes.TransferParams<TransferOptions>,
  ): Promise<routes.ValidationResult<TransferOptions>> {
    try {
      if (request.fromChain.chain !== 'Ethereum' && request.fromChain.chain !== 'Solana') throw new Error('Sourche chain not supported');
      if (request.fromChain.config.network === 'Devnet') throw new Error('Devnet not supported');
      const tbr = new Tbrv3({} as any, request.fromChain.config.network);

      const options = params.options ?? this.getDefaultOptions();

      const [base] = await tbr.baseRelayingParams(request.fromChain.chain);
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
      const tbr = new Tbrv3({} as any, request.fromChain.config.network);

      const [{ fee, isPaused }] = await tbr.relayingFee({
        gasDropoff: params.options.gasDropoff,
        targetChain
      });

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
      token: request.source.id.address,
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
