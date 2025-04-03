import {
  Transaction,
  TransactionInstruction,
  Keypair,
  PublicKey,
  Connection,
  Commitment,
  RecentPrioritizationFees,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { SolanaLedgerSigner } from "@xlabs-xyz/ledger-signer-solana";
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { ecosystemChains, getEnv, resolveEnv } from "./env.js";
import type { SolanaScriptCb, SolanaChainInfo } from "./interfaces.js";
import { inspect } from "util";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet.js";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";


// Ensure SolanaAddress is registered
import "@wormhole-foundation/sdk-solana";

export const DEFAULT_COMPUTE_BUDGET_MICROLAMPORTS = 100000;
export type PriorityFeePolicy = 'max' | 'high' | 'normal' | 'low';

export interface ChainConfigEntry {
  chainId: number;
  maxGasDropoffMicroToken: number;
  relayerFeeMicroUsd: number;
  pausedOutboundTransfers: boolean;
  canonicalPeer: UniversalAddress;
};

export const connectionCommitmentLevel = (process.env.SOLANA_COMMITMENT || "confirmed") as Commitment;
export const priorityMicrolamports = process.env.PRIORITY_MICROLAMPORTS !== "undefined" ? Number(process.env.PRIORITY_MICROLAMPORTS) : 1;

export function validateSolAddress(address: string){
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey.toBuffer());
    } catch (error) {
      return false;
    }
}

export function solanaOperatingChains() {
  const { operatingChains } = ecosystemChains;
  if (Array.isArray(operatingChains) && operatingChains.length >= 1) {
    return ecosystemChains.solana.networks.filter((x) => {
      return operatingChains.includes(chainToChainId(x.name));
    });
  }
  return ecosystemChains.solana.networks;
};

export async function runOnSolana(scriptName: string, cb: SolanaScriptCb) {
  const chains = solanaOperatingChains() as SolanaChainInfo[];

  if (chains.length === 0) {
    console.log("No operating chains entries found");
    return;
  }

  console.log(`Running script on Solana:`, scriptName);

  const result = chains.map(async chain => {
    const log = (...args: any[]) => console.log(`[${chainToChainId(chain.name)}]`, ...args);
    const signer = await getSigner();
    // TODO: encode in base58
    const signerPubkey = new PublicKey(await signer.getAddress()).toBase58();
    log(`Starting script. Signer: ${signerPubkey}`);

    try {
      await cb(chain, signer, log);
      log("Success");
    } catch (error) {
      log("Error: ", (error as any)?.stack || inspect(error, {depth: 5}));
    }
  });

  await Promise.all(result);
}

export interface SolanaSigner {
  getAddress(): Promise<Buffer>;
  signTransaction(transaction: Transaction): Promise<Buffer>;
  raw(): NodeWallet | SolanaLedgerSigner;
  type: "ledger" | "wallet";
}

let signer: SolanaSigner | null;
export async function getSigner(): Promise<SolanaSigner> {
  const privateKey = resolveEnv(["SOLANA_WALLET_KEY", "WALLET_KEY"]);

  if (privateKey !== "ledger") {
    if (!signer) {
      console.log("Creating wallet signer");
      const pk = Uint8Array.from(JSON.parse(privateKey));
      const keypair = Keypair.fromSecretKey(pk);
      const wallet = new NodeWallet(keypair);

      signer = {
        getAddress: () => Promise.resolve(wallet.publicKey.toBuffer()),
        raw: () => wallet,
        signTransaction: async (transaction) => (await wallet.signTransaction(transaction)).compileMessage().serialize(),
        type: "wallet"
      } 
    }
  } else {
    if (!signer) {
      console.log("Creating ledger signer");
      const derivationPath = getEnv("SOLANA_LEDGER_BIP32_PATH");
      const ledgerSigner = await SolanaLedgerSigner.create(derivationPath);
      signer = {
        getAddress: () => ledgerSigner.getAddress(),
        raw: () => ledgerSigner,
        signTransaction: (transaction) => ledgerSigner.signTransaction(transaction.compileMessage().serialize()),
        type: "ledger"
      }
    }
  }

  return signer;  
}

let connection: Connection;
export function getConnection(chain: SolanaChainInfo) {
  if (!connection) {
    connection = new Connection(chain.rpc, connectionCommitmentLevel);
  }
  return connection;
}

export type PriorityFeeConfiguration = {
  lockedWritableAccounts: PublicKey[]
  priorityFeePolicy: PriorityFeePolicy
  defaultFee?: number
}

