import fs from "fs";
import { ChainId } from "@wormhole-foundation/sdk-base";
import { ethers } from "ethers";


const DEFAULT_ENV = "testnet";
const loadedConfigs: Record<string, any> = {};

let environment = "";

export type ChainInfo = {
  evmNetworkId: number;
  chainId: ChainId;
  rpc: string;
  wormholeAddress: string;
  tokenBridgeAddress: string;
};

export function init(): string {
  let env = process.env.ENV;
  if (!env) {
    console.log(
      "No environment was specified, using default environment files"
    );
    environment = DEFAULT_ENV;
  } else {
    environment = env;
  }

  return environment;
}

export function loadScriptConfig<T>(processName: string): T {
  if (!loadedConfigs[processName]) {
    const config = loadJsonFile(`${processName}.json`);
    if (!config) {
      throw Error("Failed to pull config file!");
    }
    loadedConfigs[processName] = config;
  }

  return loadedConfigs[processName];
}

export function loadChains(): ChainInfo[] {
  const chains = loadJsonFile("chains.json");
  if (!chains.chains) {
    throw Error("Failed to pull chain config file!");
  }
  return chains.chains;
}

export function getOperatingChains(): ChainInfo[] {
  const allChains = loadChains();
  let operatingChains: number[] | null = null;

  const chains = loadJsonFile("chains.json");
  if (chains.operatingChains) {
    operatingChains = chains.operatingChains;
  }
  if (!operatingChains) {
    return allChains;
  }

  const output: ChainInfo[] = [];
  operatingChains.forEach((x: number) => {
    const item = allChains.find((y) => {
      return x == y.chainId;
    });
    if (item) {
      output.push(item);
    }
  });

  return output;
}

export function loadPrivateKey(): string {
  const privateKey = process.env.WALLET_KEY;
  if (!privateKey) {
    throw Error("Failed to find private key for this process!");
  }
  return privateKey;
}

export async function getSigner(chain: ChainInfo, provider?: ethers.Provider): Promise<ethers.Signer> {
  if (provider === undefined) {
    provider = getProvider(chain);
  }
  const privateKey = loadPrivateKey();

  if (privateKey === "ledger") {
    if (process.env.LEDGER_BIP32_PATH === undefined) {
      throw new Error(`Missing BIP32 derivation path. With ledger devices the path needs to be specified in env var 'LEDGER_BIP32_PATH'.`);
    }
    const { LedgerSigner } = await import("@xlabs-xyz/ledger-signer-ethers-v6");
    const signer = await LedgerSigner.create(provider as any, process.env.LEDGER_BIP32_PATH);
    const signerAddress = await signer.getAddress();
    console.log(`Using Ledger signer with address: ${signerAddress}`);
    return signer;
  }

  const signer = new ethers.Wallet(privateKey, provider);
  return signer;
}

export function getProvider(
  chain: ChainInfo
): ethers.JsonRpcProvider {
  const providerRpc =
    loadChains().find((x: any) => x.chainId == chain.chainId)?.rpc || "";

  if (!providerRpc) {
    throw new Error("Failed to find a provider RPC for chain " + chain.chainId);
  }

  console.log("Using provider RPC: " + providerRpc);
  const provider = new ethers.JsonRpcProvider(
    providerRpc,
    undefined,
    { staticNetwork: true }
  );

  return provider;
}

export function writeOutputFiles(output: any, processName: string) {
  fs.mkdirSync(`./evm/output/${environment}/${processName}`, {
    recursive: true,
  });
  fs.writeFileSync(
    `./evm/output/${environment}/${processName}/lastrun.json`,
    JSON.stringify(output),
    { flag: "w" }
  );
  fs.writeFileSync(
    `./evm/output/${environment}/${processName}/${Date.now()}.json`,
    JSON.stringify(output),
    { flag: "w" }
  );
}

/**
 * Private section
 */
function loadJsonFile(fileName: string) {
  if (!environment) {
    console.error("Environment not initialized!, please set ENV environment variable and call init()");
    process.exit(1);
  }

  const configFile = fs.readFileSync(`./config/${environment}/${fileName}`);

  return JSON.parse(configFile.toString());
}