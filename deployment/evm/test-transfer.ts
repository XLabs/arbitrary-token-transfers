import {
  evm,
  getContractAddress,
  getEnv,
  getEnvOrDefault,
} from '../helpers';
import { ethers } from 'ethers';
import { getProvider, getSigner, sendTx } from '../helpers/evm';
import { SupportedChains, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain, chainToPlatform } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';
import { solanaOperatingChains } from '../helpers/solana';

const processName = 'tbr-v3';
const chains = evm.evmOperatingChains();
const targetChains = chains.concat(solanaOperatingChains());

async function run() {
  console.log(`Start ${processName}!`);
  const start = process.hrtime.bigint();
  const errors: any[] = [];

  try {
    const sourceChain = getEnv('SOURCE_CHAIN');
    const inputToken = getEnv('INPUT_TOKEN');
    const inputAmountInAtomic = BigInt(getEnvOrDefault('INPUT_AMOUNT', "1000"));
    const unwrapIntent = getEnvOrDefault('UNWRAP_INTENT', "false") === 'true';
    const configuredGasDropoff = Number(getEnvOrDefault('GAS_DROPOFF', "0"));

    console.log({
      sourceChain,
      inputToken,
      inputAmountInAtomic,
      unwrapIntent,
      configuredGasDropoff,
    })

    const chain = chains.find((chain) => chain.chainId === Number(sourceChain));

    console.log(`Operating chain: ${inspect(chain)}`);

    if (!chain) {
      throw new Error(`Unsupported chainId: ${sourceChain}`);
    }

    const tbrv3ProxyAddress = getContractAddress('TbrV3Proxies', chain.chainId);
    const provider = getProvider(chain);
    const tbrv3 = new Tbrv3(provider, chain.network, tbrv3ProxyAddress);
    const signer = await getSigner(chain);

    const promises = await Promise.allSettled(
      targetChains
        .filter((targetChain) => chain.chainId !== targetChain.chainId)
        .map(async (targetChain) => {
          try {
            console.log(`Creating transfer for ${chain.name}->${targetChain.name}`);

            const address = chainToPlatform(targetChain.name as Chain) === "Evm" ? await signer.getAddress() : getEnv('SOLANA_RECIPIENT_ADDRESS');

            const isChainSupported = await tbrv3.isChainSupported(targetChain.name as SupportedChains);

            if (!isChainSupported) {
              console.error(`Chain ${targetChain.name} is not supported`);
              errors.push({
                chain: targetChain.name,
                description: `Chain ${targetChain.name} is not supported`,
              });
              throw new Error(`Chain ${targetChain.name} is not supported`);
            }

            const gasDropoff = chainToPlatform(targetChain.name as Chain) === "Evm" ? configuredGasDropoff : 0;

            console.log({
              chain: targetChain.name,
              gasDropoff,
            })

            const feeEstimation = (
              await tbrv3.relayingFee({
                targetChain: targetChain.name as SupportedChains,
                gasDropoff,
              })
            )[0];

            console.log(`Fee estimation ${chain.name}->${targetChain.name}: ${inspect(feeEstimation)}`);

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
            errors.push({
              chain: targetChain.name,
              description: `Error creating transfer for ${chain.name}->${targetChain.name}`,
              error: err,
            });
            throw err;
          }
        }),
    );

    const transfers = promises
      .filter((promise) => promise.status === 'fulfilled')
      .map((promise) => promise.value);

    if (!transfers.length) {
      errors.push({
        description: 'No transfers to execute',
      });
      throw new Error('No transfers to execute');
    }

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
      console.log(`Receipt: ${inspect(receipt)}`);
    }
  } catch (err) {
    console.error(`Error running ${processName}: ${err}`);
  }

  const timeMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`Process ${processName} finished after ${timeMs} miliseconds`);
  console.log(`${errors.length} errors found: ${inspect(errors, { depth: 4 })}`);
}

run().then(() => console.log('Done!'));
