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
 * Configure peers for Tbrv3 contracts:
 *  - Add all other Tbrv3 contracts as peers
 * If no peer is registered for a chain, it will be set as the canonical peer.
 */
evm.runOnEvms("set-canonical-peer", async (chain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
  const tbrv3 = Tbrv3.connect(
    wrapEthersProvider(signer.provider!),
    chain.network,
    chainIdToChain(chain.chainId),
    undefined,
    tbrv3ProxyAddress
  );

  // WARNING: We're going to assume we have only one peer per chain in this list
  // FIXME: create a loadCanonicalTbrPeers function and call that instead
  const peers = loadTbrPeers(chain);

  const queries = [];
  for (const otherTbrv3 of peers) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChain;
    queries.push({query: "CanonicalPeer", chain: otherTbrv3Chain} as const satisfies ConfigQuery);
  }
  const isCanonicalPeerResults = await tbrv3.query([{query: "ConfigQueries", queries}]);
  peers.find(({chainId}) => chainId === chain.chainId)

  const commands = isCanonicalPeerResults.filter(({result}) => !result)
    .map(({chain}) => ({
      command: "UpdateCanonicalPeer",
      address: toUniversal(chain, peers.find(({chainId}) => chainIdToChain(chainId) === chain)!.address),
      chain,
    } as const satisfies ConfigCommand));

  if (commands.length === 0) {
    log("All canonical peers are already correct.");
    return;
  }

  for (const command of commands) {
    log(`Will update canonical peer: ${command.address} (${command.chain}) on chain ${chain.name}`);
  }
  const partialTx = tbrv3.execTx(0n, [{ command: "ConfigCommands", commands}]);
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
  log(`Update tx successful in ${txid}`);
});
