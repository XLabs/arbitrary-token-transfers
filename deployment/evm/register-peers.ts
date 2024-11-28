import {
  evm,
  getContractAddress,
  loadTbrPeers,
} from "../helpers/index.js";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { chainIdToChain, chainToChainId, encoding } from "@wormhole-foundation/sdk-base";
import { ConfigCommand, ConfigQuery, SupportedChain, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { wrapEthersProvider } from "../helpers/evm.js";

/**
 * Configure peers for Tbrv3 contracts:
 *  - Add all other Tbrv3 contracts as peers
 * If no peer is registered for a chain, it will be set as the canonical peer.
 */
evm.runOnEvms("register-peers", async (operatingChain, signer, log) => {
  const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chainToChainId(operatingChain.name)));
  const tbrv3 = Tbrv3.connect(
    wrapEthersProvider(signer.provider!),
    operatingChain.network,
    operatingChain.name,
    undefined,
    tbrv3ProxyAddress
  );
  const peers = loadTbrPeers(operatingChain);

  const queries = [];
  for (const otherTbrv3 of peers) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChain;
    const peerAddress = toUniversal(otherTbrv3Chain, otherTbrv3.address);
    queries.push({query: "IsPeer", chain: otherTbrv3Chain, address: peerAddress} as const satisfies ConfigQuery);
  }
  const isPeerResults = await tbrv3.query([{query: "ConfigQueries", queries}]);

  const commands = isPeerResults.filter(({result}) => !result)
    .map(({result, query, ...rest}) => ({command: "AddPeer", ...rest} as const satisfies ConfigCommand));

  if (commands.length === 0) {
    log("No new peers to add.");
    return;
  }

  for (const command of commands) {
    log(`Will add peer: (${command.address}, ${command.chain}) on chain ${operatingChain.name}`);
  }
  const partialTx = tbrv3.execTx(0n, [{ command: "ConfigCommands", commands}]);
  const { txid } = await evm.sendTx(signer, { ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
  log(`Update tx successful in ${txid}`);
});
