import {
  evm,
  EvmChainInfo,
  getChainConfig,
  getContractAddress,
  getDependencyAddress,
  writeDeployedContract
} from "../helpers";
import { EvmTbrV3Config } from "../config/config.types";
import { ethers } from "ethers";
import { Tbr__factory } from "../ethers-contracts/index.js";
import { getSigner, getProvider, sendTx, wrapEthersProvider } from "../helpers/evm";
import { EvmAddress } from '@wormhole-foundation/sdk-evm';
import { chainIdToChain } from '@wormhole-foundation/sdk-base';


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

async function deployRelayerImplementation(chain: EvmChainInfo, config: EvmTbrV3Config) {
  console.log("Deploying Relayer Implementation " + chain.chainId);
  const signer = await getSigner(chain);

  const contractInterface = Tbr__factory.createInterface();
  const bytecode = Tbr__factory.bytecode;

  const factory = new ethers.ContractFactory(
    contractInterface,
    bytecode,
    signer,
  );

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

async function upgradeProxyWithNewImplementation(
  chain: EvmChainInfo,
  config: EvmTbrV3Config,
  implementationAddress: string,
) {
  console.log("Upgrade Proxy with new implementation " + chain.chainId);
  const signer = await getSigner(chain);
  // const signerAddress = await signer.getAddress();
  const { Tbrv3 } = await import("@xlabs-xyz/evm-arbitrary-token-transfers");

  const tbr = Tbrv3.connect(
    wrapEthersProvider(getProvider(chain)),
    chain.network,
    chainIdToChain(chain.chainId),
    new EvmAddress(getContractAddress("TbrV3Proxies", chain.chainId)),
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

  return { chainId: chain.chainId };
}


run().then(() => console.log("Done!"));