export async function ledgerSignAndSend(connection: Connection, 
  instructions: TransactionInstruction[], 
  signers: Keypair[],
  priorityFeeConfig?: PriorityFeeConfiguration
) {
  const deployerSigner = await getSigner();

  const deployerPk = new PublicKey(await deployerSigner.getAddress());

  const tx = new Transaction();

  tx.add(...instructions);

  if (priorityFeeConfig) {
    const priorityFee = await getPrioritizationFee(connection, 
      priorityFeeConfig.lockedWritableAccounts, 
      priorityFeeConfig.priorityFeePolicy, 
      priorityFeeConfig.defaultFee);
    console.log(`Using priority fee policy: ${priorityFeeConfig.priorityFeePolicy}, selected fee: ${priorityFee} microLamports`);
    const addPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: priorityFee
    });
    tx.add(addPriorityFeeIx);
  }

  tx.feePayer = deployerPk;

  signers.forEach((signer) => tx.partialSign(signer));

  const signedTx = await addSignature(tx, deployerSigner, deployerPk);

  const txid = await connection.sendRawTransaction(signedTx.serialize());
  console.log(`Transaction signature: ${txid}, waiting for confirmation...`);
  
  const recentBlockHash = await connection.getLatestBlockhash();
  tx.recentBlockhash = recentBlockHash.blockhash;
  const txStatus = await connection.confirmTransaction({
    signature: txid,
    ...recentBlockHash
  });
  if (txStatus.value.err) {
    throw new Error(`Transaction failed: ${txStatus.value.err}`);
  }
  return txid;
}

async function addSignature(tx: Transaction, signer: SolanaSigner, signerPk: PublicKey):Promise<Transaction> {
  if (signer.type === "ledger"){
    const signedByPayer = await signer.signTransaction(tx);
    tx.addSignature(signerPk, signedByPayer);
    return tx;
  } else {
    return await (signer.raw() as NodeWallet).signTransaction(tx);
  }
}


/**
 * Get the prioritization fee in microlamports from the network using a given policy.
 * If no prioritization fee is found, return the default fee.
 * 
 * @param connection - The connection to the network.
 * @param lockedWritableAccounts - The locked writable accounts.
 * @param priorityFeePolicy - The policy to use to get the prioritization fee.
 * @param defaultFee - The default fee to return if no prioritization fee is found.
 * @returns The prioritization fee.
 */
export async function getPrioritizationFee(connection: Connection, 
  lockedWritableAccounts: PublicKey[], 
  priorityFeePolicy: PriorityFeePolicy, 
  defaultFee: number = DEFAULT_COMPUTE_BUDGET_MICROLAMPORTS): Promise<number> {

  const sortedPrioritizationFeeList = await getSortedPrioritizationFeeList(connection, lockedWritableAccounts);
  if (sortedPrioritizationFeeList.length === 0) {
    return defaultFee;
  }

  return getPrioritizationFeeFromList(sortedPrioritizationFeeList, priorityFeePolicy);
}

/**
 * Get the sorted prioritization fee list, in ascending order.
 * @param connection - The connection to the network.
 * @param lockedWritableAccounts - The locked writable accounts.
 * @returns The sorted prioritization fee list.
 */
export async function getSortedPrioritizationFeeList(connection: Connection, lockedWritableAccounts: PublicKey[]): Promise<RecentPrioritizationFees[]> {
  const prioritizationFeeConfig = {
    lockedWritableAccounts: lockedWritableAccounts,
  }

  const prioritizationFeeList = await connection.getRecentPrioritizationFees(prioritizationFeeConfig);
  const nonZeroPrioritizationFeeList = prioritizationFeeList.filter((entry) => entry.prioritizationFee > 0);
  return nonZeroPrioritizationFeeList.sort((a, b) => a.prioritizationFee - b.prioritizationFee);
}


/**
 * Get the prioritization fee from a sorted list of prioritization fees and a given policy.
 * @param sortedPrioritizationFeeList - The sorted prioritization fee list, in ascending order.
 * @param priorityFeePolicy - The policy to use to get the prioritization fee.
 * @returns The prioritization fee.
 */
export function getPrioritizationFeeFromList(sortedPrioritizationFeeList: RecentPrioritizationFees[], priorityFeePolicy: PriorityFeePolicy): number {
  if (sortedPrioritizationFeeList.length === 0) {
    throw new Error("Prioritization fee list is empty");
  }

  switch (priorityFeePolicy) {
    case 'max':
      return sortedPrioritizationFeeList[sortedPrioritizationFeeList.length - 1].prioritizationFee;
    case 'high':
      return sortedPrioritizationFeeList[Math.floor(sortedPrioritizationFeeList.length * 0.95)].prioritizationFee;
    case 'normal':
      return sortedPrioritizationFeeList[Math.floor(sortedPrioritizationFeeList.length * 0.87)].prioritizationFee;
    case 'low':
      return sortedPrioritizationFeeList[Math.floor(sortedPrioritizationFeeList.length * 0.5)].prioritizationFee;
    default:
      throw new Error(`Invalid priorityFeePolicy: ${priorityFeePolicy} must be one of: max, high, normal, low`);
  }
}
