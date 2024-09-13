import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Chain, Network, platformToChains } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainsConfig, Contracts, isNative, TokenAddress, VAA } from "@wormhole-foundation/sdk-definitions";
import { SolanaAddress, SolanaChain, SolanaChains, SolanaPlatform, SolanaPlatformType, SolanaUnsignedTransaction } from "@wormhole-foundation/sdk-solana";
import { AutomaticTokenBridgeV3, BaseRelayingParamsReturnItem, RelayingFeesParams, RelayingFeesReturnItem, SupportedChains, TransferParams } from "@xlabs-xyz/arbitrary-token-transfers-definitions";

import { TbrClient } from "@xlabs-xyz/solana-arbitrary-token-transfers";

export interface SolanaTransferParams<C extends SolanaChains> extends TransferParams<C> {
  maxFee: bigint;
}

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export class AutomaticTokenBridgeV3Solana<N extends Network, C extends SolanaChains>
  implements AutomaticTokenBridgeV3<N, C> {

  private readonly client: TbrClient;
  private readonly chain: SolanaChain<N>;

  constructor(
    readonly network: N,
    readonly chainName: C,
    readonly connection: Connection,
    readonly contracts: Contracts,
  ) {
    if (!contracts.tokenBridge) throw new Error('TokenBridge contract not defined');
    if (!contracts.coreBridge) throw new Error('CoreBridge contract not defined');
    
    this.chain = new SolanaChain(chainName, new SolanaPlatform(this.network));

    this.client = new TbrClient(connection, {
      tokenBridgeProgramId: new PublicKey(contracts.tokenBridge),
      wormholeProgramId: new PublicKey(contracts.coreBridge)
    });
  }

  static async fromRpc<N extends Network>(
    provider: Connection,
    config: ChainsConfig<N, SolanaPlatformType>,
  ): Promise<AutomaticTokenBridgeV3Solana<N, SolanaChains>> {
    const [network, chain] = await SolanaPlatform.chainFromRpc(provider);
    const conf = config[chain]!;

    if (conf.network !== network)
      throw new Error(`Network mismatch: ${conf.network} != ${network}`);

    return new AutomaticTokenBridgeV3Solana(
      network as N,
      chain,
      provider,
      conf.contracts
    );
  }

  // TODO: make it accept an array?
  // TODO: add payer: Account optional parameter
  async *transfer(params: SolanaTransferParams<C>): AsyncGenerator<SolanaUnsignedTransaction<N, C>> {
    const isNativeToken = isNative(params.token);
    const mint = this.mintAddress(params.token.address);

    const tokenAccount = await this.chain.getTokenAccount(params.sender, new SolanaAddress(mint));
    const ata = tokenAccount.address.toNative('Solana').unwrap()

    const payer = new SolanaAddress(params.sender).unwrap(); // TODO replace by payer parameter
    const transaction = new Transaction();
    transaction.feePayer = payer;

    const acc = await this.connection.getAccountInfo(ata);
    if (!acc) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer,
          ata,
          payer,
          mint
        )
      );
    }

    if (isNativeToken) {
      transaction.add(await this.client.transferNativeTokens(
        new PublicKey(params.sender.toNative('Solana')),
        {
          recipientChain: params.recipient.chain,
          recipientAddress: params.recipient.address.toUint8Array(),
          transferredAmount: params.amount,
          maxFeeSol: params.maxFee,
          gasDropoffAmount: params.gasDropOff || 0n,
          tokenAccount: ata,
          mint,
        }
      ))
    } else {
      transaction.add(await this.client.transferWrappedTokens(
        new PublicKey(params.sender.toNative('Solana')), {
        recipientChain: params.recipient.chain,
        recipientAddress: params.recipient.address.toUint8Array(),
        userTokenAccount: ata,
        transferredAmount: params.amount,
        gasDropoffAmount: params.gasDropOff || 0n,
        maxFeeSol: params.maxFee,
      }));
    }

    yield new SolanaUnsignedTransaction(
      { transaction },
      this.network,
      this.chainName,
      'TokenBridgeRelayerV3.transfer',
      true
    );
  }

  async *redeem(vaa: VAA<"AutomaticTokenBridgeV3:TransferWithRelay">, payer: AccountAddress<C>): AsyncGenerator<SolanaUnsignedTransaction<N, C>> {
    const ata = new SolanaAddress(vaa.payload.to.address);
    const accInfo = await this.connection.getAccountInfo(ata.unwrap());
    if (!accInfo) throw new Error('Token Account not found');
    const { owner } = accInfo;

    const signer = payer.toNative('Solana').unwrap();

    const ixs: TransactionInstruction[] = [];

    if (vaa.payload.token.chain === 'Solana') {
      ixs.push(await this.client.completeNativeTransfer(
        signer,
        // @ts-ignore
        vaa, // TODO: fix at solana sdk
        ata,
        owner
      ));
    } else {
      ixs.push(await this.client.completeWrappedTransfer(
        signer,
        // @ts-ignore
        vaa, // TODO: fix at solana sdk
        ata,
        owner
      ));
    }
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFeesReturnItem> {
    return {
      fee: 0n,
      isPaused: true,
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturnItem> {
    return {
      maxGasDropoff: 0,
      baseFee: 0,
    };
  }

  private mintAddress(token: TokenAddress<Chain>): PublicKey {
    return isNative(token)
      ? new PublicKey(NATIVE_MINT)
      : new SolanaAddress(token).unwrap();
  }
}
