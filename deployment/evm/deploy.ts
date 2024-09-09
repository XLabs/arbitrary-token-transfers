import {
  ChainInfo,
  getOperatingChains,
  init,
  writeOutputFiles,
  getSigner,
  loadScriptConfig,
} from "../helpers/env.js";
import { ethers } from "ethers";
import { Tbr__factory, Proxy__factory } from "../ethers-contracts";
import { Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";

init();

const processName = "tbr-v3";
const chains = getOperatingChains();
const config = loadScriptConfig<DeployConfig>(processName);

type DeployConfig = {
  owner?: string;
  admin?: string;
};

async function run() {
  console.log(`Start ${processName}!`);
  const output: any = {
    Implementations: [],
    Proxies: [],
  };

  const results = await Promise.all(
    chains.map(async (chain) => {
      console.log(`Deploy starting for chain ${chain.chainId}...`);
      const result = await deployTbrV3Relayer(chain, config);
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
      output.Implementations.push(result.implementation);
      output.Proxies.push(result.proxy);
    }
  }

  writeOutputFiles(output, processName);
}

async function deployTbrV3Relayer(chain: ChainInfo, config: DeployConfig) {
  const signer = await getSigner(chain);

  let implementation, proxy;

  try {
    implementation = await deployRelayerImplementation(chain);

  } catch (error) {
    console.log(`Failed to deploy contract implementation for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  try {
    proxy = await deployProxy(
      chain,
      implementation.address
    );
  } catch (error) {
    console.log(`Failed to deploy contract implementation for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  return {
    chainId: chain.chainId,
    implementation,
    proxy,
  };
}

async function deployRelayerImplementation(chain: ChainInfo) {
  console.log("deployPriceOracleImplementation " + chain.chainId);
  const signer = await getSigner(chain);

  const contractInterface = Tbr__factory.createInterface();
  const bytecode = Tbr__factory.bytecode;

  const factory = new ethers.ContractFactory(
    contractInterface,
    bytecode,
    signer,
  );

  const contract = await factory.deploy(chain.chainId);
  const tx = contract.deploymentTransaction();
  if (tx === null) {
    throw new Error("Deployment transaction is missing")
  }
  const address = await contract.getAddress();
  console.log("Successfully deployed implementation at " + address);
  return { address, chainId: chain.chainId };
}

async function deployProxy(
  chain: ChainInfo,
  implementationAddress: string,
) {
  console.log("deployPriceOracleImplementation " + chain.chainId);
  const signer = await getSigner(chain);
  const signerAddress = await signer.getAddress();

  const proxyConstructorArgs = await Tbrv3.proxyConstructor(
    config.owner || signerAddress,
    config.admin || signerAddress,
  );

  const contractInterface = Proxy__factory.createInterface();
  const bytecode = Proxy__factory.bytecode;
  const factory = new ethers.ContractFactory(
    contractInterface,
    bytecode,
    signer,
  );

  const contract = await factory.deploy(
    implementationAddress,
    proxyConstructorArgs,
  );
  const tx = contract.deploymentTransaction();
  if (tx === null) {
    throw new Error("Deployment transaction is missing")
  }
  const address = await contract.getAddress();
  console.log("Successfully deployed proxy at " + address);
  return { address, chainId: chain.chainId };
}


run().then(() => console.log("Done!"));