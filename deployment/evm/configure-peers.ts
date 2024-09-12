import {
  contracts,
  evm,
  getContractAddress,
} from "../helpers/index.js";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";


evm.runOnEvms("configure-peers", async (chain, signer, log) => {
  const tbrv3ProxyAddress = getContractAddress("Tbrv3Proxies", chain.chainId);
  const tbrv3 = new Tbrv3(signer.provider!, chain.network, tbrv3ProxyAddress);
  const deployedTbrv3s = contracts["Tbrv3Proxies"].filter((tbr) => tbr.chainId !== chain.chainId);

  const cmd = [];
  for (const otherTbrv3 of deployedTbrv3s) {
    // TODO: check if already peer: tbrv3.isPeer()
    cmd.push({ chain: chainIdToChain(otherTbrv3.chainId) as SupportedChains, peer: new UniversalAddress(otherTbrv3.address) });
  }

  if (cmd.length === 0) {
    log("No peers to add");
    return;
  }

  await tbrv3.addPeers(cmd);
});
