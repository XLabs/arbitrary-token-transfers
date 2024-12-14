import { DevInspectResults, SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { ChainId, SuiAddress, SuiObjectId, SuiPackageId } from './types.js';
import { executeTransaction, inspectTransaction } from './execute.js';
import { deploySuiContract } from './deploy.js';
import { deployLocally } from './deployLocal.js';

export const CHAIN_ID_SUI = 21
export class TBRV3TransactionBlock {

  public readonly tx: Transaction

  constructor(
    readonly oracle: TBRV3,
    readonly sender: Ed25519Keypair,
    gasBudget: bigint = BigInt(50000000)
  ) {
    this.tx = new Transaction();
    this.tx.setSender(sender.getPublicKey().toSuiAddress());
    this.tx.setGasBudget(gasBudget);
  }

  async execute(dryrun = true, waitForTransaction = true): Promise<SuiTransactionBlockResponse> {
    return executeTransaction(this.oracle.client, this.tx, this.sender, dryrun, waitForTransaction);
  }

  async inspect(): Promise<DevInspectResults> {
    return inspectTransaction(this.oracle.client, this.tx);
  }

  async inspectReturnValues(): Promise<(bigint | undefined)[]> {
    const quotingResults = (await this.inspect()).results ?? []
    return quotingResults.map((result) => {
      if (result.returnValues) {
        return BigInt("0x" + Buffer.from(result.returnValues[0][0].reverse()).toString('hex'))
      }
      return undefined
    })
  }

  set_assistant(assistant: SuiAddress): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "set_assistant",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.address(assistant)]
    });
  }

  add_admin(admin: SuiAddress): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "add_admin",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.address(admin)]
    });
  }

  remove_admin(admin: SuiAddress): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "remove_admin",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.address(admin)]
    });
  }
}

export class TBRV3 {

  constructor(
    readonly client: SuiClient,
    readonly pkg: SuiPackageId,
    readonly state: SuiObjectId
  ) {}

  static async deploy(client: SuiClient, deployer: Ed25519Keypair): Promise<TBRV3> {
    const packages = await deployLocally(client, deployer)
    console.log("Deployed packages:")
    console.dir(packages, { depth: null })
    // FIXME: Properly retrieve the state after initialization
    return new TBRV3(client, packages.relayer.packageId, "")
  }

  public createTransactionBlock(sender: Ed25519Keypair, gasBudget = BigInt(50000000)): TBRV3TransactionBlock {
    return new TBRV3TransactionBlock(this, sender, gasBudget);
  }
}
