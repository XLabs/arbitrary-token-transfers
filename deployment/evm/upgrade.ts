import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getContractAddress,
  getDependencyAddress,
  getDeploymentArgs,
  writeDeployedContract
} from "../helpers";
import { EvmTbrV3Config } from "../config/config.types";
import { ethers } from "ethers";
import { Tbr__factory } from "../ethers-contracts/index.js";
import { getSigner, getProvider, sendTx, wrapEthersProvider } from "../helpers/evm";
import { EvmAddress } from '@wormhole-foundation/sdk-evm';
import { chainIdToChain } from '@wormhole-foundation/sdk-base';
import { deployRelayerImplementation } from "./deploy-implementation";


const processName = "tbr-v3";
const chains = evm.evmOperatingChains();

async function run() {
  console.log(`Start ${processName}!`);

  const results = await Promise.all(
    chains.map(async (chain) => {
      console.log(`Deploy starting for chain ${chain.chainId}...`);
      const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chain.chainId);
      const result = await upgradeTbrV3Relayer(chain, config);
      console.log(`Deploy finished for chain ${chain.chainId}...`);

      return result;
    })
  );

  for (const result of results) {
    if (result.error) {
      console.error(
        `Error deploying to chain ${result.chainId}: ${result.error}`
      );
    } else {
      console.log(`Successfully deployed to chain ${result.chainId}`);

      writeDeployedContract(result.chainId, "TbrV3", result.implementation?.address ?? "", result.implementation?.constructorArgs ?? []);
      writeDeployedContract(result.chainId, "TbrV3Proxies", result.proxy?.address.toString() ?? "", result.proxy?.constructorArgs ?? []);
    }
  }

}

async function upgradeTbrV3Relayer(chain: EvmChainInfo, config: EvmTbrV3Config) {
  let implementation, proxy;

  try {
    implementation = await deployRelayerImplementation(chain, config);
  } catch (error) {
    console.log(`Failed to deploy contract implementation for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  try {
    proxy = await upgradeProxyWithNewImplementation(chain, config, implementation.address);
  } catch (error) {
    console.log(`Failed to upgrade proxy implementation for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  return { chainId: chain.chainId, implementation, proxy };
}

async function upgradeProxyWithNewImplementation(
  chain: EvmChainInfo,
  config: EvmTbrV3Config,
  implementationAddress: string,
) {
  console.log("Upgrade Proxy with new implementation " + chain.chainId);
  const signer = await getSigner(chain);
  const { Tbrv3 } = await import("@xlabs-xyz/evm-arbitrary-token-transfers");

  // HACK! resolveWrappedToken does not seem to work for CELO native currency.
  const gasTokenAddress = chain.chainId === 14 ? new EvmAddress(getDependencyAddress("initGasToken", chain)) : undefined;

  const proxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId));
  const tbr = Tbrv3.connect(
    wrapEthersProvider(getProvider(chain)),
    chain.network,
    chainIdToChain(chain.chainId),
    gasTokenAddress,
    proxyAddress,
  );

  const tx = tbr.execTx(0n, [{
    command: "UpgradeContract",
    newImplementation: new EvmAddress(implementationAddress),
  }]);

  const { txid } = await sendTx(signer, {
    ...tx,
    data: ethers.hexlify(tx.data),
  });

  console.log(`Tx Included!. TxHash: ${txid}`);

  const constructorArgs = [implementationAddress];
  const previousConstructorArgs = getDeploymentArgs("TbrV3Proxies", chain.chainId);
  if (previousConstructorArgs) {
    constructorArgs.push(...previousConstructorArgs.slice(1));
  }

  return { chainId: chain.chainId, address: proxyAddress, constructorArgs };
}


run().then(() => console.log("Done!"));
