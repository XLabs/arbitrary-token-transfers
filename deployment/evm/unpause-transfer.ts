import {
  evm,
  getContractAddress,
  loadTbrPeers,
  LoggerFn
} from "../helpers/index.js";
import { Chain, chainIdToChain, chainToChainId, encoding } from "@wormhole-foundation/sdk-base";
import { ConfigCommand, ConfigQuery, SupportedChain, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { wrapEthersProvider } from "../helpers/evm.js";

/**
 * Unpause transfers for Tbrv3 contracts.
 */
evm.runOnEvms("unpause-transfer", async (operatingChain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chainToChainId(operatingChain.name)));
  const peers = loadTbrPeers(operatingChain);
  const tbrv3 = Tbrv3.connectUnknown(
    wrapEthersProvider(signer.provider!),
    operatingChain.network,
    operatingChain.name,
    tbrv3ProxyAddress
  );

  // TODO: accept specific chains to pause or unpause instead of doing an ecosystem wide operation.
  const queries = peers.map(({chainId}) => ({ query: "IsChainPaused", chain: chainIdToChain(chainId) as SupportedChain } as const satisfies ConfigQuery));
  const isPausedResults = await tbrv3.query([{query: "ConfigQueries", queries}]);

  const pausedChains = isPausedResults.filter(({result}) => result);
  if (pausedChains.length === 0) {
    log("These chains are already unpaused:");
    printChains(isPausedResults.map(({chain}) => chain), log);
    return;
  }

  console.log(`Unpausing chains:`);
  printChains(pausedChains.map(({chain}) => chain), log);

  const commands = pausedChains.map(({chain}) => ({
    command: "UpdateTransferPause",
    chain,
    value: false,
  } as const satisfies ConfigCommand));

  const partialTx = tbrv3.execTx(0n, [
    { command: "ConfigCommands", 
      commands,
    }])
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
  log(`Unpause tx successful in ${txid}`);

});

function printChains(chains: Chain[], log: LoggerFn) {
  log(`- ${chains.join("\n -")}`);
}