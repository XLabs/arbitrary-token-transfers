import { ethers } from "ethers";
import { ChainInfo, ecosystemChains, EvmScriptCb, getEnv, EvmChainInfo, UncheckedConstructorArgs } from "./index.js";
import { toChain } from "@wormhole-foundation/sdk-base";
import { PartialTx } from "@xlabs-xyz/evm-arbitrary-token-transfers";

// Ensures EvmAddress is registered
import "@wormhole-foundation/sdk-evm";

export async function runOnEvms(scriptName: string, cb: EvmScriptCb) {
  const chains = evmOperatingChains() as EvmChainInfo[];

  console.log(`Running script on EVMs (${chains.map(c => c.chainId).join(", ")}):`, scriptName);

  const result = chains.map(async chain => {
    const log = (...args: any[]) => console.log(`[${chain.chainId}]`, ...args);
    const signer = await getSigner(chain);
    log(`Starting script. Signer: ${await signer.getAddress()}. Chain: ${toChain(chain.chainId)}`);

    try {
      await cb(chain, signer, log);
      log("Success");
    } catch (error) {
      log("Error: ", (error as any)?.stack || error);
    }
    console.log();
  });

  await Promise.all(result);
}

export async function runOnEvmsSequentially(scriptName: string, cb: EvmScriptCb) {
  const chains = evmOperatingChains();

  console.log(`Running script on EVMs (${chains.map(c => c.chainId).join(", ")}):`, scriptName);

  for (const chain of chains) {
    const log = (...args: any[]) => console.log(`[${chain.chainId}]`, ...args);
    const signer = await getSigner(chain);
    log(`Starting script. Signer: ${await signer.getAddress()}`);

    try {
      await cb(chain, signer, log);
      log("Success");
    } catch (error) {
      log("Error: ", (error as any)?.stack || error);
    }
    console.log();
  }
}

export function evmOperatingChains(): EvmChainInfo[] {
  const { operatingChains } = ecosystemChains;
  if (Array.isArray(operatingChains) && operatingChains.length >= 1) {
    return ecosystemChains.evm.networks.filter((x) => {
      return operatingChains.includes(x.chainId);
    });
  }
  return ecosystemChains.evm.networks;
};

export async function getSigner(chain: ChainInfo): Promise<ethers.Signer> {
  const privateKey = getEnv("WALLET_KEY");
  if (privateKey == "ledger") {
    const { LedgerSigner } = await import("@xlabs-xyz/ledger-signer-ethers-v6");

    const derivationPath = getEnv("EVM_LEDGER_BIP32_PATH");
    const provider = getProvider(chain);
    return LedgerSigner.create(provider as any, derivationPath) as any;
  }

  const provider = getProvider(chain);
  return new ethers.Wallet(privateKey, provider);
}

export function getProvider(
  chain: ChainInfo
): ethers.Provider {
  const providerRpc = ecosystemChains.evm.networks.find((x: any) => x.chainId == chain.chainId)?.rpc || "";

  if (!providerRpc) {
    throw new Error("Failed to find a provider RPC for chain " + chain.chainId);
  }

  let provider = new ethers.JsonRpcProvider(
    providerRpc,
    undefined,
    {staticNetwork: true},
  );

  return provider;
}

export function wrapEthersProvider(ethersProvider: ethers.Provider) {
  return { ethCall: async ({to, data}: Omit<PartialTx, "value">): Promise<Uint8Array> => {
    const result = await ethersProvider.call({
      to,
      data: ethers.hexlify(data),
    });
    return ethers.getBytes(result);
  }};
}

export async function sendTxCatch(
  signer: ethers.Signer,
  tx: ethers.TransactionRequest
): Promise<{
  error?: unknown | Error;
  receipt: null | ethers.TransactionReceipt;
  txid?: string;
}> {
  let receipt;
  let txid;
  try {
    const sentTx = await signer.sendTransaction(tx);
    txid = sentTx.hash;
    receipt = await sentTx.wait();
  } catch (error) {
    // console.error("Error sending transaction", error);
    return { receipt: null, txid, error }
  }

  if (receipt === null) {
    // This shouldn't happen normally
    return { receipt, txid, error: new Error(`Transaction receipt for txid ${txid} is missing.`) };
  }

  return {
    receipt,
    txid,
    ...(receipt.status !== 1
      ? {error: new Error(`Transaction execution failed. Txid: ${txid}`)}
      : {})
  };
}


export async function sendTx(
  signer: ethers.Signer,
  tx: ethers.TransactionRequest
): Promise<{
  receipt: ethers.TransactionReceipt;
  txid: string;
}> {
  const result = await sendTxCatch(signer, tx);

  if (result.error !== undefined) {
    throw result.error;
  }

  return {
    receipt: result.receipt!,
    txid: result.txid!,
  };
}

export function getVerifyCommand({
  chain,
  contractName,
  contractPath,
  contractAddress,
  constructorSignature,
  constructorArgs,
  verifier,
  verifierUrl,
  apiKey
}: {  
  chain: EvmChainInfo,
  contractName: string,
  contractPath: string,
  contractAddress: string,
  constructorSignature: string,
  constructorArgs: UncheckedConstructorArgs,
  verifier: string,
  verifierUrl?: string,
  apiKey?: string
}): string {
  if (chain.externalId === undefined)
    throw new Error(`Chain ${chain.chainId} does not have an external ID`);

  if (verifier === "blockscout" && verifierUrl === undefined)
    throw new Error(`Verifier URL is required for Blockscout verifier`);

  let command = `
    forge verify-contract ${contractAddress} ${contractPath}:${contractName} \
    --verifier ${verifier} \
    ${ verifier === "blockscout" ? `--verifier-url ${verifierUrl}` : ''} \
    --watch --constructor-args $(cast abi-encode "${constructorSignature}" "${constructorArgs.join('" "')}") \
    --chain-id ${chain.externalId} \
    ${ apiKey === undefined || apiKey === "" ? '' : `--etherscan-api-key ${apiKey}` }
  `;

  return command;
}