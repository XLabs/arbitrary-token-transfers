import { SolanaTokenBridgeRelayer, TransferNativeParameters } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { dependencies, evm, getEnv, LoggerFn, SolanaChainInfo, getEnvOrDefault } from '../helpers';
import { getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana';
import { PublicKey } from '@solana/web3.js';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain } from '@wormhole-foundation/sdk-base';
import * as anchor from '@coral-xyz/anchor';

const BN = anchor.BN;

const chains = evm.evmOperatingChains();

async function run() {
  runOnSolana('send-test-transaction', sendTestTransaction).catch((error) => {
    console.error('Error executing script: ', error);
  });
}

async function sendTestTransaction(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  const start = process.hrtime.bigint();

  const mint = new PublicKey(getEnv('TRANSFER_MINT'));
  const tokenAccount = new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT'));
  const transferredAmount = new BN(getEnvOrDefault('TRANSFERRED_AMOUNT', "1000"));
  const gasDropoffAmount = new BN(getEnvOrDefault('GAS_DROPOFF_AMOUNT', "0"));
  const maxFeeSol = new BN(getEnvOrDefault('MAX_FEE_SOL', "5000"));
  const unwrapIntent = getEnvOrDefault('UNWRAP_INTENT', "false") === 'true';

  console.log({
   sourceChain: "Solana",
    mint,
    tokenAccount,
    transferredAmount: transferredAmount.toNumber(),
    gasDropoffAmount: gasDropoffAmount.toNumber(),
    maxFeeSol: maxFeeSol.toNumber(),
    unwrapIntent,
  })

  await Promise.all(
    chains.map(async (targetChain) => {
      console.log(`Creating transfer for Solana->${targetChain.name}`);
      const signerKey = new PublicKey(await signer.getAddress());
      const connection = getConnection(chain);
      const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
      if (solanaDependencies === undefined) {
        throw new Error(`No dependencies found for chain ${chain.chainId}`);
      }

      const tokenBridgeProgramId = new PublicKey(solanaDependencies.tokenBridge);
      const wormholeProgramId = new PublicKey(solanaDependencies.wormhole);

      const tbr = new SolanaTokenBridgeRelayer(
        { connection },
        {
          tokenBridgeProgramId,
          wormholeProgramId,
        },
      );

      const evmAddress = getEnv('RECIPIENT_EVM_ADDRESS');

      const params: TransferNativeParameters = {
        recipientChain: targetChain.name as Chain,
        recipientAddress: toUniversal(targetChain.name as Chain, evmAddress).toUint8Array(),
        mint: new PublicKey(getEnv('TRANSFER_MINT')),
        tokenAccount: new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT')),
        transferredAmount: new BN(1000),
        gasDropoffAmount: 0,
        maxFeeKlamports: new BN(5000),
        unwrapIntent: false,
      };

      const transferIx = await tbr.transferNativeTokens(signerKey, params);

      const txSignature = await ledgerSignAndSend(connection, [transferIx], []);
      log(`Transaction sent: ${txSignature}`);
    }),
  );
}

run().then(() => console.log('Done!'));
