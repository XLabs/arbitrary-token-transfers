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
} from '../helpers/index.js';
import { ethers } from 'ethers';
import { getProvider, runOnEvms, sendTxCatch, wrapEthersProvider } from '../helpers/evm.js';
import { Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { resolveWrappedToken, toUniversal, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { Chain, chainToChainId, chainToPlatform, contracts } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';
import { solanaOperatingChains, getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana.js';
import { EvmAddress } from '@wormhole-foundation/sdk-evm';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  SolanaTokenBridgeRelayer,
  TransferParameters,
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

import { ethers_contracts } from "@wormhole-foundation/sdk-evm-tokenbridge";
import { deriveWrappedMintKey } from '@wormhole-foundation/sdk-solana-tokenbridge';


const processName = 'att-test-transfer';
const evmChains = evm.evmOperatingChains();
const availableChains = (evmChains as ChainInfo[]).concat(solanaOperatingChains());
const usdcAddresses = {
  ArbitrumSepolia: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  OptimismSepolia: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  Sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  Celo: ' 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  Solana: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  PolygonSepolia: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'
};
const gasTokenAddresses = {
  Celo: '0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9',
};

const DEFAULT_MAX_FEE_SOL = 5000;
const DEFAULT_MAX_FEE_KLAMPORTS = 5000000;


async function approve(tokenAddress: string, spenderAddress: string, amount: number, signer: ethers.Signer) {
  const erc20Abi = [
    "function approve(address spender, uint256 amount) public returns (bool)"
  ];

  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const tx = await tokenContract.approve(spenderAddress, amount);
  const res = await tx.wait();
  if (res.status !== 1) {
    throw new Error(`Failed to approve ${amount} tokens to ${spenderAddress}`);
  }
}

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

  const tokenBridgeAddress: string = contracts.tokenBridge(localChain.network, localChain.name as any);
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
    ([, { address: token }] = resolveWrappedToken(chain.network, chain.name, "native"));
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

    await approve(inputToken.toString(), getContractAddress('TbrV3Proxies', chainToChainId(chain.name)), Number(inputAmountInAtomic), signer);
    const tbrv3ProxyAddress = new EvmAddress(getContractAddress('TbrV3Proxies', chainToChainId(chain.name)));

    const provider = getProvider(chain);
    const tbrv3 = Tbrv3.connectUnknown(
      wrapEthersProvider(provider!),
      chain.network,
      chain.name,
      tbrv3ProxyAddress
    );

    const targetChain = availableChains.find((c) => c.name === testTransfer.toChain);
    if (!targetChain) {
      throw new Error(`Target chain ${testTransfer.toChain} not found in configured operatingChains`);
    }

    let allAllowances = {}, transfer: Transfer
    try {
      log(`Creating transfer for ${chain.name} -> ${targetChain.name}`);

      const address =
        chainToPlatform(targetChain.name as Chain) === 'Evm'
          ? await signer.getAddress()
          : getEnv('SOLANA_RECIPIENT_ADDRESS');

      const [{ result: isChainSupported }] = await tbrv3.query([
        {
          query: "ConfigQueries", queries: [{ query: "IsChainSupported", chain: targetChain.name }]
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

      const { feeEstimations, allowances } = (
        await tbrv3.relayingFee({
          tokens: [inputToken],
          transferRequests: [{
            targetChain: targetChain.name,
            gasDropoff,
          }],
        })
      );

      const feeEstimation = feeEstimations[0];
      log(`Fee estimation ${chain.name}->${targetChain.name}: ${inspect(feeEstimation)}`);

      allAllowances = { ...allAllowances, ...allowances };
      transfer = {
        args: {
          method: testTransfer.tokenAddress ? 'TransferTokenWithRelay' : 'TransferGasTokenWithRelay',
          acquireMode: { mode: 'Preapproved' },
          inputAmountInAtomic,
          gasDropoff,
          recipient: {
            chain: targetChain.name,
            address: toUniversal(targetChain.name as Chain, address),
          },
          inputToken,
          unwrapIntent,
        },
        feeEstimation,
      } satisfies Transfer;
    } catch (err) {
      console.error(`Error creating transfer for test ${testTransfer.name}, route ${chain.name}->${targetChain.name}: ${err}`);
      throw err;
    }

    log(`Executing transfer`);
    const { to, value, data } = tbrv3.transferWithRelay(allAllowances, transfer);

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

  const maxFeeSol = BigInt(getEnvOrDefault('MAX_FEE_SOL', DEFAULT_MAX_FEE_SOL.toString()));

  console.log({
    sourceChain: 'Solana',
    mint,
    tokenAccount,
    transferredAmount,
    gasDropoffAmount: gasDropoffAmount,
    maxFeeSol,
    unwrapIntent,
  });
  const targetChain = evmChains.find((c) => c.name === testTransfer.toChain);
  if (!targetChain) {
    throw new Error(`Target chain ${testTransfer.toChain} not found in configured operatingChains`);
  }

  log(`Creating transfer for Solana->${targetChain.name}`);
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chain.name}`);
  }

  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  const evmAddress = getEnv('RECIPIENT_EVM_ADDRESS');
  const maxFeeLamports = BigInt(getEnvOrDefault('MAX_FEE_KLAMPORTS', DEFAULT_MAX_FEE_KLAMPORTS.toString()));

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

  const transferIxs = await tbr.transferTokens(signerKey, params);
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
  const txSignature = await ledgerSignAndSend(connection, ixs.concat(transferIxs), []);
  log(`Transaction sent: ${txSignature}`);
}

function getAta(signer: Buffer, mint: PublicKey) {
  const tokenProgramId = new PublicKey(TOKEN_PROGRAM_ID);
  const associatedTokenProgramId = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);

  const [address] = PublicKey.findProgramAddressSync(
    [signer, tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );

  return address;
}

const uniqueTestTransfers: TestTransfer[] = [
  // EVM to Solana and viceversa
  {
    name: "case A with no gas dropoff",
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
    name: "case A with gas dropoff",
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
    name: "case B gas token with no gas dropoff",
    transferredAmount: '1000000000000', 
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    name: "case B gas token with gas dropoff",
    transferredAmount: '1000000000000',
    gasDropoffAmount: '0.00001',
    unwrapIntent: false,
    tokenChain: "Celo",
    fromChain: "Celo",
    toChain: "Solana",
    skip: true,
  },
  {
    name: "case C (native sol token)",
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Solana,
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "Sepolia",
    skip: true,
  },
  {
    name: "case C (native sol token) with gas dropoff",
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
    name: "case D (gas token)",
    transferredAmount: '100000000',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "Sepolia",
    skip: true,
  },
  {
    name: "case D (gas token)",
    transferredAmount: '1',
    gasDropoffAmount: '0.0001',
    unwrapIntent: false,
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Solana",
    toChain: "Sepolia",
    skip: true,
  },
  {
    name: "case D* (native solana token wrapped on evm)",
    transferredAmount: '1000000',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    // tokenAddress: '0x8e62ff4ba9944b4ddff5fc548deab4b22c6ea34e', // wrapped USDC
    // tokenAddress: '0x824cb8fc742f8d3300d29f16ca8bee94471169f5', // WSOL on Sepolia
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    name: "case D* (native solana token wrapped on evm with unwrap)",
    transferredAmount: '1000000',
    gasDropoffAmount: '0',
    unwrapIntent: true,
    tokenAddress: NATIVE_MINT.toBase58(),
    tokenChain: "Solana",
    fromChain: "Sepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    name: "case E native evm token (wrapped on solana)",
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
    name: "case E native evm token (wrapped on solana) with gas dropoff",
    transferredAmount: '1000000',
    gasDropoffAmount: '100',
    unwrapIntent: true,
    tokenAddress: '6F5YWWrUMNpee8C6BDUc6DmRvYRMDDTgJHwKhbXuifWs', // WETH
    sourceTokenAddress: '0xeef12A83EE5b7161D3873317c8E0E7B76e0B5D9c',
    tokenChain: "Sepolia",
    fromChain: "Solana",
    toChain: "Sepolia",
    skip: true,
  },

  // EVM to EVM
  {
    name: "case F with no gas dropoff",
    transferredAmount: '1000000',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Sepolia,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Celo",
    skip: true,
  },
  {
    name: "case F with gas dropoff",
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
    name: "case G gas token with no gas dropoff",
    transferredAmount: '100000000000',
    gasDropoffAmount: '0',
    unwrapIntent: true,
    tokenChain: "Sepolia",
    fromChain: "Sepolia",
    toChain: "Celo",
    // gasTokenAddresses.Celo,
    skip: true,
  },
  {
    name: "case G gas token with gas dropoff",
    transferredAmount: '1000000',
    gasDropoffAmount: '0.00001',
    unwrapIntent: true,
    tokenChain: "Celo",
    fromChain: "Celo",
    toChain: "Sepolia",
    skip: true,
  },
  {
    name: "case H",
    transferredAmount: '99999',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: usdcAddresses.Sepolia,
    tokenChain: "Sepolia",
    fromChain: "Celo",
    toChain: "Sepolia",
    skip: false,
  }

];

run().then(() => console.log('Done!'));
