import {
  Transaction,
  TransactionInstruction,
  Keypair,
  PublicKey,
  Connection,
  Commitment,
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
      // @ts-expect-error TODO: Update @coral-xyz/anchor to fix this type issue
      const wallet = new NodeWallet(keypair);

      signer = {
        getAddress: () => Promise.resolve(wallet.publicKey.toBuffer()),
        raw: () => wallet,
        // @ts-expect-error TODO: Update @coral-xyz/anchor to fix this type issue
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

export async function ledgerSignAndSend(connection: Connection, instructions: TransactionInstruction[], signers: Keypair[]) {
  const deployerSigner = await getSigner();

  const deployerPk = new PublicKey(await deployerSigner.getAddress());

  const tx = new Transaction();

  tx.add(...instructions);

  const recentBlockHash = await connection.getLatestBlockhash();

  tx.recentBlockhash = recentBlockHash.blockhash;
  tx.feePayer = deployerPk;

  signers.forEach((signer) => tx.partialSign(signer));

  const signedTx = await addSignature(tx, deployerSigner, deployerPk);

  return connection.sendRawTransaction(signedTx.serialize());
}

async function addSignature(tx: Transaction, signer: SolanaSigner, signerPk: PublicKey):Promise<Transaction> {
  if (signer.type === "ledger"){
    const signedByPayer = await signer.signTransaction(tx);
    tx.addSignature(signerPk, signedByPayer);
    return tx;
  } else {
    // @ts-expect-error TODO: Update @coral-xyz/anchor to fix this type issue
    return await (signer.raw() as NodeWallet).signTransaction(tx);
  }
}
