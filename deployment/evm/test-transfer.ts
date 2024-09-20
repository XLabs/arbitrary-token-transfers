import {
  evm,
  EvmChainInfo,
  getContractAddress,
  getEnv,
  LoggerFn,
} from '../helpers';
import { ethers } from 'ethers';
import { getProvider, runOnEvms, sendTx } from '../helpers/evm';
import { SupportedChains, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain, chainToPlatform } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';
import { solanaOperatingChains } from '../helpers/solana';

const processName = 'att-evm-test-transfer';
const chains = evm.evmOperatingChains();
const targetChains = chains.concat(solanaOperatingChains());

async function run() {
  console.log(`Start ${processName}!`);
  const start = process.hrtime.bigint();

  await runOnEvms('send-test-transactions', async (chain, signer, logFn) => {
    const promises = uniqueTestTransfers.map(async (testTransfer) => {
      try {
        if (testTransfer.isExecuted) return;

        await sendTestTransaction(
          chain,
          signer,
          logFn,
          BigInt(testTransfer.transferredAmount),
          Number(testTransfer.gasDropoffAmount),
          testTransfer.unwrapIntent === 'true',
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
  inputAmountInAtomic: bigint,
  gasDropoff: number,
  unwrapIntent: boolean,
): Promise<void> {
  try {
    const inputToken = getEnv('INPUT_TOKEN');

    console.log({
      sourceChain: chain,
      inputToken,
      inputAmountInAtomic,
      unwrapIntent,
      gasDropoff,
    });

    console.log(`Operating chain: ${inspect(chain)}`);

    const tbrv3ProxyAddress = getContractAddress('TbrV3Proxies', chain.chainId);
    const provider = getProvider(chain);
    const tbrv3 = new Tbrv3(provider, chain.network, tbrv3ProxyAddress);

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

            const isChainSupported = await tbrv3.isChainSupported(
              targetChain.name as SupportedChains,
            );

            if (!isChainSupported) {
              console.error(`Chain ${targetChain.name} is not supported`);
              throw new Error(`Chain ${targetChain.name} is not supported`);
            }

            log({
              chain: targetChain.name,
              gasDropoff,
            });

            const feeEstimation = (
              await tbrv3.relayingFee({
                targetChain: targetChain.name as SupportedChains,
                gasDropoff,
              })
            )[0];

            log(`Fee estimation ${chain.name}->${targetChain.name}: ${inspect(feeEstimation)}`);

            return {
              args: {
                method: 'TransferTokenWithRelay',
                acquireMode: { mode: 'Preapproved' },
                inputAmountInAtomic,
                gasDropoff,
                recipient: {
                  chain: targetChain.name as Chain,
                  address: toUniversal(targetChain.name as Chain, address),
                },
                inputToken,
                unwrapIntent,
              },
              feeEstimation,
            } as Transfer;
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
    const { to, value, data } = tbrv3.transferWithRelay(...transfers);

    const { receipt, error } = await sendTx(signer, {
      to,
      value: (value * 110n) / 100n,
      data: ethers.hexlify(data),
    });

    if (error) {
      console.error(`Error: ${error}`);
    }

    if (receipt) {
      log(`Receipt: ${inspect(receipt)}`);
    }
  } catch (err) {
    console.error(`Error running ${processName}: ${err}`);
  }
}

run().then(() => console.log('Done!'));

const uniqueTestTransfers = [
  {
    transferredAmount: '1000',
    gasDropoffAmount: '0',
    unwrapIntent: 'false',
    isExecuted: false,
  },
  {
    transferredAmount: '1000',
    gasDropoffAmount: '0',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  {
    transferredAmount: '1000',
    gasDropoffAmount: '10',
    unwrapIntent: 'false',
    isExecuted: false,
  },
  {
    transferredAmount: '1000',
    gasDropoffAmount: '10',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  // check if below cases makes sense
  {
    transferredAmount: '0',
    gasDropoffAmount: '10',
    unwrapIntent: 'true',
    isExecuted: false,
  },
  {
    transferredAmount: '0',
    gasDropoffAmount: '10',
    unwrapIntent: 'false',
    isExecuted: false,
  },
];
