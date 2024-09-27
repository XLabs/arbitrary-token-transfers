import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getDependencyAddress,
  writeDeployedContract
} from "../helpers";
import { EvmTbrV3Config } from "../config/config.types";
import { ethers } from "ethers";
import { encoding } from "@wormhole-foundation/sdk-base";
import { Tbr__factory, Proxy__factory } from "../ethers-contracts/index.js";
import { getSigner } from "../helpers/evm";


const processName = "tbr-v3";
const chains = evm.evmOperatingChains();

async function run() {
  console.log(`Start ${processName}!`);


  const results = await Promise.all(
    chains.map(async (chain) => {
      console.log(`Deploy starting for chain ${chain.chainId}...`);
      const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chain.chainId);
      const result = await deployTbrV3Relayer(chain, config);
      console.log(`Deploy finished for chain ${chain.chainId}...`);

      return result;
    })
  );

  for (const result of results) {
    if (result.error) {
      console.error(
        `Error deploying to chain ${result.chainId}: ${(result.error as any)?.stack ?? result.error}`
      );
    } else {
      console.log(`Successfully deployed to chain ${result.chainId}`);

      writeDeployedContract(result.chainId, "TbrV3", result.implementation?.address ?? "", result.implementation?.constructorArgs ?? []);
      writeDeployedContract(result.chainId, "TbrV3Proxies", result.proxy?.address ?? "", result.proxy?.constructorArgs ?? []);
    }
  }

}

async function deployTbrV3Relayer(chain: EvmChainInfo, config: EvmTbrV3Config) {
  let implementation, proxy;

  try {
    implementation = await deployRelayerImplementation(chain, config);
  } catch (error) {
    console.log(`Failed to deploy contract implementation for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  try {
    proxy = await deployProxy(
      chain,
      config,
      implementation.address
    );
  } catch (error) {
    console.log(`Failed to deploy proxy for chain ${chain.chainId}`);
    return { chainId: chain.chainId, error };
  }

  return {
    chainId: chain.chainId,
    implementation,
    proxy,
  };
}

async function deployRelayerImplementation(chain: EvmChainInfo, config: EvmTbrV3Config) {
  console.log("deployRelayerImplementation " + chain.chainId);
  const signer = await getSigner(chain);

  const factory = new Tbr__factory(signer);

  const permit2 = getDependencyAddress("permit2", chain);
  const tokenBridge = getDependencyAddress("tokenBridge", chain);
  const oracle = getDependencyAddress("oracle", chain);
  const initGasToken = getDependencyAddress("initGasToken", chain);

  const contract = await factory.deploy(permit2, tokenBridge, oracle, initGasToken, config.initGasErc20TokenizationIsExplicit);

  const tx = contract.deploymentTransaction();
  if (tx === null) {
    throw new Error("Implementation deployment transaction is missing")
  }
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Implementation deployment failed with status " + receipt?.status);
  }
  
  const address = await contract.getAddress();
  console.log("Successfully deployed implementation at " + address);
  return { address, chainId: chain.chainId, constructorArgs: [ permit2, tokenBridge, oracle, initGasToken, config.initGasErc20TokenizationIsExplicit ] };
}

async function deployProxy(
  chain: EvmChainInfo,
  config: EvmTbrV3Config,
  implementationAddress: string,
) {
  console.log("deployRelayerProxy " + chain.chainId);
  const signer = await getSigner(chain);
  const signerAddress = await signer.getAddress();
  const { Tbrv3 } = await import("@xlabs-xyz/evm-arbitrary-token-transfers");

  const proxyConstructorArgs = Tbrv3.proxyConstructor(
    config.owner || signerAddress,
    config.admin || signerAddress,
    config.feeRecipient || signerAddress,
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
    throw new Error("Proxy deployment transaction is missing")
  }
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Proxy deployment failed with status " + receipt?.status);
  }
  const address = await contract.getAddress();
  console.log("Successfully deployed proxy at " + address);
  return { address, chainId: chain.chainId, constructorArgs: [implementationAddress, encoding.hex.encode(proxyConstructorArgs, true)] };
}


run().then(() => console.log("Done!"));
