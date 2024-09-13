import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getContractAddress,
  getDependencyAddress,
  writeDeployedContract,
  ecosystemChains,
  getEnv,
} from '../helpers';
import { EvmTbrV3Config } from '../config/config.types';
import { ethers } from 'ethers';
import { Tbr__factory, Proxy__factory } from '../ethers-contracts/index.js';
import { getProvider, getSigner, sendTx } from '../helpers/evm';
import { SupportedChains, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain, zip } from '@wormhole-foundation/sdk-base';
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
            const address = await signer.getAddress();

            const isChainSupported = tbrv3.isChainSupported(targetChain.name as SupportedChains);

            if (!isChainSupported) {
              console.error(`Chain ${targetChain.name} is not supported`);
              errors.push({
                chain: targetChain.name,
                description: `Chain ${targetChain.name} is not supported`,
              });
              throw new Error(`Chain ${targetChain.name} is not supported`);
            } else {
              console.log(`Chain ${targetChain.name} is supported`);
            }

            const feeEstimation = (
              await tbrv3.relayingFee({
                targetChain: targetChain.name as SupportedChains,
                gasDropoff: 0n,
              })
            )[0];

            console.log(`Fee estimation: ${inspect(feeEstimation)}`);

            return {
              args: {
                method: 'TransferTokenWithRelay',
                acquireMode: { mode: 'Preapproved' },
                inputAmount: 1000n,
                gasDropoff: 0n,
                recipient: {
                  chain: targetChain.name as Chain,
                  address: toUniversal(targetChain.name as Chain, address),
                },
                inputToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
                unwrapIntent: false,
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

    console.log({
      to,
      value,
      data: ethers.hexlify(data),
    });

    // const { receipt, error } = await sendTx(signer, {
    //   to,
    //   value: (value * 110n) / 100n,
    //   data: ethers.hexlify(data),
    // });

    // if (error) {
    //   console.error(`Error: ${error}`);
    // }

    // if (receipt) {
    //   console.log(`Receipt: ${inspect(receipt)}`);
    // }
  } catch (err) {
    console.error(`Error running ${processName}: ${err}`);
  }

  const timeMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`Process ${processName} finished after ${timeMs} miliseconds`);
  console.log(`${errors.length} errors found: ${inspect(errors, { depth: 4 })}`);
}

run().then(() => console.log('Done!'));
