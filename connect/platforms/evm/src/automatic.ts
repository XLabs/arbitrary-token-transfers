import {
  chainToPlatform,
  decimals,
  encoding,
  LayoutToType,
  Network,
} from '@wormhole-foundation/sdk-base';
import { ChainsConfig, Contracts, isNative, VAA } from '@wormhole-foundation/sdk-definitions';
import '@wormhole-foundation/sdk-evm';
import {
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
  tokenBridgeRelayerV3Contracts,
  TransferParams,
} from '@xlabs-xyz/arbitrary-token-transfers-definitions';
import { acquireModeItem, SupportedChains, Tbrv3 } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { Provider } from 'ethers';

const WHOLE_EVM_GAS_TOKEN_UNITS = 1e18;

export type AcquireMode = LayoutToType<typeof acquireModeItem>;

export interface EvmOptions {
  acquireMode: AcquireMode;
}

export interface EvmTransferParams<C extends EvmChains> extends TransferParams<C> {
  acquireMode: AcquireMode;
}

export class AutomaticTokenBridgeV3EVM<N extends Network, C extends EvmChains>
  implements AutomaticTokenBridgeV3<N, C, EvmOptions>
{
  private readonly tbr: Tbrv3;

  constructor(
    readonly network: N,
    readonly chain: C,
    readonly provider: Provider,
    readonly contracts: Contracts,
  ) {
    if (network === 'Devnet') throw new Error('AutomaticTokenBridge not supported on Devnet');
    const address = tokenBridgeRelayerV3Contracts.get(network, chain);
    if (!address) throw new Error(`TokenBridgeRelayerV3 contract not defined for chain ${chain}`);
    this.tbr = new Tbrv3(provider, network, address);
  }

  static async fromRpc<N extends Network>(
    provider: Provider,
    config: ChainsConfig<N, EvmPlatformType>,
  ): Promise<AutomaticTokenBridgeV3EVM<N, EvmChains>> {
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

    const transferParams = await this.tbr.transferWithRelay({
      args: {
        method: isNative(params.token.address)
          ? 'TransferGasTokenWithRelay'
          : 'TransferTokenWithRelay',
        acquireMode: params.acquireMode,
        gasDropoff,
        inputAmountInAtomic: params.amount,
        inputToken: params.token.address.toString(),
        recipient: {
          address: params.recipient.address.toUniversalAddress(),
          chain: recipientChain,
        },
        unwrapIntent: true, // TODO: receive as option/param?
      },
      feeEstimation: {
        fee,
        isPaused: false,
      },
    });

    // yield the transfer tx
    yield new EvmUnsignedTransaction(
      {
        data: encoding.hex.encode(transferParams.data, true),
        to: transferParams.to,
        // TODO: is the buffer necessary?
        value: transferParams.value + BigInt(Number(transferParams.value) * 0.05),
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
          this.provider,
          tokenAddress.toNative(this.chain).toString(),
        );
        const allowance = await token.allowance(transfer.sender.toString(), this.tbr.address);
        if (allowance < BigInt(transfer.amount)) {
          const tx = await token.approve.populateTransaction(this.tbr.address, transfer.amount);
          return new EvmUnsignedTransaction(
            tx,
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
    const { data, to, value } = await this.tbr.completeTransfer(vaa as any);

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

  private getChainWholeUnit(chain: SupportedChains): number {
    const destinationDecimals = decimals.nativeDecimals.get(chainToPlatform(chain));
    if (!destinationDecimals) throw new Error(`Decimals not defined for chain ${chain}`);
    return 10 ** destinationDecimals;
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFee> {
    const [{ fee: rawFee, isPaused }] = await this.tbr.relayingFee({
      ...args,
      gasDropoff: Number(args.gasDropoff) / this.getChainWholeUnit(args.targetChain),
    });

    // convert from eth to wei since the ui needs it in base units
    const fee = BigInt(Math.floor(rawFee * WHOLE_EVM_GAS_TOKEN_UNITS));

    return {
      isPaused,
      fee,
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParams> {
    const [params] = await this.tbr.baseRelayingParams(chain);
    return params;
  }

  getDefaultOptions(): EvmOptions {
    return {
      acquireMode: {
        mode: 'Preapproved',
      },
    };
  }
}
