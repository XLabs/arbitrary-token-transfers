import {
  chainToPlatform,
  decimals,
  encoding,
  LayoutToType,
  nativeChainIds,
  Network,
} from '@wormhole-foundation/sdk-base';
import { ChainsConfig, Contracts, isNative, VAA } from '@wormhole-foundation/sdk-definitions';
import '@wormhole-foundation/sdk-evm';
import {
  EvmAddress,
  EvmChain,
  EvmChains,
  EvmPlatform,
  EvmPlatformType,
  EvmUnsignedTransaction,
} from '@wormhole-foundation/sdk-evm';
import {
  AutomaticTokenBridgeV3,
  BaseRelayingParams,
  isSupportedChain,
  RelayingFee,
  RelayingFeesParams,
  SupportedChains,
  tokenBridgeRelayerV3Contracts,
  TransferParams,
} from '@xlabs-xyz/arbitrary-token-transfers-definitions';
import { acquireModeItem, Tbrv3 } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { Provider } from 'ethers';
import { wrapEthersProvider } from './utils.js';

const WHOLE_EVM_GAS_TOKEN_UNITS = 1e18;

export type AcquireMode = LayoutToType<typeof acquireModeItem>;

export interface EvmOptions {
  acquireMode: AcquireMode;
}

export interface EvmTransferParams<C extends EvmChains> extends TransferParams<C> {
  acquireMode: AcquireMode;
  gasTokenAddress?: EvmAddress;
}

export interface EvmRelayingFee extends RelayingFee {
  gasTokenAddress?: EvmAddress;
}

