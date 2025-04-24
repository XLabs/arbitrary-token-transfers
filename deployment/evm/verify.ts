import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";
import {
  getContractAddress,
  loadVerificationApiKeys,
  evm,
  getChainConfig,
  getDependencyAddress
} from "../helpers/index.js";
import { EvmTbrV3Config } from "../config/config.types.js";
import { Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { chainToChainId, encoding } from "@wormhole-foundation/sdk-base";
import { ethers } from "ethers";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

evm.runOnEvms("bytecode-verification-token-router", async (operatingChain, signer, log) => {
  // The root path of the foundry project
  const rootPath = path.resolve('../evm/');

  const verifiers = loadVerificationApiKeys()[chainToChainId(operatingChain.name)];
  if (!verifiers) {
    log(chalk.red(`No verifiers found for chain ${operatingChain.name}`));
    return;
  }

  const zero = ethers.ZeroAddress;
  const ownerOverride = new EvmAddress(process.env[`OWNER_ADDRESS_${operatingChain.name.toUpperCase()}`] ?? zero);
  const implementationAddressOverride = process.env[`IMPLEMENTATION_ADDRESS_${operatingChain.name.toUpperCase()}`] ?? zero;

  for (let [verifier, data] of Object.entries(verifiers)) {
    const apiKey = typeof data === 'string' ? data : data.key;
    const verifierUrl = typeof data === 'string' ? undefined : data.apiUrl;
    const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chainToChainId(operatingChain.name));
    const permit2 = getDependencyAddress("permit2", operatingChain);
    const tokenBridge = getDependencyAddress("tokenBridge", operatingChain);
    const oracle = getDependencyAddress("oracle", operatingChain);
    const initGasToken = getDependencyAddress("initGasToken", operatingChain);

    // Implementation data
    const implementationName = "Tbr";
    const implementationPath = 'src/Tbr.sol';
    const implementationAddress = getContractAddress("TbrV3", chainToChainId(operatingChain.name));
    const implementationDeploymentArgs = [permit2, tokenBridge, oracle, initGasToken, config.initGasErc20TokenizationIsExplicit];
    const implementationConstructorSignature = "constructor(address,address,address,address,bool)";
    const verifyImplementationCommand = evm.getVerifyCommand({
      chain: operatingChain,
      contractName: implementationName, 
      contractPath: implementationPath,
      contractAddress: implementationAddress, 
      constructorSignature: implementationConstructorSignature, 
      constructorArgs: implementationDeploymentArgs, 
      verifier,
      verifierUrl,
      apiKey
    });
    console.log(`${operatingChain.name}(${implementationAddress}) implementation command: ${verifyImplementationCommand}`);

    // Proxy data
    const proxyName = "Proxy";
    const proxyPath = 'lib/wormhole-solidity-sdk/src/proxy/Proxy.sol';
    const proxyAddress = getContractAddress("TbrV3Proxies", chainToChainId(operatingChain.name));
    const owner = config.owner !== undefined ? new EvmAddress(config.owner) : ownerOverride;
    const admin = config.admin !== undefined ? new EvmAddress(config.admin) : ownerOverride;
    const feeRecipient = config.feeRecipient !== undefined ? new EvmAddress(config.feeRecipient) : ownerOverride;
    const proxyConstructorArgs = Tbrv3.proxyConstructor(
      owner,
      // TODO: accept more admins in the config
      [admin],
      feeRecipient,
    );
    // Implementation address might be different if upgrades have been executed
    const proxyImplementationAddress = implementationAddressOverride === zero ? implementationAddress : implementationAddressOverride;
    const proxyDeploymentArgs = [proxyImplementationAddress, encoding.hex.encode(proxyConstructorArgs, true)];
    const proxyConstructorSignature = "constructor(address,bytes)";
    const verifyProxyCommand = evm.getVerifyCommand({
      chain: operatingChain,
      contractName: proxyName,
      contractPath: proxyPath,
      contractAddress: proxyAddress,
      constructorSignature: proxyConstructorSignature,
      constructorArgs: proxyDeploymentArgs,
      verifier,
      verifierUrl,
      apiKey
    });
    console.log(`${operatingChain.name}(${proxyAddress}) proxy command: ${verifyProxyCommand}`);

    log(chalk.green(`Verifying bytecode on ${verifier}...`));

    log(chalk.green("Verifying implementation bytecode..."));
    execSync(verifyImplementationCommand, { stdio: "inherit", cwd: rootPath });
    console.log()

    log(chalk.green("Verifying proxy bytecode..."));
    execSync(verifyProxyCommand, { stdio: "inherit", cwd: rootPath });
    console.log()
  }
});