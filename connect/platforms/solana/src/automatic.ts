import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Chain, Network } from "@wormhole-foundation/sdk-base";
import { AccountAddress, ChainsConfig, Contracts, isNative, TokenAddress, UniversalAddress, VAA } from "@wormhole-foundation/sdk-definitions";
import { SolanaAddress, SolanaChain, SolanaChains, SolanaPlatform, SolanaPlatformType, SolanaUnsignedTransaction, SolanaZeroAddress } from "@wormhole-foundation/sdk-solana";
import { AutomaticTokenBridgeV3, BaseRelayingParamsReturn, RelayingFee, RelayingFeesParams, RelayingFeesReturn, SupportedChains, TransferParams } from "@xlabs-xyz/arbitrary-token-transfers-definitions";

import { SolanaPriceOracleClient, SolanaTokenBridgeRelayer } from "@xlabs-xyz/solana-arbitrary-token-transfers";

export interface SolanaTransferParams<C extends SolanaChains> extends TransferParams<C> {
  maxFee: bigint;
}

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const KLAM_PER_SOL = 1_000_000n;
const MWEI_PER_MICRO_ETH = 1_000_000n;
const MWEI_PER_ETH = 1_000_000_000_000n;

export class AutomaticTokenBridgeV3Solana<N extends Network, C extends SolanaChains>
  implements AutomaticTokenBridgeV3<N, C> {

  private readonly client: SolanaTokenBridgeRelayer;
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

    this.client = new SolanaTokenBridgeRelayer({ connection }, {
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

    const senderPk = new PublicKey(params.sender.toNative('Solana').toString());

    if (isNativeToken) {
      transaction.add(await this.client.transferNativeTokens(
        senderPk,
        {
          recipientChain: params.recipient.chain,
          recipientAddress: params.recipient.address.toUint8Array(),
          transferredAmount: new BN(params.amount.toString()),
          maxFeeKlamports: new BN(params.maxFee?.toString() || 0),
          gasDropoffAmount: params.gasDropOff || 0,
          tokenAccount: ata,
          mint,
          unwrapIntent: params.unwrapIntent
        }
      ))
    } else {
      transaction.add(await this.client.transferWrappedTokens(
        senderPk, {
        recipientChain: params.recipient.chain,
        recipientAddress: params.recipient.address.toUint8Array(),
        userTokenAccount: ata,
        transferredAmount: new BN(params.amount.toString()),
        gasDropoffAmount: params.gasDropOff || 0,
        maxFeeKlamports: new BN(params.maxFee?.toString() || 0),
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
        ata
      ));
    } else {
      ixs.push(await this.client.completeWrappedTransfer(
        signer,
        // @ts-ignore
        vaa, // TODO: fix at solana sdk
        ata
      ));
    }
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFee> {
    const config = await this.client.read.config();
    const chainConfig = await this.client.read.chainConfig(args.targetChain);
    
    const oracleClient = new SolanaPriceOracleClient(this.connection);
    const oraclePrices = await oracleClient.read.evmPrices(args.targetChain);
    const oracleConfig = await oracleClient.read.config();

    const totalFeesMWei = BigInt(config.evmTransactionGas.toString()) * BigInt(oraclePrices.gasPrice)
      + BigInt(config.evmTransactionSize.toString()) * BigInt(oraclePrices.pricePerByte)
      + args.gasDropoff * MWEI_PER_MICRO_ETH;

    const totalFeesMicroUsd = totalFeesMWei * BigInt(oraclePrices.gasTokenPrice.toString()) / MWEI_PER_ETH
      + BigInt(chainConfig.relayerFeeMicroUsd.toString());

    const fee = KLAM_PER_SOL * totalFeesMicroUsd / BigInt(oracleConfig.solPrice.toString());

    // const fee = await this.client.relayingFee(
    //   new PublicKey(SolanaZeroAddress),
    //   args.targetChain,
    //   new BN(args.gasDropoff)
    // );

    return {
      fee: fee,
      isPaused: chainConfig.pausedOutboundTransfers,
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParamsReturn> {
    const config = await this.client.read.chainConfig(chain);

    return {
      maxGasDropoff: config.maxGasDropoffMicroToken,
      baseFee: config.relayerFeeMicroUsd,
      paused: config.pausedOutboundTransfers,
      peer: new UniversalAddress(new Uint8Array(config.canonicalPeer)),
      txSizeSensitive: false // TODO: might not be necessary
    };
  }

  private mintAddress(token: TokenAddress<Chain>): PublicKey {
    return isNative(token)
      ? new PublicKey(NATIVE_MINT)
      : new SolanaAddress(token).unwrap();
  }
}
