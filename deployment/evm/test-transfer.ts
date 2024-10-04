import {
  evm,
  EvmChainInfo,
  getContractAddress,
  getEnv,
  LoggerFn,
  TestTransfer,
} from '../helpers';
import { ethers } from 'ethers';
import { getProvider, runOnEvms, sendTxCatch, wrapEthersProvider } from '../helpers/evm';
import { SupportedChain, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain, chainIdToChain, chainToPlatform } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';
import { solanaOperatingChains } from '../helpers/solana';
import { EvmAddress } from '@wormhole-foundation/sdk-evm/dist/cjs';
import { getNative } from '@wormhole-foundation/sdk-base/tokens';

const processName = 'att-evm-test-transfer';
const chains = evm.evmOperatingChains();
const availableChains = chains.concat(solanaOperatingChains());
const usdcAddresses = {
  OptimismSepolia: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  Sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  Celo: '	0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  Solana: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
};

/**
 * This script expects the following environment variables:
 * - WALLET_KEY: private key of the wallet to use for sending transactions
 * - SOLANA_RECIPIENT_ADDRESS: Solana address to send tokens to
 */


async function run() {
  console.log(`Start ${processName}!`);
  const start = process.hrtime.bigint();

  await runOnEvms('send-test-transactions', async (chain, signer, logFn) => {
    const transfersFromChain = uniqueTestTransfers.filter((testTransfer) => !testTransfer.skip && testTransfer.fromChain === chain.name);
    logFn(`Transfers from ${chain.name}: ${transfersFromChain.length}`);

    const promises = transfersFromChain.map(async (testTransfer) => {
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
  chain: EvmChainInfo,
  signer: ethers.Signer,
  log: LoggerFn,
  testTransfer: TestTransfer,
): Promise<void> {
  try {
    const inputTokenStr = testTransfer.tokenAddress
      ?? getNative("Testnet", chain.name as SupportedChain)?.wrappedKey;
    if (inputTokenStr === undefined) throw new Error(`Could not find gas token for chain ${chain.name}`);
    const inputToken = new EvmAddress(inputTokenStr);
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

    const tbrv3ProxyAddress = new EvmAddress(getContractAddress('TbrV3Proxies', chain.chainId));
    const provider = getProvider(chain);
    const tbrv3 = Tbrv3.connect(
      wrapEthersProvider(provider!),
      chain.network,
      chainIdToChain(chain.chainId),
      tbrv3ProxyAddress
    );
    const targetChains = availableChains.filter((c) => c.name === testTransfer.toChain);

    let allAllowances = {};
    const promises = await Promise.allSettled(
      targetChains
        .filter((targetChain) => chain.chainId !== targetChain.chainId)
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
                // TODO: enable this to work on a mainnet fork too?
                tokens: [new EvmAddress(inputToken)],
                transferRequests: [{
                  targetChain: targetChain.name as SupportedChain,
                  gasDropoff,
                }],
              })
            );

            const feeEstimation = feeEstimations[0];
            log(`Fee estimation ${chain.name}->${targetChain.name}: ${inspect(feeEstimation)}`);

            allAllowances = {...allAllowances, allowances};
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

run().then(() => console.log('Done!'));
  
const uniqueTestTransfers: TestTransfer[] = [
  // EVM to Solana
  {
    // case A with no gas dropoff
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // USDC
    tokenChain: "OptimismSepolia",
    fromChain: "OptimismSepolia",
    toChain: "Solana",
    skip: false,
  },
  {
    // case A with gas dropoff
    transferredAmount: '1',
    gasDropoffAmount: '0.00001',
    unwrapIntent: false,
    tokenAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // USDC
    tokenChain: "OptimismSepolia",
    fromChain: "OptimismSepolia",
    toChain: "Solana",
    skip: true,
  },
  {
    // case B gas token with no gas dropoff
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenChain: "Celo",
    fromChain: "Celo",
    toChain: "Solana",
    skip: true,
  },
  {
    // case B gas token with gas dropoff
    transferredAmount: '1',
    gasDropoffAmount: '0.00001',
    unwrapIntent: false,
    tokenChain: "Celo",
    fromChain: "Celo",
    toChain: "Solana",
    skip: true,
  },
  {
    // case D (native solana token wrapped on evm)
    transferredAmount: '1',
    gasDropoffAmount: '0',
    unwrapIntent: false,
    tokenAddress: '0x8e62ff4ba9944b4ddff5fc548deab4b22c6ea34e', // wrapped USDC
    tokenChain: "Solana",
    fromChain: "OptimismSepolia",
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
    fromChain: "OptimismSepolia",
    toChain: "Solana",
    skip: true,
  },
  
  // EVM to EVM
  {
   // case F with no gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: false,
   tokenAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // USDC
   tokenChain: "OptimismSepolia",
   fromChain: "OptimismSepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case F with gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0.00001',
   unwrapIntent: false,
   tokenAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // USDC
   tokenChain: "OptimismSepolia",
   fromChain: "OptimismSepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case G gas token with no gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: false,
   tokenChain: "Celo",
   fromChain: "Celo",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case G gas token with gas dropoff
   transferredAmount: '1',
   gasDropoffAmount: '0.00001',
   unwrapIntent: false,
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
   tokenAddress: '0x99d8471E68E67a5ED748Afa806bFcfD7C56Bf63c', // wrapped sepolia USDC on optimisim
   tokenChain: "Sepolia",
   fromChain: "OptimismSepolia",
   toChain: "Sepolia",
   skip: true,
 },
 {
   // case H 
   transferredAmount: '1',
   gasDropoffAmount: '0',
   unwrapIntent: true,
   tokenAddress: '0x99d8471E68E67a5ED748Afa806bFcfD7C56Bf63c', // wrapped sepolia USDC on optimisim
   tokenChain: "Sepolia",
   fromChain: "OptimismSepolia",
   toChain: "Sepolia",
   skip: true,
 },
  
];
