import {
  contracts,
  evm,
  getContractAddress,
} from "../helpers/index.js";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";

/**
 * Configure peers for Tbrv3 contracts:
 *  - Add all other Tbrv3 contracts as caonical peers
 *  - Add all other Tbrv3 contracts as peers
 *  
 */
evm.runOnEvms("configure-peers", async (chain, signer, log) => {
  const tbrv3ProxyAddress = getContractAddress("Tbrv3Proxies", chain.chainId);
  const tbrv3 = new Tbrv3(signer.provider!, chain.network, tbrv3ProxyAddress);
  const deployedTbrv3s = contracts["Tbrv3Proxies"].filter((tbr) => tbr.chainId !== chain.chainId);

  const addPeersCmd = [];
  const updateCanonicalPeersCmd: Map<SupportedChains, UniversalAddress> = new Map();
  for (const otherTbrv3 of deployedTbrv3s) {
    // TODO: check if already peer: tbrv3.isPeer()
    const peerAddress = new UniversalAddress(otherTbrv3.address);
    addPeersCmd.push({ chain: chainIdToChain(otherTbrv3.chainId) as SupportedChains, peer: peerAddress });
    updateCanonicalPeersCmd.set(chainIdToChain(otherTbrv3.chainId) as SupportedChains, peerAddress);
  }
  if (addPeersCmd.length === 0) {
    log("No peers to add");
    return;
  } 
  await tbrv3.addPeers(addPeersCmd);
  await tbrv3.updateCanonicalPeers(updateCanonicalPeersCmd);
});
