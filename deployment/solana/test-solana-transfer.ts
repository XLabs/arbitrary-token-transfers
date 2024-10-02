import {
  SolanaTokenBridgeRelayer,
  TransferNativeParameters,
  TransferWrappedParameters,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { dependencies, evm, getEnv, LoggerFn, SolanaChainInfo, getEnvOrDefault, TestTransfer } from '../helpers';
import { getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain } from '@wormhole-foundation/sdk-base';
import * as anchor from '@coral-xyz/anchor';
import { createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, NATIVE_MINT } from '@solana/spl-token';
import { inspect } from 'util';

const BN = anchor.BN;
const processName = 'att-solana-test-transfer';

const chains = evm.evmOperatingChains();

/**
 * This script expects the following environment variables:
 * - WALLET_KEY: private key of the wallet to use for sending transactions
 * - RECIPIENT_EVM_ADDRESS: EVM address to send tokens to
 */

async function run() {
  const start = process.hrtime.bigint();

  await runOnSolana('send-test-transactions', async (chain, signer, logFn) => {
    const transfers = uniqueTestTransfers.filter((testTransfer) => !testTransfer.skip && testTransfer.fromChain === chain.name);
    logFn(`Transfers from ${chain.name}: ${transfers.length}`);

    const promises = transfers.map(async (testTransfer) => {
      try {

        await sendTestTransaction(
          chain,
          signer,
          logFn,
          testTransfer,
        );
      } catch (error) {
        console.error(`Error executing script for test: ${inspect(testTransfer)}`, error);
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
  testTransfer: TestTransfer,
): Promise<void> {
  const gasDropoffAmount = Number(testTransfer.gasDropoffAmount);
  const transferredAmount = new anchor.BN(testTransfer.transferredAmount);
  const unwrapIntent = testTransfer.unwrapIntent;

  const mint = testTransfer.tokenAddress ? new PublicKey(testTransfer.tokenAddress) : undefined;
  const tokenAccount = getAta(await signer.getAddress(), mint);

  const maxFeeSol = new BN(getEnvOrDefault('MAX_FEE_SOL', '5000'));

  console.log({
    sourceChain: 'Solana',
    mint,
    tokenAccount,
    transferredAmount: transferredAmount,
    gasDropoffAmount: gasDropoffAmount,
    maxFeeSol: maxFeeSol.toNumber(),
    unwrapIntent,
  });
  const targetChains = chains.filter((c) => c.name === testTransfer.toChain);

  await Promise.all(
    targetChains.map(async (targetChain) => {
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

      if (testTransfer.tokenChain !== "Solana") {
        const tokenChain = testTransfer.tokenChain ?? getEnvOrDefault('TOKEN_CHAIN', 'Sepolia') as Chain;
        const params = {
          recipient: {
            chain: targetChain.name as Chain,
            address: toUniversal(targetChain.name as Chain, evmAddress),
          },
          token: {
            chain: tokenChain,
            address: toUniversal(tokenChain, mint!.toBase58()),
          },
          userTokenAccount: new PublicKey(getEnv('TRANSFER_TOKEN_ACCOUNT')),
          transferredAmount,
          gasDropoffAmount,
          maxFeeKlamports,
          unwrapIntent,
        } satisfies TransferWrappedParameters;

        transferIx = await tbr.transferWrappedTokens(signerKey, params);
      } else {
        const params = {
          recipient: {
            chain: targetChain.name as Chain,
            address: toUniversal(targetChain.name as Chain, evmAddress),
          },
          mint: mint!,
          tokenAccount: tokenAccount!,
          transferredAmount,
          gasDropoffAmount,
          maxFeeKlamports,
          unwrapIntent,
        } satisfies TransferNativeParameters;

        transferIx = await tbr.transferNativeTokens(signerKey, params);
      }
      const ixs = [];

      // if transferring SOL first we have to wrap it
      if (testTransfer.tokenAddress && testTransfer.tokenAddress === NATIVE_MINT.toBase58()) {
        const payerPk = new PublicKey(await signer.getAddress());
        const ata = await getAssociatedTokenAddress(
          mint!,
          payerPk,
        );

        const ataIx = createAssociatedTokenAccountIdempotentInstruction(
          payerPk,
          ata,
          payerPk,
          mint!
        );
        ixs.push(ataIx);

        const transferSol = SystemProgram.transfer({
          fromPubkey: payerPk,
          toPubkey: ata,
          lamports: Number(testTransfer.transferredAmount),
        });
        ixs.push(transferSol);
        ixs.push(createSyncNativeInstruction(ata));
      }
      ixs.push(transferIx);
      const txSignature = await ledgerSignAndSend(connection, ixs, []);
      log(`Transaction sent: ${txSignature}`);
    }),
  );
}

function getAta(signer: Buffer, mint?: PublicKey) {
  if (!mint) {
    return undefined;
  }
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const associatedTokenProgramId = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

  const [address] = PublicKey.findProgramAddressSync(
    [signer, tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );

  return address;
}

run().then(() => console.log('Done!'));

// In future we can make mint address configurable too
const uniqueTestTransfers: TestTransfer[] = [
  {
    // case C (native sol token)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC
    tokenChain: "Solana",
    fromChain: "Solana", 
    toChain: "OptimismSepolia",
    skip: true,
  },
  {
    // case C (native sol token)
    transferredAmount: '1',
    gasDropoffAmount: '0.0001',
    unwrapIntent: false,
    tokenAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "OptimismSepolia",
    skip: true,
  },
  {
    // case D (gas token)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Solana", 
    toChain: "OptimismSepolia",
    skip: false,
  },
  {
    // case D (gas token)
    transferredAmount: '1',
    gasDropoffAmount: '0.0001',
    unwrapIntent: false,
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "OptimismSepolia",
    skip: true,
  },
  {
    // case E native evm token (wrapped on solana)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: 'TBD',
    tokenChain: "OptimismSepolia",
    fromChain: "Solana", 
    toChain: "OptimismSepolia",
    skip: true,
  },
  {
    // case E native evm token (wrapped on solana)
    transferredAmount: '1',
    gasDropoffAmount: '0.0001',
    unwrapIntent: true,
    tokenAddress: 'TBD',
    tokenChain: "OptimismSepolia",
    fromChain: "Solana",
    toChain: "OptimismSepolia",
    skip: true,
  }
];
