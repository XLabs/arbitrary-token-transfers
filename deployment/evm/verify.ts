import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";
import { getContractAddress, verificationApiKeys, evm, getChainConfig, getDependencyAddress } from "../helpers";
import { EvmTbrV3Config } from "../config/config.types";
import { Tbrv3 } from "@xlabs-xyz/evm-arbitrary-token-transfers";
import { encoding } from "@wormhole-foundation/sdk-base";
import { ethers } from "ethers";

evm.runOnEvms("bytecode-verification-token-router", async (chain, signer, log) => {
  // The root path of the foundry project
  const rootPath = path.resolve('../evm/');

  const verifiers = verificationApiKeys[chain.chainId];
  if (!verifiers) {
    log(chalk.red(`No verifiers found for chain ${chain.chainId}`));
    return;
  }

  const zero = ethers.ZeroAddress;
  const ownerOverride = process.env[`OWNER_ADDRESS_${chain.name.toUpperCase()}`] ?? zero;
  const implementationAddressOverride = process.env[`IMPLEMENTATION_ADDRESS_${chain.name.toUpperCase()}`] ?? zero;

  for (let [verifier, data] of Object.entries(verifiers)) {
    const apiKey = typeof data === 'string' ? data : data.key;
    const verifierUrl = typeof data === 'string' ? undefined : data.apiUrl;
    const config = await getChainConfig<EvmTbrV3Config>("tbr-v3", chain.chainId);
    const permit2 = await getDependencyAddress("permit2", chain);
    const tokenBridge = await getDependencyAddress("tokenBridge", chain);
    const oracle = await getDependencyAddress("oracle", chain);
    const initGasToken = await getDependencyAddress("initGasToken", chain);

    // Implementation data
    const implementationName = "Tbr";
    const implementationPath = 'src/Tbr.sol';
    const implementationAddress = getContractAddress("TbrV3", chain.chainId);
    const implementationDeploymentArgs = [permit2, tokenBridge, oracle, initGasToken, config.initGasErc20TokenizationIsExplicit];
    const implementationConstructorSignature = "constructor(address,address,address,address,bool)";
    const verifyImplementationCommand = evm.getVerifyCommand({
      chain,
      contractName: implementationName, 
      contractPath: implementationPath,
      contractAddress: implementationAddress, 
      constructorSignature: implementationConstructorSignature, 
      constructorArgs: implementationDeploymentArgs, 
      verifier,
      verifierUrl,
      apiKey
    });
    console.log(`${chain.name}(${implementationAddress}) implementation command: ${verifyImplementationCommand}`);

    // Proxy data
    const proxyName = "Proxy";
    const proxyPath = 'lib/wormhole-solidity-sdk/src/proxy/Proxy.sol';
    const proxyAddress = getContractAddress("TbrV3Proxies", chain.chainId);
    const proxyConstructorArgs = Tbrv3.proxyConstructor(
      config.owner || ownerOverride,
      config.admin || ownerOverride,
      config.feeRecipient || ownerOverride,
    );
    // Implementation address might be different if upgrades have been executed
    const proxyImplementationAddress = implementationAddressOverride === zero ? implementationAddress : implementationAddressOverride;
    const proxyDeploymentArgs = [proxyImplementationAddress, encoding.hex.encode(proxyConstructorArgs, true)];
    const proxyConstructorSignature = "constructor(address,bytes)";
    const verifyProxyCommand = evm.getVerifyCommand({
      chain,
      contractName: proxyName,
      contractPath: proxyPath,
      contractAddress: proxyAddress,
      constructorSignature: proxyConstructorSignature,
      constructorArgs: proxyDeploymentArgs,
      verifier,
      verifierUrl,
      apiKey
    });
    console.log(`${chain.name}(${proxyAddress}) proxy command: ${verifyProxyCommand}`);

    log(chalk.green(`Verifying bytecode on ${verifier}...`));

    log(chalk.green("Verifying implementation bytecode..."));
    execSync(verifyImplementationCommand, { stdio: "inherit", cwd: rootPath });
    console.log()

    log(chalk.green("Verifying proxy bytecode..."));
    execSync(verifyProxyCommand, { stdio: "inherit", cwd: rootPath });
    console.log()
  }
});