export class AutomaticTokenBridgeV3EVM<N extends Network, C extends EvmChains>
  implements AutomaticTokenBridgeV3<N, C, EvmOptions>
{
  private readonly tbr: Tbrv3;
  private readonly networkId: bigint;

  constructor(
    readonly network: N,
    readonly chain: C,
    readonly provider: Provider,
    readonly contracts: Contracts,
  ) {
    if (network === 'Devnet') throw new Error('AutomaticTokenBridge not supported on Devnet');
    const address = tokenBridgeRelayerV3Contracts.get(network, chain);
    if (!address) throw new Error(`TokenBridgeRelayerV3 contract not defined for chain ${chain}`);

    this.tbr = Tbrv3.connectUnknown(wrapEthersProvider(provider), new EvmAddress(address));

    this.networkId = nativeChainIds.networkChainToNativeChainId.get(
      this.network,
      this.chain,
    ) as bigint;
  }

  static async fromRpc<N extends Network>(
    provider: Provider,
    config: ChainsConfig<N, EvmPlatformType>,
  ): Promise<AutomaticTokenBridgeV3EVM<N, EvmChains>> {
    // TODO: different ethers version on the sdk evm package
    // @ts-expect-error
    const [network, chain] = await EvmPlatform.chainFromRpc(provider);

    const conf = config[chain]!;
    if (conf.network !== network)
      throw new Error(`Network mismatch: ${conf.network} != ${network}`);

    return new AutomaticTokenBridgeV3EVM<N, EvmChains>(
      network as N,
      chain,
      provider,
      conf.contracts,
    );
  }

  async *transfer(params: EvmTransferParams<C>): AsyncGenerator<EvmUnsignedTransaction<N, C>> {
    const acquireTx = await this.acquire(params);
    if (acquireTx) yield acquireTx;

    const recipientChain = params.recipient.chain;
    if (isSupportedChain(recipientChain))
      throw new Error(`Unsupported destination chain ${recipientChain}`);

    // convert the fee and gas dropoff back from wei to eth
    // TODO: find a better way in order to avoid precision issues (use sdk amount)
    const fee = Number(params.fee || 0) / WHOLE_EVM_GAS_TOKEN_UNITS;
    const gasDropoff =
      Number(params.gasDropOff?.amount || 0) / this.getChainWholeUnit(recipientChain);

    const transferParams = this.tbr.transferWithRelay(
      {
        allowances: params.allowances,
        gasTokenAddress: params.gasTokenAddress,
      },
      {
        args: {
          ...(isNative(params.token.address)
            ? { method: 'TransferGasTokenWithRelay' }
            : {
                method: 'TransferTokenWithRelay',
                inputToken: new EvmAddress(params.token.address),
                acquireMode: params.acquireMode,
                unwrapIntent: params.unwrapIntent,
              }),
          gasDropoff,
          inputAmountInAtomic: params.amount,
          recipient: {
            address: params.recipient.address.toUniversalAddress(),
            chain: recipientChain,
          },
        },
        feeEstimation: {
          fee,
          isPaused: false,
        },
      },
    );

    // yield the transfer tx
    yield new EvmUnsignedTransaction(
      {
        data: encoding.hex.encode(transferParams.data, true),
        to: transferParams.to,
        value: transferParams.value,
        chainId: this.networkId,
      },
      this.network,
      this.chain,
      'AutomaticTokenBridgeV3.transfer',
      false,
    );
  }

  async acquire(transfer: EvmTransferParams<C>): Promise<EvmUnsignedTransaction<N, C> | void> {
    const tokenAddress = transfer.token.address;
    if (isNative(tokenAddress)) {
      return;
    }

    const mode = transfer.acquireMode;

    switch (mode.mode) {
      case 'Preapproved':
        const token = EvmPlatform.getTokenImplementation(
          // TODO: different ethers version on the sdk evm package
          // @ts-expect-error
          this.provider,
          tokenAddress.toNative(this.chain).toString(),
        );
        const allowance = await token.allowance(
          transfer.sender.toString(),
          this.tbr.address.toString(),
        );
        if (allowance < BigInt(transfer.amount)) {
          const tx = await token.approve.populateTransaction(
            this.tbr.address.toString(),
            transfer.amount,
          );
          return new EvmUnsignedTransaction(
            { ...tx, chainId: this.networkId },
            this.network,
            this.chain,
            'AutomaticTokenBridgeV3.approve',
            false,
          );
        }
        break;
      default:
        throw new Error('Unsupported acquire mode');
    }

    return;
  }

  async *redeem(
    vaa: VAA<'AutomaticTokenBridgeV3:TransferWithRelay'>,
  ): AsyncGenerator<EvmUnsignedTransaction<N, C>> {
    const { data, to, value } = this.tbr.completeTransfer([vaa as any]);

    yield new EvmUnsignedTransaction(
      {
        data: encoding.hex.encode(data),
        to: to,
        value: value,
      },
      this.network,
      this.chain,
      'AutomaticTokenBridgeV3.completeTransfer',
      false,
    );
  }

  async isChainAvailable(chain: SupportedChains): Promise<boolean> {
    const [{ result: isPaused }, { result: isSupported }] = await this.tbr.query([
      {
        query: 'ConfigQueries',
        queries: [
          { query: 'IsChainPaused', chain },
          { query: 'IsChainSupported', chain },
        ],
      },
    ]);

    return !isPaused && isSupported;
  }

  private getChainWholeUnit(chain: SupportedChains): number {
    const destinationDecimals = decimals.nativeDecimals.get(chainToPlatform(chain));
    if (!destinationDecimals) throw new Error(`Gas token decimals not defined for chain ${chain}`);
    return 10 ** destinationDecimals;
  }

  async relayingFee(args: RelayingFeesParams): Promise<EvmRelayingFee> {
    const { allowances, feeEstimations, gasTokenAddress } = await this.tbr.relayingFee({
      tokens: [args.token === "GasToken" ? "GasToken" : new EvmAddress(args.token)],
      transferRequests: [
        {
          targetChain: args.targetChain,
          gasDropoff: Number(args.gasDropoff) / this.getChainWholeUnit(args.targetChain),
        },
      ],
    });
    const [{ fee: rawFee, isPaused }] = feeEstimations;

    // convert from eth to wei since the ui needs it in base units
    const fee = BigInt(Math.floor(rawFee * WHOLE_EVM_GAS_TOKEN_UNITS));

    return {
      allowances,
      isPaused,
      fee,
      gasTokenAddress,
    };
  }

  async baseRelayingParams(targetChain: SupportedChains): Promise<BaseRelayingParams> {
    const [params] = await this.tbr.query([{ query: 'BaseRelayingConfig', targetChain }]);
    return {
      ...params.result,
    };
  }

  getDefaultOptions(): EvmOptions {
    return {
      acquireMode: {
        mode: 'Preapproved',
      },
    };
  }
}
