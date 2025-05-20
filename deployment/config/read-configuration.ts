import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { ChainId, chainIdToChain, chainToChainId, chainToPlatform } from '@wormhole-foundation/sdk-base';
import { toNative, toUniversal } from '@wormhole-foundation/sdk-definitions';
import { getConnection, ChainConfigEntry, queryOnSolana } from '../helpers/solana.js';
import type { EvmQueryCb, SolanaQueryCb } from '../helpers/interfaces.js';
import { getContractAddress, loadTbrPeer, loadTbrPeers } from '../helpers/env.js';
import { inspect } from 'util';
import { getProvider, queryOnEvmsSequentially, wrapEthersProvider } from '../helpers/evm.js';
import { Tbrv3, ConfigQuery } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { EvmAddress } from '@wormhole-foundation/sdk-evm';

const readChainConfig: SolanaQueryCb & EvmQueryCb = async function (
  operatingChain,
  log,
) {
  log('reading chain configs');
  const operatingChainId = chainToChainId(operatingChain.name);
  if (operatingChain.name === "Solana") {
    const connection = getConnection(operatingChain);
    const tbr = await SolanaTokenBridgeRelayer.create(connection);
    let allChainConfigs: ChainConfigEntry[];
    try {
      allChainConfigs = await tbr.read.allChainConfigs();
    } catch (e) {
      log(`error reading chain config for ${operatingChain.name}`, (e as any)?.stack ?? e);
      return;
    }
    allChainConfigs.forEach(({canonicalPeer, chainId, pausedOutboundTransfers, ...config}) => {
      log(`config for chain ${chainId} ${inspect(config)}`);

      if (pausedOutboundTransfers) {
        log(`transfers are paused towards chain ${chainId}`);
      }

      const peerChain = chainIdToChain(chainId as ChainId);
      const peerAddress = loadTbrPeer(peerChain)?.address;
      if (peerAddress === undefined) throw new Error(`Could not find peer address for chain ${chainId}`);

      const expectedPeer = toUniversal(peerChain, peerAddress);

      if (!expectedPeer.equals(canonicalPeer)) {
        log(`unexpected peer for chain ${chainId}: ${toNative(peerChain, canonicalPeer)}`);
      }
    });
    return;
  }

  if (chainToPlatform(operatingChain.name) === "Evm") {
    const provider = getProvider(operatingChain);
    const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", operatingChainId));
    const tbr = Tbrv3.connectUnknown(
      wrapEthersProvider(provider),
      tbrv3ProxyAddress,
    );

    const otherChains = loadTbrPeers(operatingChain).map(({chainId}) => chainId);
    const queries = [];
    for (const chainId of otherChains) {
      const canonicalPeerQuery = {
        query: "CanonicalPeer",
        chain: chainIdToChain(chainId)
      } as const satisfies ConfigQuery;
      const maxGasDropoffQuery = {
        query: "MaxGasDropoff",
        chain: chainIdToChain(chainId)
      } as const satisfies ConfigQuery;
      const isPausedQuery = {
        query: "IsChainPaused",
        chain: chainIdToChain(chainId)
      } as const satisfies ConfigQuery;
      const baseFeeQuery = {
        query: "BaseFee",
        chain: chainIdToChain(chainId)
      } as const satisfies ConfigQuery;

      queries.push(canonicalPeerQuery);
      queries.push(maxGasDropoffQuery);
      queries.push(isPausedQuery);
      queries.push(baseFeeQuery);
    }
    const results = await tbr.query([{query: "ConfigQueries", queries}]);
    for (const {query, result, chain} of results) {
      if (query === "CanonicalPeer") {
        const expectedPeer = toUniversal(chain, loadTbrPeer(chain).address);
        if (!expectedPeer.equals(result))
          log(`unexpected peer for ${chain}: ${toNative(chain, result)}`);
      }
      else if (query === "MaxGasDropoff")
        log(`max gas dropoff for ${chain} is ${result}`);
      else if (query === "IsChainPaused" && result)
        log(`transfers towards ${chain} are ${result ? "" : "not"} paused`);
      else if (query === "BaseFee")
        log(`base fee for transfers towards ${chain} is ${result}`);
    }
    return;
  }

  throw new Error(`Unknown chain ${operatingChain.name}`);
};

queryOnSolana('read-chain-configs', readChainConfig).then(() =>
  queryOnEvmsSequentially('read-chain-configs', readChainConfig)).catch((e) => {
    console.error('Error executing script: ', e);
});
