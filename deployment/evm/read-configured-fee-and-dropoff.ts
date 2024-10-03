import {
    contracts,
    evm,
    getContractAddress,
  } from "../helpers/index.js";
  import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { EvmAddress } from "@wormhole-foundation/sdk-evm/dist/cjs";
  import { SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
  
  /**
   * Reads the configured relay fee and max gas dropoff for Tbrv3 contracts
   */
  evm.runOnEvmsSequentially("read-configured-fee-and-dropoff", async (chain, signer, log) => {
    console.log(`Operating chain: ${chain.name}`);

    const tbrv3ProxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
    const tbrv3 = Tbrv3.connect(signer.provider!, chain.network, chainIdToChain(chain.chainId), tbrv3ProxyAddress);
    const deployedTbrv3s = contracts["TbrV3Proxies"];
  
    for (const otherTbrv3 of deployedTbrv3s){
        const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChains;

        const currentRelayFee = await tbrv3.relayFee(otherTbrv3Chain);

        log(`Current relay fee for ${otherTbrv3Chain}: ${currentRelayFee.fee}`);
    }

    for (const otherTbrv3 of deployedTbrv3s) {
      const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChains;
  
      const currentMaxGasDropoff = await tbrv3.maxGasDropoff(otherTbrv3Chain);

      log(`Current max gas dropoff for ${otherTbrv3Chain}: ${currentMaxGasDropoff}`);
      }
  });
  