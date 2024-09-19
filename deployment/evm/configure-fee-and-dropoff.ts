import {
  contracts,
  evm,
  getChainConfig,
  getContractAddress,
} from "../helpers/index.js";
import { chainIdToChain } from "@wormhole-foundation/sdk-base";
import { SupportedChains, Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { ethers } from "ethers";
import { EvmTbrV3Config } from "../config/config.types.js";

/**
 * Configures relay fee and max gas dropoff for Tbrv3 contracts
 */
evm.runOnEvms("configure-fee-and-dropoff", async (chain, signer, log) => {
  const tbrv3ProxyAddress = getContractAddress("TbrV3Proxies", chain.chainId);
  const tbrv3 = new Tbrv3(signer.provider!, chain.network, tbrv3ProxyAddress);
  const deployedTbrv3s = contracts["TbrV3Proxies"].filter((tbr) => tbr.chainId !== chain.chainId);

  const relayFeeUpdates: Map<SupportedChains, number> = new Map();
  for (const otherTbrv3 of deployedTbrv3s) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChains;
    const peerChainCfg = await getChainConfig<EvmTbrV3Config>("tbr-v3", otherTbrv3.chainId);
    const desiredRelayFee = Number(peerChainCfg.relayFee);

    const currentRelayFee = await tbrv3.relayFee(otherTbrv3Chain as SupportedChains);
    if (currentRelayFee.fee !== desiredRelayFee) {
      log(`Will updaterelay fee for ${otherTbrv3Chain}: ${peerChainCfg.maxGasDropoff}`);
      relayFeeUpdates.set(otherTbrv3Chain, desiredRelayFee);
    }
  }  

  if (relayFeeUpdates.size !== 0) {
    log("Updating relay fee");
    const partialTx = tbrv3.updateRelayFees(relayFeeUpdates);
    const { error, receipt } = await evm.sendTx(signer, { ...partialTx, data: ethers.hexlify(partialTx.data) });
    if (error) {
      log("Error updating relay fee: ", error);
      throw error;
    }
    if (receipt) {
      log("Updated relay fee");
    }
  }

  const updateMaxGasDropoff: Map<SupportedChains, number> = new Map();
  for (const otherTbrv3 of deployedTbrv3s) {
    const otherTbrv3Chain = chainIdToChain(otherTbrv3.chainId) as SupportedChains;
    const peerChainCfg = await getChainConfig<EvmTbrV3Config>("tbr-v3", otherTbrv3.chainId);
    const desiredMaxGasDropoff = Number(peerChainCfg.maxGasDropoff);

    const currentMaxGasDropoff = await tbrv3.maxGasDropoff(otherTbrv3Chain);
    if (currentMaxGasDropoff !== desiredMaxGasDropoff) {
      log(`Will update max gas dropoff for ${otherTbrv3Chain}: ${peerChainCfg.maxGasDropoff}`);
      updateMaxGasDropoff.set(otherTbrv3Chain, desiredMaxGasDropoff);
    }
  }

  if (updateMaxGasDropoff.size !== 0) {
    log("Updating max gas dropoff");
    const partialTx = tbrv3.updateMaxGasDroppoffs(updateMaxGasDropoff);
    const { error, receipt } = await evm.sendTx(signer, { ...partialTx, data: ethers.hexlify(partialTx.data) });
    if (error) {
      log("Error updating max gas dropoff: ", error);
      throw error;
    }
    if (receipt) {
      log("Updated max gas dropoff");
    }
  } else {
    log("No max gas dropoff to update");
  }
  
});
