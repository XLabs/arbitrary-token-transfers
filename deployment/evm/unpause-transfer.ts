import {
  evm,
  getContractAddress,
  loadTbrPeers,
} from "../helpers/index.js";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { chainIdToChain, encoding } from "@wormhole-foundation/sdk-base";
import { ConfigCommand, ConfigQuery, SupportedChain, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { wrapEthersProvider } from "../helpers/evm.js";

/**
 * Unpause transfers for Tbrv3 contracts.
 */
evm.runOnEvms("unpause-transfer", async (chain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
  const tbrv3 = Tbrv3.connect(
    wrapEthersProvider(signer.provider!),
    chain.network,
    chainIdToChain(chain.chainId),
    undefined,
    tbrv3ProxyAddress
  );

  const queries = [];
  queries.push({ query: "IsChainPaused", chain: chainIdToChain(chain.chainId) as SupportedChain } as const satisfies ConfigQuery);
  const isPausedResults = await tbrv3.query([{query: "ConfigQueries", queries}]);

  if (!isPausedResults[0].result) {
    log("Chain is already unpaused.");
    return;
  }

  console.log(`Unpausing chain ${chain}...`);

  const partialTx = tbrv3.execTx(0n, [
    { command: "ConfigCommands", 
      commands: [ 
        { command: "UpdateTransferPause", 
          chain: chainIdToChain(chain.chainId) as SupportedChain, 
          value: false } 
        ] }])
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
  log(`Unpause tx successful in ${txid}`);

});
