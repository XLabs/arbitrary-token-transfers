import {
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { dependencies, evm, getEnv, LoggerFn, SolanaChainInfo, getEnvOrDefault } from '../helpers';
import { getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain } from '@wormhole-foundation/sdk-base';
import * as anchor from '@coral-xyz/anchor';

const BN = anchor.BN;
const processName = 'att-solana-test-transfer';

const chains = evm.evmOperatingChains();

async function run() {
  const start = process.hrtime.bigint();

  await runOnSolana('send-test-transactions', async (chain, signer, logFn) => {
    const promises = uniqueTestTransfers.map(async (testTransfer) => {
      try {
        if (testTransfer.isExecuted) return;
        await sendTestTransaction(
          chain,
          signer,
          logFn,
          new BN(testTransfer.transferredAmount),
          Number(testTransfer.gasDropoffAmount),
          testTransfer.unwrapIntent === 'true',
        );
      } catch (error) {
        console.error(`Error executing script for test: ${testTransfer.id}`, error);
      }
    });
    await Promise.allSettled(promises);
  });

  const timeMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`Process ${processName} finished after ${timeMs} miliseconds`);
}

async function sendTestTransaction(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
  transferredAmount: anchor.BN,
  gasDropoffAmount: number,
  unwrapIntent: boolean,
): Promise<void> {
  const mint = new PublicKey(getEnv('TRANSFER_MINT'));
  const tokenAccount = new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT'));
  const maxFeeSol = new BN(getEnvOrDefault('MAX_FEE_SOL', '5000'));
  const isSendingWrappedTokensEnabled = getEnvOrDefault('SEND_WRAPPED_TOKENS', 'false') === 'true';

  console.log({
    sourceChain: 'Solana',
    mint,
    tokenAccount,
    transferredAmount: transferredAmount.toNumber(),
    gasDropoffAmount: gasDropoffAmount,
    maxFeeSol: maxFeeSol.toNumber(),
    unwrapIntent,
  });

  await Promise.all(
    chains.map(async (targetChain) => {
      log(`Creating transfer for Solana->${targetChain.name}`);
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
      const maxFeeKlamports = new BN(getEnvOrDefault('MAX_FEE_KLAMPORTS', '5000000'));

      let transferIx: TransactionInstruction;

      if (isSendingWrappedTokensEnabled) {
        const tokenChain = getEnvOrDefault('TOKEN_CHAIN', 'Solana') as Chain;
        const params = {
          recipientChain: targetChain.name as Chain,
          recipientAddress: toUniversal(targetChain.name as Chain, evmAddress).toUint8Array(),
          userTokenAccount: new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT')),
          transferredAmount,
          gasDropoffAmount,
          maxFeeKlamports,
          unwrapIntent,
          token: {
            chain: tokenChain,
            address: toUniversal(tokenChain, getEnv('TRANSFER_MINT')),
          },
        } satisfies TransferWrappedParameters;

        transferIx = await tbr.transferWrappedTokens(signerKey, params);
      } else {
        const params = {
          recipientChain: targetChain.name as Chain,
          recipientAddress: toUniversal(targetChain.name as Chain, evmAddress).toUint8Array(),
          mint: new PublicKey(getEnv('TRANSFER_MINT')),
          tokenAccount: new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT')),
          transferredAmount,
          gasDropoffAmount,
          maxFeeKlamports,
          unwrapIntent,
        } satisfies TransferNativeParameters;

        transferIx = await tbr.transferNativeTokens(signerKey, params);
      }

      const txSignature = await ledgerSignAndSend(connection, [transferIx], []);
      log(`Transaction sent: ${txSignature}`);
    }),
  );
}

run().then(() => console.log('Done!'));

// In future we can configurable mint address
const uniqueTestTransfers = [
  {
    id: 1,
    transferredAmount: '1000',
    gasDropoffAmount: '0',
    unwrapIntent: 'false',
    isExecuted: false,
  },
  {
    id: 2,
    transferredAmount: '1000',
    gasDropoffAmount: '0',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  {
    id: 3,
    transferredAmount: '1000',
    gasDropoffAmount: '10',
    unwrapIntent: 'false',
    isExecuted: false,
  },
  {
    id: 4,
    transferredAmount: '1000',
    gasDropoffAmount: '10',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  // check if below cases makes sense
  {
    id: 5,
    transferredAmount: '0',
    gasDropoffAmount: '10',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  {
    id: 6,
    transferredAmount: '0',
    gasDropoffAmount: '10',
    unwrapIntent: 'false',
    isExecuted: false,
  },
];
