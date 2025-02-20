import {
  ChainInfo,
  dependencies,
  evm,
  EvmChainInfo,
  EvmScriptCb,
  getContractAddress,
  getEnv,
  getEnvOrDefault,
  LoggerFn,
  SolanaChainInfo,
  SolanaScriptCb,
  TestTransfer,
} from '../helpers';
import { ethers } from 'ethers';
import { getProvider, runOnEvms, sendTxCatch, wrapEthersProvider } from '../helpers/evm';
import { SupportedChain, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { resolveWrappedToken, toUniversal, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { Chain, chainToChainId, chainToPlatform, contracts } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';
import { solanaOperatingChains, getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana';
import { EvmAddress } from '@wormhole-foundation/sdk-evm';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  SolanaTokenBridgeRelayer,
  TransferParameters,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT
} from '@solana/spl-token';

import { ethers_contracts } from "@wormhole-foundation/sdk-evm-tokenbridge";
import { deriveWrappedMintKey } from '@wormhole-foundation/sdk-solana-tokenbridge';


const processName = 'att-test-transfer';
const evmChains = evm.evmOperatingChains();
const availableChains = (evmChains as ChainInfo[]).concat(solanaOperatingChains());
const usdcAddresses = {
  OptimismSepolia: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  Sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  Celo: ' 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  Solana: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
};

/**
 * This script expects the following environment variables:
 * - WALLET_KEY: private key of the wallet to use for sending transactions
 * - SOLANA_RECIPIENT_ADDRESS: Solana address to send tokens to
 *
 * Optionally, you can define the following:
 * - FLIP_ROUTES: set to true if you want to transfer the tokens in the opposite direction. Use after all the relays were redeemed to ensure you have the tokens.
 * - EVM_WALLET_KEY: EVM override for private key
 * - SOLANA_WALLET_KEY: Solana override for private key
 */


async function run() {
  console.log(`Start ${processName}!`);
  const start = process.hrtime.bigint();

  const flipRoutes = getEnvOrDefault("FLIP_ROUTES", "false").toLowerCase() === "true";
  const tests = flipRoutes ? uniqueTestTransfers.map(({fromChain, toChain, ...rest}) => ({
    fromChain: toChain,
    toChain: fromChain,
    ...rest,
  })) : uniqueTestTransfers;

  const sendTransaction: EvmScriptCb & SolanaScriptCb =  async (chain, signer, logFn) => {
    const transfers = tests.filter((testTransfer) => !testTransfer.skip && testTransfer.fromChain === chain.name);
    logFn(`Transfers from ${chain.name}: ${transfers.length}`);

    const promises = transfers.map(async (testTransfer) => {
      try {
        if (chain.name === "Solana") {
          await sendSolanaTestTransaction(
            chain as SolanaChainInfo,
            signer as SolanaSigner,
            logFn,
            testTransfer,
          );
        } else {
          await sendEvmTestTransaction(
            chain,
            signer as ethers.Signer,
            logFn,
            testTransfer,
          );
        }
      } catch (error) {
        console.error(`Error executing script for test: ${inspect(testTransfer)}`, error);
      }
    });
    await Promise.allSettled(promises);
  };

  await runOnEvms('send-test-transactions', sendTransaction);
  await runOnSolana('send-test-transactions', sendTransaction);

  const timeMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`Process ${processName} finished after ${timeMs} miliseconds`);
}

async function getLocalToken(tokenAddress: UniversalAddress, tokenChain: Chain, localChain: EvmChainInfo | SolanaChainInfo): Promise<UniversalAddress> {
  if (localChain.name === tokenChain) {
    return tokenAddress;
  }

  const tokenBridgeAddress = contracts.tokenBridge(localChain.network, localChain.name as Exclude<SupportedChain, "Sepolia" | "BaseSepolia" | "OptimismSepolia">);
  if (localChain.name === "Solana") {
    if (tokenChain === "Solana") {
      return tokenAddress;
    }
    return toUniversal("Solana", deriveWrappedMintKey(tokenBridgeAddress, chainToChainId(tokenChain), tokenAddress.toUint8Array()).toBytes());
  }

  const provider = getProvider(localChain);
  // ethers v6 provider typechecking chokes up with private members when you have a different version.
  // This probably sounds like a Wormhole SDK API defect imo.
  // The ContractReader interface does allow you to pass in specific functions for several query primitives.
  // Maybe we need to create a helper function that creates this interface for an ethers v6 in an easy and predictable way.
  // Alternatively, ethers should be a peer dependency instead.
  const tokenBridge = ethers_contracts.Bridge__factory.connect(tokenBridgeAddress, {provider: provider as any});
  const token = await tokenBridge.wrappedAsset(chainToChainId(tokenChain), tokenAddress.toString());
  return toUniversal(localChain.name as Chain, token);
}

function getNativeWrappedToken(chain: EvmChainInfo) {
  let token;
  try {
    ([, { address: token }] = resolveWrappedToken(chain.network, chain.name as Exclude<SupportedChain, "Solana">, "native"));
  } catch {}
  if (token === undefined) {
    throw new Error(`Could not find gas token for chain ${chain.name}`);
  }
  return token;
}

async function sendEvmTestTransaction(
  chain: EvmChainInfo,
  signer: ethers.Signer,
  log: LoggerFn,
  testTransfer: TestTransfer,
): Promise<void> {
  try {
    const inputToken = new EvmAddress(testTransfer.tokenAddress !== undefined
      ? await getLocalToken(toUniversal(testTransfer.tokenChain, testTransfer.tokenAddress), testTransfer.tokenChain, chain)
      : getNativeWrappedToken(chain));
    const gasDropoff = Number(testTransfer.gasDropoffAmount);
    const inputAmountInAtomic = BigInt(testTransfer.transferredAmount);
    const unwrapIntent = testTransfer.unwrapIntent;

    console.log({
      sourceChain: chain,
      inputToken,
      inputAmountInAtomic,
      gasDropoff,
      unwrapIntent
    });

    console.log(`Operating chain: ${inspect(chain)}`);

    const tbrv3ProxyAddress = new EvmAddress(getContractAddress('TbrV3Proxies', chainToChainId(chain.name)));
    const provider = getProvider(chain);
    const tbrv3 = Tbrv3.connectUnknown(
      wrapEthersProvider(provider!),
      chain.network,
      chain.name,
      tbrv3ProxyAddress
    );
    const targetChains = availableChains.filter((c) => c.name === testTransfer.toChain);

    let allAllowances = {};
    const promises = await Promise.allSettled(
      targetChains
        .filter((targetChain) => chain.name !== targetChain.name)
        .map(async (targetChain) => {
          try {
            log(`Creating transfer for ${chain.name} -> ${targetChain.name}`);

            const address =
              chainToPlatform(targetChain.name as Chain) === 'Evm'
                ? await signer.getAddress()
                : getEnv('SOLANA_RECIPIENT_ADDRESS');

            const [{result: isChainSupported}] = await tbrv3.query([
              {
                query: "ConfigQueries", queries: [{ query: "IsChainSupported", chain: targetChain.name as SupportedChain}]
              }
            ]);

            if (!isChainSupported) {
              console.error(`Chain ${targetChain.name} is not supported`);
              throw new Error(`Chain ${targetChain.name} is not supported`);
            }

            log({
              chain: targetChain.name,
              gasDropoff,
            });

            const {feeEstimations, allowances} = (
              await tbrv3.relayingFee({
                tokens: [inputToken],
                transferRequests: [{
                  targetChain: targetChain.name as SupportedChain,
                  gasDropoff,
                }],
              })
            );

            const feeEstimation = feeEstimations[0];
            log(`Fee estimation ${chain.name}->${targetChain.name}: ${inspect(feeEstimation)}`);

            allAllowances = {...allAllowances, ...allowances};
            return {
              args: {
                method: testTransfer.tokenAddress ? 'TransferTokenWithRelay' : 'TransferGasTokenWithRelay',
                acquireMode: { mode: 'Preapproved' },
                inputAmountInAtomic,
                gasDropoff,
                recipient: {
                  chain: targetChain.name as SupportedChain,
                  address: toUniversal(targetChain.name as Chain, address),
                },
                inputToken,
                unwrapIntent,
              },
              feeEstimation,
            } satisfies Transfer;
          } catch (err) {
            console.error(`Error creating transfer for ${chain.name}->${targetChain.name}: ${err}`);
            throw err;
          }
        }),
    );

    const transfers = promises
      .filter((promise) => promise.status === 'fulfilled')
      .map((promise) => promise.value);

    if (!transfers.length) {
      throw new Error('No transfers to execute');
    }

    log(`Executing ${transfers.length} transfers`, transfers);
    const { to, value, data } = tbrv3.transferWithRelay(allAllowances, ...transfers);

    const { receipt, error } = await sendTxCatch(signer, {
      to,
      value: (value * 110n) / 100n,
      data: ethers.hexlify(data),
    });

    if (error) {
      console.error(`Error: ${(error as any)?.stack ?? error}`);
    }

    if (receipt) {
      log(`Receipt: ${inspect(receipt)}`);
    }
  } catch (error) {
    console.error(`Error running ${processName}: ${(error as any)?.stack ?? error}}`);
  }
}

async function sendSolanaTestTransaction(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
  testTransfer: TestTransfer,
): Promise<void> {
  const gasDropoffAmount = Number(testTransfer.gasDropoffAmount);
  const transferredAmount = BigInt(testTransfer.transferredAmount);
  const unwrapIntent = testTransfer.unwrapIntent;

  const mint = testTransfer.tokenAddress ? new PublicKey(testTransfer.tokenAddress) : NATIVE_MINT;
  const tokenAccount = getAta(await signer.getAddress(), mint);

  const maxFeeSol = BigInt(getEnvOrDefault('MAX_FEE_SOL', '5000'));

  console.log({
    sourceChain: 'Solana',
    mint,
    tokenAccount,
    transferredAmount,
    gasDropoffAmount: gasDropoffAmount,
    maxFeeSol,
    unwrapIntent,
  });
  const targetChains = evmChains.filter((c) => c.name === testTransfer.toChain);

  await Promise.all(
    targetChains.map(async (targetChain) => {
      log(`Creating transfer for Solana->${targetChain.name}`);
      const signerKey = new PublicKey(await signer.getAddress());
      const connection = getConnection(chain);
      const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
      if (solanaDependencies === undefined) {
        throw new Error(`No dependencies found for chain ${chain.name}`);
      }

      const tbr = await SolanaTokenBridgeRelayer.create(connection);

      const evmAddress = getEnv('RECIPIENT_EVM_ADDRESS');
      const maxFeeLamports = BigInt(getEnvOrDefault('MAX_FEE_KLAMPORTS', '5000000'));

      let transferIx: TransactionInstruction;

      const params = {
        recipient: {
          chain: targetChain.name as Chain,
          address: toUniversal(targetChain.name as Chain, evmAddress),
        },
        userTokenAccount: tokenAccount,
        transferredAmount,
        gasDropoffAmount,
        maxFeeLamports,
        unwrapIntent,
        mintAddress: mint,
      } satisfies TransferParameters;

      transferIx = await tbr.transferTokens(signerKey, params);
      const ixs: TransactionInstruction[] = [];

      // if transferring SOL first we have to wrap it
      if (testTransfer.tokenAddress && testTransfer.tokenAddress === NATIVE_MINT.toBase58()) {
        const ata = await getAssociatedTokenAddress(
          mint!,
          signerKey,
        );

        const ataIx = createAssociatedTokenAccountIdempotentInstruction(
          signerKey,
          ata,
          signerKey,
          mint!
        );
        ixs.push(ataIx);

        const transferSol = SystemProgram.transfer({
          fromPubkey: signerKey,
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

function getAta(signer: Buffer, mint: PublicKey) {
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const associatedTokenProgramId = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

  const [address] = PublicKey.findProgramAddressSync(
    [signer, tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );

  return address;
}

const uniqueTestTransfers: TestTransfer[] = [
  // EVM to Solana and viceversa
  {
    // case A with no gas dropoff
    transferredAmount: '1000000',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Sepolia,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case A with gas dropoff
    transferredAmount: '1000000',
    gasDropoffAmount: '0.00001',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Sepolia,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case B gas token with no gas dropoff
    transferredAmount: '1000000000000', 
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case B gas token with gas dropoff
    transferredAmount: '1000000000000',
    gasDropoffAmount: '0.00001',
    unwrapIntent: false,
    tokenChain: "Celo",
    fromChain: "Celo",
    toChain: "Solana",
    skip: true,
  },
  {
    // case C (native sol token)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Solana,
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "Sepolia",
    skip: false,
  },
  {
    // case C (native sol token)
    transferredAmount: '1',
    gasDropoffAmount: '0.0001',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Solana,
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
    skip: true,
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
    // case D (native solana token wrapped on evm)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: '0x8e62ff4ba9944b4ddff5fc548deab4b22c6ea34e', // wrapped USDC
    tokenChain: "Solana",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case D (native solana token wrapped on evm with unwrap)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: true,
    tokenAddress: '0x8e62ff4ba9944b4ddff5fc548deab4b22c6ea34e', // wrapped USDC
    tokenChain: "Solana",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case E native evm token (wrapped on solana)
    transferredAmount: '1000000',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: '6F5YWWrUMNpee8C6BDUc6DmRvYRMDDTgJHwKhbXuifWs', // WETH
    sourceTokenAddress: '0xeef12A83EE5b7161D3873317c8E0E7B76e0B5D9c',
    tokenChain: "Sepolia",
    fromChain: "Solana",
    toChain: "Sepolia",
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
  },

  // EVM to EVM
  {
   // case F with no gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: false,
   tokenAddress: usdcAddresses.Sepolia,
   tokenChain: "Sepolia",
   fromChain: "Sepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case F with gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0.00001',
   unwrapIntent: false,
   tokenAddress: usdcAddresses.Sepolia,
   tokenChain: "Sepolia",
   fromChain: "Sepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case G gas token with no gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: true,
   tokenChain: "Celo",
   fromChain: "Celo",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case G gas token with gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0.00001',
   unwrapIntent: true,
   tokenChain: "Celo",
   fromChain: "Celo",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case H
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: false,
   tokenAddress: '0x99d8471E68E67a5ED748Afa806bFcfD7C56Bf63c', // wrapped sepolia USDC on optimism
   tokenChain: "Sepolia",
   fromChain: "Sepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case H
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: true,
   tokenAddress: '0x99d8471E68E67a5ED748Afa806bFcfD7C56Bf63c', // wrapped sepolia USDC on optimism
   tokenChain: "Sepolia",
   fromChain: "Sepolia",
   toChain: "Sepolia",
   skip: true,
 },

];

run().then(() => console.log('Done!'));
