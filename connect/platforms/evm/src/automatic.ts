import { amount as sdkAmount, encoding, LayoutToType, Network } from "@wormhole-foundation/sdk-base";
import { ChainsConfig, Contracts, isNative, VAA } from "@wormhole-foundation/sdk-definitions";
import { EvmChains, EvmPlatform, EvmPlatformType, EvmUnsignedTransaction } from "@wormhole-foundation/sdk-evm";
import { AutomaticTokenBridgeV3, tokenBridgeRelayerV3Contracts, RelayingFeesParams, TransferParams, tokenBridgeRelayerV3Chains, AcquireMode } from "@xlabs-xyz/arbitrary-token-transfers-definitions";
import { acquireModeItem, BaseRelayingParamsReturn, RelayingFeesReturn, SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { Provider } from "ethers";
import '@wormhole-foundation/sdk-evm';

export interface EvmTransferParams<C extends EvmChains> extends TransferParams<C> {
  acquireMode: AcquireMode;
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

    if (tokenBridgeRelayerV3Chains.has(params.recipient.chain)) throw new Error(`Unsupported destination chain ${params.recipient.chain}`);

    const transferParams = await this.tbr.transferWithRelay({
      args: {
        method: isNative(params.token) ? 'TransferGasTokenWithRelay' : 'TransferTokenWithRelay',
        acquireMode: params.acquireMode,
        gasDropoff: params.gasDropOff ?? 0,
        inputAmountInAtomic: params.amount,
        inputToken: params.token.address.toString(),
        recipient: {
          address: params.recipient.address.toUniversalAddress(),
          chain: params.recipient.chain as any, // TODO: fix supported chain types
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
        data: encoding.hex.encode(transferParams.data, true),
        to: transferParams.to,
        // TODO: is the buffer necessary?
        value: transferParams.value + BigInt(Number(transferParams.value) * 0.05),
      },
      this.network,
      this.chain,
      'AutomaticTokenBridgeV3.transfer',
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
          transfer.token.address.toString()
        );
        const allowance = await token.allowance(
          transfer.sender.toString(),
          this.tbr.address,
        );
        if (allowance < BigInt(transfer.amount)) {
          const tx = await token.approve.populateTransaction(
            this.tbr.address,
            transfer.amount
          );
          return new EvmUnsignedTransaction(
            tx,
            this.network,
            this.chain,
            'AutomaticTokenBridgeV3.approve',
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
      'AutomaticTokenBridgeV3.completeTransfer',
      false
    );
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFeesReturn> {
    const [{ fee, isPaused }] = await this.tbr.relayingFee(args);

    return {
      isPaused,
      fee
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturn> {
    const [params] = await this.tbr.baseRelayingParams(chain);
    return params;
  }
}