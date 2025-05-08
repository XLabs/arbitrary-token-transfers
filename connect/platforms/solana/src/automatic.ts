import {
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { Chain, Network, PlatformToChains, amount as sdkAmount } from '@wormhole-foundation/sdk-base';
import {
  AccountAddress,
  ChainsConfig,
  Contracts,
  isNative,
  TokenAddress,
  UniversalAddress,
  VAA,
} from '@wormhole-foundation/sdk-definitions';
import {
  SolanaAddress,
  SolanaChain,
  SolanaChains,
  SolanaPlatform,
  SolanaPlatformType,
  SolanaUnsignedTransaction,
} from '@wormhole-foundation/sdk-solana';
import {
  AutomaticTokenBridgeV3,
  BaseRelayingParams,
  RelayingFee,
  RelayingFeesParams,
  SupportedChains,
  tokenBridgeRelayerV3Contracts,
  TransferParams,
} from '@xlabs-xyz/arbitrary-token-transfers-definitions';
import {
  oraclePidByNetwork,
  SolanaPriceOracle,
  SolanaTokenBridgeRelayer,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';

// TODO: export this from the price oracle SDK
// or better yet, eliminate it.
type SupportedChain = PlatformToChains<'Evm' | 'Sui'>;

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const NATIVE_MINT_UNIVERSAL = new SolanaAddress(
  new PublicKey('So11111111111111111111111111111111111111112'),
).toUniversalAddress();

const KLAM_PER_SOL = 1_000_000n;
const LAM_PER_KLAM = 1_000n;
const MWEI_PER_ETH = 1_000_000_000_000n;
const MWEI_PER_MICRO_ETH = MWEI_PER_ETH / 10n ** 6n;

export class AutomaticTokenBridgeV3Solana<N extends Network, C extends SolanaChains>
  implements AutomaticTokenBridgeV3<N, C>
{
  private readonly oracleClient: SolanaPriceOracle;
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
    if (network === 'Devnet') throw new Error('Devnet is not supported');

    const address = tokenBridgeRelayerV3Contracts.get(network, chainName);
    if (!address) throw new Error(`TokenBridge address not defined for ${network} ${chainName}`);

    // We shouldn't need this cast but it looks like the typescript compiler doesn't infer the type correctly otherwise.
    // Note that we're already throwing above in case we receive "Devnet".
    const priceOracleAddress = oraclePidByNetwork[network as Exclude<N, "Devnet">];
    if (!priceOracleAddress) throw new Error(`Price oracle address not defined for ${network}`);

    this.chain = new SolanaChain(chainName, new SolanaPlatform(this.network));
    this.oracleClient = new SolanaPriceOracle(connection, new PublicKey(priceOracleAddress));
    this.client = new SolanaTokenBridgeRelayer(
      connection,
      network,
      new PublicKey(address),
      this.oracleClient,
    );
  }

  static async fromRpc<N extends Network>(
    provider: Connection,
    config: ChainsConfig<N, SolanaPlatformType>,
  ): Promise<AutomaticTokenBridgeV3Solana<N, SolanaChains>> {
    const [network, chain] = await SolanaPlatform.chainFromRpc(provider);
    const conf = config[chain]!;

    if (conf.network !== network)
      throw new Error(`Network mismatch: ${conf.network} != ${network}`);

    return new AutomaticTokenBridgeV3Solana(network as N, chain, provider, conf.contracts);
  }

  private async getSourceTokenInfo(
    mint: PublicKey,
  ): Promise<{ chain: Chain; address: UniversalAddress }> {
    const tb = await this.chain.getTokenBridge();

    if (mint.equals(NATIVE_MINT)) {
      return { chain: 'Solana', address: new SolanaAddress(NATIVE_MINT).toUniversalAddress() };
    }

    try {
      let { address, chain } = await tb.getOriginalAsset(new SolanaAddress(mint));
      if (address === 'native') {
        const native = await this.chain.getNativeWrappedTokenId();
        address = native.address;
      }

      return {
        chain,
        address: address as UniversalAddress,
      };
    } catch (e: any) {
      if (!e.message.includes('not a wrapped asset')) throw e;
      return {
        chain: 'Solana',
        address: new SolanaAddress(mint).toUniversalAddress(),
      };
    }
  }

  async isChainAvailable(chain: SupportedChains): Promise<boolean> {
    const { pausedOutboundTransfers } = await this.client.account.chainConfig(chain).fetch();
    return pausedOutboundTransfers;
  }

  async *transfer(params: TransferParams<C>): AsyncGenerator<SolanaUnsignedTransaction<N, C>> {
    const mint = this.mintAddress(params.token.address);

    // get original token info, expected by the sdk to derive accounts
    const token = await this.getSourceTokenInfo(mint);

    const tokenAccount = await this.chain.getTokenAccount(params.sender, new SolanaAddress(mint));
    const ata = tokenAccount.address.toNative('Solana').unwrap();

    const payer = new SolanaAddress(params.sender).unwrap(); // TODO replace by payer parameter
    const transaction = new Transaction();
    transaction.feePayer = payer;

    const acc = await this.connection.getAccountInfo(ata);
    if (!acc) {
      transaction.add(createAssociatedTokenAccountInstruction(payer, ata, payer, mint));
    }

    // if transferring SOL first we have to wrap it
    if (token.address.equals(NATIVE_MINT_UNIVERSAL)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: ata,
          lamports: Number(params.amount.toString()),
        }),
      );
      transaction.add(createSyncNativeInstruction(ata));
    }

    const senderPk = new PublicKey(params.sender.toNative('Solana').toString());
    const gasDropoffAmount = Number(sdkAmount.display(params.gasDropOff));

    transaction.add(
      ...await this.client.transferTokens(senderPk, {
        recipient: {
          chain: params.recipient.chain,
          address: params.recipient.address.toUniversalAddress(),
        },
        userTokenAccount: ata,
        transferredAmount: BigInt(params.amount.toString()),
        gasDropoffAmount,
        maxFeeLamports: BigInt(params.fee.toString() || 0),
        unwrapIntent: params.unwrapIntent,
        mintAddress: mint,
      }),
    );

    const { blockhash } = await this.connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    // create a versioned transaction to avoid errors down the line due to
    // different Transaction constructors from different @solana/web3.js package versions
    yield new SolanaUnsignedTransaction(
      { transaction: new VersionedTransaction(transaction.compileMessage()) },
      this.network,
      this.chainName,
      'TokenBridgeRelayerV3.transfer',
      false,
    );
  }

  async *redeem(
    vaa: VAA<'AutomaticTokenBridgeV3:TransferWithRelay'>,
    payer: AccountAddress<C>,
  ): AsyncGenerator<SolanaUnsignedTransaction<N, C>> {
    const ata = new SolanaAddress(vaa.payload.to.address);
    const accInfo = await this.connection.getAccountInfo(ata.unwrap());
    if (!accInfo) throw new Error('Token Account not found');

    const signer = payer.toNative('Solana').unwrap();

    const transaction = new Transaction();
    transaction.feePayer = signer;

    const instructions = await this.client.completeTransfer(
      signer,
      // @ts-expect-error
      vaa, // TODO: fix at solana sdk
    );
    for (const instruction of instructions) {
      transaction.add(instruction);
    }

    const { blockhash } = await this.connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    // create a versioned transaction to avoid errors down the line due to
    // different Transaction constructors from different @solana/web3.js package versions
    yield new SolanaUnsignedTransaction(
      { transaction: new VersionedTransaction(transaction.compileMessage()) },
      this.network,
      this.chainName,
      'TokenBridgeRelayerV3.redeem',
      false,
    );
  }

  async relayingFee(args: RelayingFeesParams): Promise<RelayingFee> {
    const config = await this.client.read.config();
    const chainConfig = await this.client.account.chainConfig(args.targetChain).fetch();
    const oraclePrices = await this.oracleClient.read.foreignPrices(args.targetChain as SupportedChain);
    const oracleConfig = await this.oracleClient.read.config();

    // gasDropoff comes in base units
    const gasDropoffMicroEth = args.gasDropoff / 10n ** 12n;

    if (!("gasPrice" in oraclePrices)) throw new Error("Only EVM chains are supported");

    const totalFeesMWei =
      BigInt(config.evmTransactionGas) * BigInt(oraclePrices.gasPrice) +
      BigInt(config.evmTransactionSize) * BigInt(oraclePrices.pricePerTxByte) +
      gasDropoffMicroEth * MWEI_PER_MICRO_ETH;

    const totalFeesMicroUsd =
      (totalFeesMWei * oraclePrices.gasTokenPrice) / MWEI_PER_ETH +
      BigInt(chainConfig.relayerFeeMicroUsd);

    //  (Klamport/SOL) * μusd / (μusd/SOL) = Klamport
    const fee = Number(KLAM_PER_SOL * totalFeesMicroUsd) / Number(oracleConfig.solPrice.toString());

    const feeInBaseUnits = BigInt(Math.ceil(fee * Number(LAM_PER_KLAM)));

    return {
      allowances: {},
      fee: feeInBaseUnits,
      isPaused: chainConfig.pausedOutboundTransfers,
    };
  }

  async baseRelayingParams(chain: SupportedChains): Promise<BaseRelayingParams> {
    return this.client.baseRelayingParams(chain);
  }

  private mintAddress(token: TokenAddress<Chain>): PublicKey {
    return isNative(token) ? new PublicKey(NATIVE_MINT) : new SolanaAddress(token).unwrap();
  }

  getDefaultOptions() {
    return {};
  }
}
