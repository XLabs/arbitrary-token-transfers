import {
  contracts,
  evm,
  getContractAddress,
} from "../helpers/index.js";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { SolanaAddress } from "@wormhole-foundation/sdk-solana";
import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { ethers } from "ethers";

/**
 * Configure peers for Tbrv3 contracts:
 *  - Add all other Tbrv3 contracts as canonical peers
 *  - Add all other Tbrv3 contracts as peers
 *  
 */
evm.runOnEvms("register-peers", async (chain, signer, log) => {
  const tbrv3ProxyAddress = getContractAddress("TbrV3Proxies", chain.chainId);
  const tbrv3 = new Tbrv3(signer.provider!, chain.network, tbrv3ProxyAddress);
  const deployedTbrv3s = contracts["TbrV3Proxies"].filter((tbr) => tbr.chainId !== chain.chainId);
  const solana = contracts["TbrV3"].find((tbr) => tbr.chainId === 1);
  if (solana) {
    deployedTbrv3s.push(solana);
  }

  const addPeersCmd: { chain: SupportedChains, peer: UniversalAddress }[] = [];
  const updateCanonicalPeersCmd: Map<SupportedChains, UniversalAddress> = new Map();
  for (const otherTbrv3 of deployedTbrv3s) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChains;
    const peerAddress = (otherTbrv3Chain === "Solana" ?
      new SolanaAddress(otherTbrv3.address).toUniversalAddress() :
      new UniversalAddress(otherTbrv3.address)) as UniversalAddress;

    const currentCanonicalPeer = await tbrv3.canonicalPeer(otherTbrv3Chain);
    if (!currentCanonicalPeer.equals(peerAddress)) {
      log(`Will update canonical peer: ${peerAddress} (${otherTbrv3.chainId})`);
      updateCanonicalPeersCmd.set(otherTbrv3Chain, peerAddress);
    }

    const isPeer = updateCanonicalPeersCmd.get(otherTbrv3Chain)?.equals(peerAddress) || await tbrv3.isPeer(otherTbrv3Chain, peerAddress);
    if (!isPeer) {
      log(`Will add peer: ${peerAddress}(${otherTbrv3.chainId})`);
      addPeersCmd.push({ chain: otherTbrv3Chain, peer: peerAddress });
    }

  }

  if (updateCanonicalPeersCmd.size !== 0) {
    log("updating canonical peers");
    const partialTx = await tbrv3.updateCanonicalPeers(updateCanonicalPeersCmd);
    const { error, receipt } = await evm.sendTx(signer, { ...partialTx, data: ethers.hexlify(partialTx.data) });
    if (error) {
      log("Error updating canonical peers: ", error);
    }
    if (receipt) {
      log(`Updated canonical peers: ${updateCanonicalPeersCmd.size}`);
    }
  } else {
    log("No canonical peers to update");
  }

  if (addPeersCmd.length !== 0) {
    log("adding peers");
    const partialTx = await tbrv3.addPeers(addPeersCmd);
    const { error, receipt } = await evm.sendTx(signer, { ...partialTx, data: ethers.hexlify(partialTx.data) });
    if (error) {
      log("Error adding peers: ", error);
    }
    if (receipt) {
      log(`Added peers: ${addPeersCmd.length}`);
    }
  } else {
    log("No peers to add");
  }


});
