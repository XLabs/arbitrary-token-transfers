import {
  evm,
  getContractAddress,
  getDependencyAddress,
  loadTbrPeers,
} from "../helpers/index.js";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { Chain, chainIdToChain, chainToChainId, encoding } from "@wormhole-foundation/sdk-base";
import { ConfigCommand, ConfigQuery, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { wrapEthersProvider } from "../helpers/evm.js";

/**
 * Configure peers for Tbrv3 contracts:
 *  - Add all other Tbrv3 contracts as peers
 * If no peer is registered for a chain, it will be set as the canonical peer.
 */
evm.runOnEvms("set-canonical-peer", async (operatingChain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chainToChainId(operatingChain.name)));
  const tbrv3 = Tbrv3.connectUnknown(
    wrapEthersProvider(signer.provider!),
    tbrv3ProxyAddress,
  );

  // WARNING: We're going to assume we have only one peer per chain in this list
  // FIXME: create a loadCanonicalTbrPeers function and call that instead
  const peers = loadTbrPeers(operatingChain);

  const queries = [];
  for (const otherTbrv3 of peers) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId);
    queries.push({query: "CanonicalPeer", chain: otherTbrv3Chain} as const satisfies ConfigQuery);
  }
  const currentCanonicalPeers = await tbrv3.query([{query: "ConfigQueries", queries}]);
  const getCanonicalPeerAddress = (chain: Chain) => {
    return peers.find(({chainId}) => chainIdToChain(chainId) === chain)!.address;
  }

  const commands = currentCanonicalPeers.filter(({result, chain}) =>
    !result.equals(toUniversal(chain, getCanonicalPeerAddress(chain)))
  ).map(({chain}) => ({
    command: "UpdateCanonicalPeer",
    address: toUniversal(chain, getCanonicalPeerAddress(chain)),
    chain,
  } as const satisfies ConfigCommand));

  if (commands.length === 0) {
    log("All canonical peers are already correct.");
    return;
  }

  for (const command of commands) {
    log(`Will update canonical peer: ${command.address} (${command.chain}) on chain ${operatingChain.name}`);
  }
  const partialTx = tbrv3.execTx(0n, [{ command: "ConfigCommands", commands}]);
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
  log(`Update tx successful in ${txid}`);
});
