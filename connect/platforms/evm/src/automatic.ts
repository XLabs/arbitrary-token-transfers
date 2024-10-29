import {
  chainToPlatform,
  decimals,
  encoding,
  LayoutToType,
  nativeChainIds,
  Network,
} from '@wormhole-foundation/sdk-base';
import {
  ChainsConfig,
  Contracts,
  isNative,
  resolveWrappedToken,
  toNative,
  VAA,
} from '@wormhole-foundation/sdk-definitions';
import '@wormhole-foundation/sdk-evm';
import {
  EvmAddress,
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

    // TODO: Celo doesn't have a "native" token, it uses an ERC20 instead
    const [resolvedGasToken, gasToken] = resolveWrappedToken(network, chain, 'native');
    if (!resolvedGasToken || isNative(gasToken.address))
      throw new Error(`Failed to resolve gas token for chain ${chain}`);
    this.tbr = new Tbrv3(
      wrapEthersProvider(provider),
      new EvmAddress(address),
      toNative(chain, gasToken.address.toUint8Array()),
    );

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
    // @ts-ignore
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

    const transferParams = await this.tbr.transferWithRelay(params.allowances, {
      args: {
        method: isNative(params.token.address)
          ? 'TransferGasTokenWithRelay'
          : 'TransferTokenWithRelay',
        acquireMode: params.acquireMode,
        gasDropoff,
        inputAmountInAtomic: params.amount,
        inputToken: new EvmAddress(params.token.address),
        recipient: {
          address: params.recipient.address.toUniversalAddress(),
          chain: recipientChain,
        },
        unwrapIntent: true, // TODO: receive as option/param? would require UI work
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
          // @ts-ignore
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
    if (!destinationDecimals) throw new Error(`Decimals not defined for chain ${chain}`);
    return 10 ** destinationDecimals;
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFee> {
    const { allowances, feeEstimations } = await this.tbr.relayingFee({
      tokens: [new EvmAddress(args.token)],
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
