import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getContractAddress,
  getDependencyAddress,
  getDeploymentArgs,
  writeDeployedContract
} from "../helpers/index.js";
import { EvmTbrV3Config } from "../config/config.types.js";
import { getSigner, sendTx, wrapEthersProvider } from "../helpers/evm.js";
import { EvmAddress } from '@wormhole-foundation/sdk-evm';
import { chainToChainId, encoding } from '@wormhole-foundation/sdk-base';
import { deployRelayerImplementation } from "./deploy-implementation.js";


const processName = "tbr-v3";
const chains = evm.evmOperatingChains();

async function run() {
  console.log(`Start ${processName}!`);

  const results = await Promise.all(
    chains.map(async (chain) => {
      console.log(`Deploy starting for chain ${chain.name}...`);
      const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chainToChainId(chain.name));
      const result = await upgradeTbrV3Relayer(chain, config);
      console.log(`Deploy finished for chain ${chain.name}...`);

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
    console.log(`Failed to deploy contract implementation for chain ${chain.name}`);
    return { chainId: chainToChainId(chain.name), error };
  }

  try {
    proxy = await upgradeProxyWithNewImplementation(chain, config, implementation.address);
  } catch (error) {
    console.log(`Failed to upgrade proxy implementation for chain ${chain.name}`);
    return { chainId: chainToChainId(chain.name), error };
  }

  return { chainId: chainToChainId(chain.name), implementation, proxy };
}

async function upgradeProxyWithNewImplementation(
  operatingChain: EvmChainInfo,
  config: EvmTbrV3Config,
  implementationAddress: string,
) {
  console.log("Upgrade Proxy with new implementation " + operatingChain.name);
  const signer = await getSigner(operatingChain);
  const { Tbrv3 } = await import("@xlabs-xyz/evm-arbitrary-token-transfers");

  const proxyAddress = new EvmAddress(getContractAddress("TbrV3Proxies", chainToChainId(operatingChain.name)));
  const tbr = Tbrv3.connectUnknown(
    wrapEthersProvider(signer.provider!),
    proxyAddress,
  );

  const tx = tbr.execTx(0n, [{
    command: "UpgradeContract",
    newImplementation: new EvmAddress(implementationAddress),
  }]);

  const { txid } = await sendTx(signer, {
    ...tx,
    data: encoding.hex.encode(tx.data, true),
  });

  console.log(`Tx Included!. TxHash: ${txid}`);

  const constructorArgs = [implementationAddress];
  const previousConstructorArgs = getDeploymentArgs("TbrV3Proxies", chainToChainId(operatingChain.name));
  if (previousConstructorArgs) {
    constructorArgs.push(...previousConstructorArgs.slice(1));
  }

  return { chainId: chainToChainId(operatingChain.name), address: proxyAddress, constructorArgs };
}


run().then(() => console.log("Done!"));
