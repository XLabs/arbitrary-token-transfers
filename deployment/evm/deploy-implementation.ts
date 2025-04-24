import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { EvmTbrV3Config } from "../config/config.types.js";
import { Tbr__factory } from "../ethers-contracts/index.js";
import { EvmChainInfo, getDependencyAddress } from "../helpers/index.js";
import { getSigner } from "../helpers/evm.js";

export async function deployRelayerImplementation(chain: EvmChainInfo, config: EvmTbrV3Config) {
  console.log("Deploying Relayer Implementation " + chainToChainId(chain.name));
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
  return { address, chainId: chainToChainId(chain.name), constructorArgs: [ permit2, tokenBridge, oracle, initGasToken, config.initGasErc20TokenizationIsExplicit ] };
}