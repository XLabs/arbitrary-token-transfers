import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getContractAddress,
  getDependencyAddress,
  writeDeployedContract,
  ecosystemChains,
} from '../helpers';
import { EvmTbrV3Config } from '../config/config.types';
import { ethers } from 'ethers';
import { Tbr__factory, Proxy__factory } from '../ethers-contracts/index.js';
import { getProvider, getSigner, sendTx } from '../helpers/evm';
import { SupportedChains, Tbrv3, Transfer } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain } from '@wormhole-foundation/sdk-base';
import { inspect } from 'util';

const processName = 'tbr-v3';
const chains = evm.evmOperatingChains();

async function run() {
  console.log(`Start ${processName}!`);

  for (const chain of chains.filter((chain) => chain.chainId === 10002)) {
    const tbrv3ProxyAddress = getContractAddress('TbrV3Proxies', chain.chainId);
    const provider = getProvider(chain);
    const tbrv3 = new Tbrv3(provider, chain.network, tbrv3ProxyAddress);
    const signer = await getSigner(chain);

    const transfers = await Promise.all(
      chains
        .filter((targetChain) => chain.chainId !== targetChain.chainId)
        .map(async (chain) => {
          const address = await signer.getAddress();

          const feeEstimation = (
            await tbrv3.relayingFee({
              targetChain: chain.name as SupportedChains,
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
                chain: chain.name as Chain,
                address: toUniversal(chain.name as Chain, address),
              },
              inputToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
              unwrapIntent: false,
            },
            feeEstimation,
          } as Transfer;
        }),
    );

    console.log('transfers', transfers);

    const { to, value, data } = tbrv3.transferWithRelay(...transfers);

    console.log({
      to,
      value,
      data: ethers.hexlify(data),
    });

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
  }
}

run().then(() => console.log('Done!'));
