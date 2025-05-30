import {
  evm,
  EvmChainInfo,
  getChainConfig,
  writeDeployedContract
} from "../helpers/index.js";
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { EvmTbrV3Config } from "../config/config.types.js";
import { ethers } from "ethers";
import { encoding } from "@wormhole-foundation/sdk-base";
import { Proxy__factory } from "../ethers-contracts/index.js";
import { getSigner } from "../helpers/evm.js";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { deployRelayerImplementation } from "./deploy-implementation.js";


const processName = "tbr-v3";
const chains = evm.evmOperatingChains();

// Why not use runOnEVMs?

async function run() {
  console.log(`Start ${processName}!`);

  const results = await Promise.all(
    chains.map(async (chain) => {
      console.log(`Deploy starting for chain ${chain.name}...`);
      const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chainToChainId(chain.name));
      const result = await deployTbrV3Relayer(chain, config);
      console.log(`Deploy finished for chain ${chain.name}...`);

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
    console.log(`Failed to deploy contract implementation for chain ${chain.name}`);
    return { chainId: chainToChainId(chain.name), error };
  }

  try {
    proxy = await deployProxy(
      chain,
      config,
      implementation.address
    );
  } catch (error) {
    console.log(`Failed to deploy proxy for chain ${chain.name}`);
    return { chainId: chainToChainId(chain.name), error };
  }

  return {
    chainId: chainToChainId(chain.name),
    implementation,
    proxy,
  };
}

async function deployProxy(
  chain: EvmChainInfo,
  config: EvmTbrV3Config,
  implementationAddress: string,
) {
  console.log("deployRelayerProxy " + chain.name);
  const signer = await getSigner(chain);
  const signerAddress = new EvmAddress(await signer.getAddress());
  const { Tbrv3 } = await import("@xlabs-xyz/evm-arbitrary-token-transfers");
  const owner = config.owner !== undefined && config.owner !== "" ? new EvmAddress(config.owner) : signerAddress;
  const admin = config.admin !== undefined && config.admin !== "" ? new EvmAddress(config.admin) : signerAddress;
  const feeRecipient = config.feeRecipient !== undefined && config.feeRecipient !== "" ? new EvmAddress(config.feeRecipient) : signerAddress;

  const proxyConstructorArgs = Tbrv3.proxyConstructor(
    owner,
    // TODO: accept more admins in config
    [admin],
    feeRecipient,
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
  return { address, chainId: chainToChainId(chain.name), constructorArgs: [implementationAddress, encoding.hex.encode(proxyConstructorArgs, true)] };
}


run().then(() => console.log("Done!"));
