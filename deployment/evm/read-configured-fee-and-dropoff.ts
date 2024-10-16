import {
  evm,
  getContractAddress,
  loadTbrPeers,
} from "../helpers/index.js";
import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { EvmAddress } from "@wormhole-foundation/sdk-evm/dist/cjs";
import { SupportedChain, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { wrapEthersProvider } from "../helpers/evm.js";
  
/**
 * Reads the configured relay fee and max gas dropoff for Tbrv3 contracts
 */
evm.runOnEvmsSequentially("read-configured-fee-and-dropoff", async (chain, signer, log) => {
  console.log(`Operating chain: ${chain.name}`);

  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
  const tbrv3 = Tbrv3.connect(
    wrapEthersProvider(signer.provider!),
    chain.network,
    chainIdToChain(chain.chainId),
    tbrv3ProxyAddress
  );
  const peers = loadTbrPeers(chain);


  let queries = [];
  for (const otherTbrv3 of peers) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChain;

    queries.push({query: "BaseFee", chain: otherTbrv3Chain} as const);
    queries.push({query: "MaxGasDropoff", chain: otherTbrv3Chain} as const);
  }
  const configValues = await tbrv3.query([{query: "ConfigQueries", queries}]);

  for (const config of configValues) {
    log(`Current ${config.query} for ${config.chain}: ${config.result}`);
  }

});
  