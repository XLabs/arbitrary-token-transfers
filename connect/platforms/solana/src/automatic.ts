import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Chain, Network } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainsConfig, Contracts, isNative, TokenAddress, UniversalAddress, VAA } from "@wormhole-foundation/sdk-definitions";
import { SolanaAddress, SolanaChain, SolanaChains, SolanaPlatform, SolanaPlatformType, SolanaUnsignedTransaction, SolanaZeroAddress } from "@wormhole-foundation/sdk-solana";
import { AutomaticTokenBridgeV3, BaseRelayingParamsReturn, RelayingFeesParams, RelayingFeesReturn, SupportedChains, TransferParams } from "@xlabs-xyz/arbitrary-token-transfers-definitions";

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

    this.client = new TbrClient({ connection }, {
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
          transferredAmount: new BN(params.amount.toString()),
          maxFeeSol: new BN(params.maxFee.toString()),
          gasDropoffAmount: new BN(params.gasDropOff?.toString() || 0),
          tokenAccount: ata,
          mint,
          unwrapIntent: params.unwrapIntent
        }
      ))
    } else {
      transaction.add(await this.client.transferWrappedTokens(
        new PublicKey(params.sender.toNative('Solana')), {
        recipientChain: params.recipient.chain,
        recipientAddress: params.recipient.address.toUint8Array(),
        userTokenAccount: ata,
        transferredAmount: new BN(params.amount.toString()),
        gasDropoffAmount: new BN(params.gasDropOff?.toString() || 0),
        maxFeeSol: new BN(params.maxFee.toString()),
        unwrapIntent: params.unwrapIntent
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

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFeesReturn> {
    return {
      fee: 0,
      isPaused: false,
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturn> {
    // TODO: read contract
    return {
      maxGasDropoff: 0,
      baseFee: 0,
      paused: false,
      peer: new UniversalAddress(new PublicKey(SolanaZeroAddress).toBuffer()),
      txSizeSensitive: false
    };
  }

  private mintAddress(token: TokenAddress<Chain>): PublicKey {
    return isNative(token)
      ? new PublicKey(NATIVE_MINT)
      : new SolanaAddress(token).unwrap();
  }
}