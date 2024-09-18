import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";
import { getContractAddress, getDeploymentArgs, verificationApiKeys, evm } from "../helpers";

evm.runOnEvms("bytecode-verification-token-router", async (chain, signer, log) => {
  // The root path of the foundry project
  const rootPath = path.resolve('../evm/');

  const verifiers = verificationApiKeys[chain.chainId];
  if (!verifiers) {
    log(chalk.red(`No verifiers found for chain ${chain.chainId}`));
    return;
  }

  for (let [verifier, data] of Object.entries(verifiers)) {
    const apiKey = typeof data === 'string' ? data : data.key;
    const verifierUrl = typeof data === 'string' ? undefined : data.apiUrl;

    // Implementation data
    const implementationName = "Tbr";
    const implementationPath = 'src/Tbr.sol';
    const implementationAddress = getContractAddress("TbrV3", chain.chainId);
    const implementationDeploymentArgs = getDeploymentArgs("TbrV3", chain.chainId);
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

    // Proxy data
    const proxyName = "ProxyBase";
    const proxyPath = 'lib/wormhole-sdk/proxy/ProxyBase.sol';
    const proxyAddress = getContractAddress("TbrV3Proxies", chain.chainId);
    const proxyDeploymentArgs = getDeploymentArgs("TbrV3Proxies", chain.chainId);
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

    log(chalk.green(`Verifying bytecode on ${verifier}...`));
    log(chalk.green("Verifying implementation bytecode..."));
    execSync(verifyImplementationCommand, { stdio: "inherit", cwd: rootPath });
    console.log()

    log(chalk.green("Verifying proxy bytecode..."));
    execSync(verifyProxyCommand, { stdio: "inherit", cwd: rootPath });
    console.log()
  }
});