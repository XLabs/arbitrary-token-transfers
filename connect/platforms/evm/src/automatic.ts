import { encoding, LayoutToType, Network } from "@wormhole-foundation/sdk-base";
import { ChainsConfig, Contracts, isNative, VAA } from "@wormhole-foundation/sdk-definitions";
import { EvmChains, EvmPlatform, EvmPlatformType, EvmUnsignedTransaction } from "@wormhole-foundation/sdk-evm";
import { AutomaticTokenBridgeV3, BaseRelayingParamsReturnItem, RelayingFeesParams, RelayingFeesReturnItem, TransferParams } from "@xlabs-xyz/arbitrary-token-transfers-definitions";
import { acquireModeItem, SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { Provider } from "ethers";

export type AcquireMode = LayoutToType<typeof acquireModeItem>;

export interface EvmTransferParams<C extends EvmChains> extends TransferParams<C> {
  acquireMode: AcquireMode;
  fee: bigint;
}

export class AutomaticTokenBridgeV3EVM<N extends Network, C extends EvmChains>
  implements AutomaticTokenBridgeV3<N, C> {

  private readonly tbr: Tbrv3;
  
  constructor(
    readonly network: N,
    readonly chain: C,
    readonly provider: Provider,
    readonly contracts: Contracts,
  ) {
    if (network === 'Devnet') throw new Error('AutomaticTokenBridge not supported on Devnet');
    this.tbr = new Tbrv3(provider, network);
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

  // TODO: make it accept an array?
  async *transfer(params: EvmTransferParams<C>): AsyncGenerator<EvmUnsignedTransaction<N, C>> {
    const acquireTx = await this.acquire(params);
    if (acquireTx) yield acquireTx;

    if (params.recipient.chain !== 'Solana' && params.recipient.chain !== 'Ethereum') throw new Error(`Unsupported destination chain ${params.recipient.chain}`);

    const transferParams = await this.tbr.transferWithRelay({
      args: {
        method: isNative(params.token) ? 'TransferGasTokenWithRelay' : 'TransferTokenWithRelay',
        acquireMode: params.acquireMode,
        gasDropoff: params.gasDropOff ?? 0n,
        inputAmount: params.amount,
        inputToken: params.token.toString(),
        recipient: {
          address: params.recipient.address.toUniversalAddress(),
          chain: params.recipient.chain,
        },
        unwrapIntent: true // TODO: receive as option/param?
      },
      feeEstimation: {
        fee: params.fee,
        isPaused: false
      }
    });

    // yield the transfer tx
    yield new EvmUnsignedTransaction(
      {
        data: encoding.hex.encode(transferParams.data),
        to: transferParams.to,
        value: transferParams.value,
      },
      this.network,
      this.chain,
      'TokenBridgeRelayerV3.transfer',
      false
    );
  }

  async acquire(
    transfer: EvmTransferParams<C>
  ): Promise<EvmUnsignedTransaction<N, C> | void> {
    const mode = transfer.acquireMode;

    switch (mode.mode) {
      case 'Preapproved':
        const token = EvmPlatform.getTokenImplementation(
          this.provider,
          transfer.token.toString()
        );
        const allowance = await token.allowance(
          transfer.sender.toString(),
          '', // TODO: TBRv3 contract address
        );
        if (allowance < BigInt(transfer.amount)) {
          const tx = await token.approve.populateTransaction(
            '', // TODO: TBRv3 contract address
            transfer.amount
          );
          return new EvmUnsignedTransaction(
            tx,
            this.network,
            this.chain,
            'TokenBridgeRelayerV3.approve',
            false
          );
        }
        break;
      default:
        throw new Error('Unsupported acquire mode');
    };

    return;
  }

  async *redeem(vaa: VAA<"AutomaticTokenBridgeV3:TransferWithRelay">): AsyncGenerator<EvmUnsignedTransaction<N, C>> {
    const { data, to, value } = await this.tbr.completeTransfer(vaa as any);

    yield new EvmUnsignedTransaction(
      {
        data: encoding.hex.encode(data),
        to: to,
        value: value,
      },
      this.network,
      this.chain,
      'TokenBridgeRelayerV3.completeTransfer',
      false
    );
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFeesReturnItem> {
    const [fee] = await this.tbr.relayingFee(args);
    return fee;
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturnItem> {
    const [params] = await this.tbr.baseRelayingParams(chain);
    return params;
  }
}
