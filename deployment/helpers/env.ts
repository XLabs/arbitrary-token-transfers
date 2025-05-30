import fs from "fs";
import { ethers } from "ethers";
import { validateSolAddress } from "./solana.js";
import {
  ChainConfig,
  ChainInfo,
  ContractsJson,
  Dependencies,
  DependenciesConfig,
  Ecosystem,
  VerificationApiKeys,
  UncheckedConstructorArgs,
  SolanaTbrInitParams,
} from "./interfaces.js";
// TODO: support different env files
import 'dotenv/config';
import { Chain, ChainId, chainToChainId, contracts as connectDependencies } from "@wormhole-foundation/sdk-base";
import { inspect } from "util";

export const env = getEnv("ENV");
export const network = env === "mainnet" ? "Mainnet" : "Testnet";
export const contracts = loadContracts();
export const dependencies = loadDependencies();
export const ecosystemChains = loadEcosystem();

function loadJson<T>(filename: string): T {
  const fileContent = fs.readFileSync(
    `./config/${env}/${filename}.json`
  );
  
  return JSON.parse(fileContent.toString()) as T;
}

function loadDependencies(): DependenciesConfig[] {
  return loadJson<DependenciesConfig[]>("dependencies");
}

function loadContracts<T extends ContractsJson>() {
  return loadJson<T>("contracts");
}

function loadEcosystem(): Ecosystem {
  return loadJson<Ecosystem>("ecosystem");
}

export function loadSolanaTbrInitParams(): SolanaTbrInitParams {
  return loadJson<SolanaTbrInitParams>("solana-tbr-init");
}

export function loadVerificationApiKeys() {
  return loadJson<VerificationApiKeys[]>("verification-api-keys");
}

export function getEnvOrDefault(env: string, defaultValue: string): string {
  try{
    return getEnv(env);
  }catch(e){
    return defaultValue;
  }
}

export function getEnv(env: string): string {
  const v = process.env[env];
  if (!v) {
    throw Error(`Env var not set: ${env}`);
  }
  return v;
}

/**
 * Reads env vars and returns the first one that is defined and non empty.
 */
export function resolveEnv(envNames: string[]): string {
  for (const env of envNames) {
    const v = process.env[env];
    if (v) return v;
  }
  throw Error(`At least one of these env vars needs to be set: ${inspect(envNames)}`);
}

export async function getChainConfig<T extends ChainConfig>(filename: string, whChainId: ChainId): Promise<T> {
  const scriptConfig: T[] = await loadJson(filename);

  const chainConfig = scriptConfig.find((x) => x.chainId == whChainId);

  if (!chainConfig) {
    throw Error(`Failed to find ${filename} config for chain ${whChainId}`);
  }

  return chainConfig;
}

export function getContractAddress(contractName: string, whChainId: ChainId): string {
  const contract = contracts[contractName]?.find((c) => c.chainId === whChainId)?.address;

  if (!contract) {
    throw new Error(`No ${contractName} contract found for chain ${whChainId}`);
  }


  if (!ethers.isAddress(contract) && !validateSolAddress(contract)){
    throw new Error(`Invalid address for ${contractName} contract found for chain ${whChainId}`);
  }

  return contract;
}

export function getLocalDependencyAddress(dependencyName: keyof Dependencies, chain: ChainInfo): string {
  const chainDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));

  if (chainDependencies === undefined ) {
    throw new Error(`No dependencies found for chain ${chain.name}`);
  }

  const dependency = chainDependencies[dependencyName as keyof Dependencies] as string;
  if (dependency === undefined) {
    throw new Error(`No dependency found for ${dependencyName} for chain ${chain.name}`);
  }

  
  if (!ethers.isAddress(dependency) && !validateSolAddress(dependency)){
    throw new Error(`Invalid address for ${dependencyName} dependency found for chain ${chain.name}`);
  }

  return dependency;
}

export function getDependencyAddress(dependencyName: keyof Dependencies, chain: ChainInfo): string {
  const {
    coreBridge,
    tokenBridge,
  } = connectDependencies;

  const dependencies = {
    wormhole: coreBridge.get(chain.network, chain.name),
    tokenBridge: tokenBridge.get(chain.network, chain.name),
  } as Dependencies;
  const connectDependency = dependencies[dependencyName as keyof Dependencies];
  
  try {
    const localDependency = getLocalDependencyAddress(dependencyName, chain);
    return localDependency === connectDependency ? connectDependency : localDependency;
  } catch (e) {
    if (connectDependency === undefined) {
      throw new Error(`No dependency found for ${dependencyName} for chain ${chain.name} on connect sdk`);
    }

    return connectDependency;
  }
}

export function getDeploymentArgs(contractName: string, whChainId: ChainId): UncheckedConstructorArgs | undefined {
  const constructorArgs = contracts[contractName]?.find((c) => c.chainId === whChainId)?.constructorArgs;

  return constructorArgs;
}

/**
 * @param currentOperatingChain: the chain that the script is running on
 * @returns peers: evm proxies and solana program
 */
export function loadTbrPeers(currentOperatingChain: ChainInfo) {
  return contracts["TbrV3Proxies"].filter((tbr) => tbr.chainId !== chainToChainId(currentOperatingChain.name));
}

export function loadTbrPeer(chain: Chain) {
  return contracts["TbrV3Proxies"].find((tbr) => tbr.chainId === chainToChainId(chain));
}

export function writeDeployedContract(whChainId: ChainId, contractName: string, address: string, constructorArgs: UncheckedConstructorArgs) {
  const contracts = loadContracts();
  if (!contracts[contractName]) {
    contracts[contractName] = [{ chainId: whChainId, address, constructorArgs }];
  }

  else if (!contracts[contractName].find((c) => c.chainId === whChainId)) {
    contracts[contractName].push({ chainId: whChainId, address, constructorArgs });
  }

  else {
    contracts[contractName] = contracts[contractName].map((c) => {
      if (c.chainId === whChainId) {
        return { chainId: whChainId, address, constructorArgs };
      }

      return c;
    });
  }
  
  fs.writeFileSync(
    `./config/${env}/contracts.json`,
    JSON.stringify(contracts, null, 2),
    { flag: "w" }
  );
}