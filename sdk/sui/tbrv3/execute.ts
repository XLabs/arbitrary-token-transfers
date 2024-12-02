import { DevInspectResults, SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from '@mysten/sui/transactions';

export async function executeTransaction(
  client: SuiClient,
  transaction: Transaction,
  signer: Ed25519Keypair,
  dryrun = true,
  waitForTransaction = true
): Promise<SuiTransactionBlockResponse> {
  const txBytes = await transaction.build({ client })
  const signature = (await signer.signTransaction(txBytes)).signature
  if (dryrun) {
    const simulationResult = await client.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (simulationResult.effects.status.status !== "success") {
      throw new Error("Simulation failed: " + simulationResult.effects.status.error);
    }
  }
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: {
      showEffects: true,
    }
  });
  if (waitForTransaction) {
    await client.waitForTransaction({ digest: result.digest })
  }
  return result
}

export async function inspectTransaction(
  client: SuiClient,
  transaction: Transaction
): Promise<DevInspectResults> {
  const sender = transaction.getData().sender
  if (!sender) {
    throw new Error("Transaction sender is not set")
  }
  return client.devInspectTransactionBlock({ sender, transactionBlock: transaction })
}