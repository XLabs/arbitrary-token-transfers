import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { ChainId, chainIdToChain, chainToChainId, chainToPlatform } from '@wormhole-foundation/sdk-base';
import { toNative } from '@wormhole-foundation/sdk-definitions';
import { runOnSolana, getConnection, ChainConfigEntry } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getContractAddress, loadTbrPeers } from '../helpers/env.js';
import { inspect } from 'util';
import { getProvider, runOnEvmsSequentially, wrapEthersProvider } from '../helpers/evm.js';
import type { EvmScriptCb } from '../helpers/interfaces.js';
import { Tbrv3, ConfigQuery, SupportedChain } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { EvmAddress } from '@wormhole-foundation/sdk-evm';

const readChainConfig: SolanaScriptCb & EvmScriptCb = async function (
  operatingChain,
  signer,
  log,
) {
  log('reading solana chain configs');
  const operatingChainId = chainToChainId(operatingChain.name);
  if (operatingChain.name === "Solana") {
    const connection = getConnection(operatingChain);
    const solanaDependencies = dependencies.find((d) => d.chainId === operatingChainId);
    if (solanaDependencies === undefined) {
      throw new Error(`No dependencies found for chain ${operatingChainId}`);
    }
    const tbr = await SolanaTokenBridgeRelayer.create(connection);
    let allChainConfigs: ChainConfigEntry[];
    try {
      allChainConfigs = await tbr.read.allChainConfigs();
    } catch (e) {
      log(`error reading chain config for ${operatingChain.name}`, (e as any)?.stack ?? e);
      return;
    }
    allChainConfigs.forEach((config) => {
      log(`config for ${config.chainId} ${inspect(config)}`);
      config.maxGasDropoffMicroToken
      config.pausedOutboundTransfers
      config.relayerFeeMicroUsd
      log(`peer for ${config.chainId} is ${toNative(chainIdToChain(config.chainId as ChainId), config.canonicalPeer)}`);
    });
    return;
  }

  if (chainToPlatform(operatingChain.name) === "Evm") {
    const provider = getProvider(operatingChain);
    const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", operatingChainId));
    const tbr = Tbrv3.connectUnknown(
      wrapEthersProvider(provider),
      operatingChain.network,
      operatingChain.name,
      tbrv3ProxyAddress,
      undefined
    );

    const otherChains = loadTbrPeers(operatingChain).map(({chainId}) => chainId);
    const queries = [];
    for (const chainId of otherChains) {
      const canonicalPeerQuery = {
        query: "CanonicalPeer",
        chain: chainIdToChain(chainId) as SupportedChain
      } as const satisfies ConfigQuery;
      const maxGasDropoffQuery = {
        query: "MaxGasDropoff",
        chain: chainIdToChain(chainId) as SupportedChain
      } as const satisfies ConfigQuery;
      const isPausedQuery = {
        query: "IsChainPaused",
        chain: chainIdToChain(chainId) as SupportedChain
      } as const satisfies ConfigQuery;
      const baseFeeQuery = {
        query: "BaseFee",
        chain: chainIdToChain(chainId) as SupportedChain
      } as const satisfies ConfigQuery;

      queries.push(canonicalPeerQuery);
      queries.push(maxGasDropoffQuery);
      queries.push(isPausedQuery);
      queries.push(baseFeeQuery);
    }
    const results = await tbr.query([{query: "ConfigQueries", queries}]);
    for (const {query, result, chain} of results) {
      if (query === "CanonicalPeer")
        log(`peer for ${chain} is ${toNative(chain, result)}`);
      if (query === "MaxGasDropoff")
        log(`max gas dropoff for ${chain} is ${result}`);
      if (query === "IsChainPaused")
        log(`transfers towards ${chain} are ${result ? "" : "not"} paused`);
      if (query === "BaseFee")
        log(`base fee for transfers towards ${chain} is ${result}`);
    }
    return;
  }

  throw new Error(`Unknown chain ${operatingChain.name}`);
};

runOnSolana('read-chain-configs', readChainConfig).then(() =>
  runOnEvmsSequentially('read-chain-configs', readChainConfig)).catch((e) => {
    console.error('Error executing script: ', e);
});
