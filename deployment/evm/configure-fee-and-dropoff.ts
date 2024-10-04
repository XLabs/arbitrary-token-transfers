import {
  evm,
  getChainConfig,
  getContractAddress,
  loadTbrPeers,
} from "../helpers/index.js";
import { chainIdToChain, encoding } from "@wormhole-foundation/sdk-base";
import { SupportedChain, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { EvmTbrV3Config } from "../config/config.types.js";
import { EvmAddress } from "@wormhole-foundation/sdk-evm/dist/cjs";
import { wrapEthersProvider } from "../helpers/evm.js";

/**
 * Configures relay fee and max gas dropoff for Tbrv3 contracts
 */
evm.runOnEvms("configure-fee-and-dropoff", async (chain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
  const tbrv3 = Tbrv3.connect(wrapEthersProvider(signer.provider!), chain.network, "Sepolia", tbrv3ProxyAddress);
  const peers = loadTbrPeers(chain);

  const queries = [];
  for (const otherTbrv3 of peers) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChain;

    queries.push({query: "BaseFee", chain: otherTbrv3Chain} as const);
    queries.push({query: "MaxGasDropoff", chain: otherTbrv3Chain} as const);
  }

  const configValues = await tbrv3.query([{query: "ConfigQueries", queries}]);

  const currentState: Map<SupportedChain, {baseFee: number; maxGasDropoff: number}> = new Map(peers.map(({chainId}) => [
    chainIdToChain(chainId) as SupportedChain,
    {} as any
  ]));
  for (const config of configValues) {
    const chainState = currentState.get(config.chain)!;
    if (config.query === "BaseFee") {
      chainState.baseFee = config.result;
    } else {
      chainState.maxGasDropoff = config.result;
    }
  }

  const commands = [];
  for (const otherTbrv3 of peers) {
    const peerChainCfg = await getChainConfig<EvmTbrV3Config>("tbr-v3", otherTbrv3.chainId);
    const desiredBaseFee = Number(peerChainCfg.relayFee);
    const desiredMaxGasDropoff = Number(peerChainCfg.maxGasDropoff);
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChain;
    const chainState = currentState.get(otherTbrv3Chain)!;
    // schedule update
    if (chainState.baseFee !== desiredBaseFee) {
      log(`Will update base fee for ${otherTbrv3Chain}: ${peerChainCfg.maxGasDropoff}`);
      commands.push({command: "UpdateBaseFee", chain: otherTbrv3Chain, value: desiredBaseFee} as const);
    }
    if (chainState.maxGasDropoff !== desiredMaxGasDropoff) {
      log(`Will update max gas dropoff for ${otherTbrv3Chain}: ${peerChainCfg.maxGasDropoff}`);
      commands.push({command: "UpdateMaxGasDropoff", chain: otherTbrv3Chain, value: desiredMaxGasDropoff} as const);
    }
  }

  if (commands.length === 0) {
    log("No updates to base fee or max gas dropoff are needed.");
    return;
  }

  const partialTx = tbrv3.execTx(0n, [{ command: "ConfigCommands", commands}]);
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data) });
  log(`Update tx successful in ${txid}`);
});
