import { DevInspectResults, SuiClient, SuiTransaction, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, TransactionArgument, TransactionResult } from '@mysten/sui/transactions';
import path from 'path';
import { promises as fs } from "fs";
import { ChainId, SuiAddress, SuiObjectId, SuiPackage } from './types.js';
import { executeTransaction, inspectTransaction } from './execute.js';

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

  reset_new_owner(): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "reset_new_owner",
      arguments: [this.tx.object(this.oracle.state)]
    });
  }

  accept_new_owner(): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "accept_new_owner",
      arguments: [this.tx.object(this.oracle.state)]
    });
  }

  update_gas_token_price(chain_id: ChainId, gas_token_price: bigint): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "update_gas_token_price",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.u16(chain_id), this.tx.pure.u256(gas_token_price)]
    });
  }

  update_gas_price(chain_id: ChainId, gas_price: bigint): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "update_gas_price",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.u16(chain_id), this.tx.pure.u256(gas_price)]
    });
  }

  update_price_per_byte(chain_id: ChainId, price_per_byte: bigint): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "update_price_per_byte",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.u16(chain_id), this.tx.pure.u256(price_per_byte)]
    });
  }

  update_solana_account_size_cost(account_size_cost: bigint): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "update_solana_account_size_cost",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.u256(account_size_cost)]
    });
  }

  update_solana_account_overhead(account_overhead: bigint): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "update_solana_account_overhead",
      arguments: [this.tx.object(this.oracle.state), this.tx.pure.u256(account_overhead)]
    });
  }

  evm_transaction_quote(
    chain_id: ChainId,
    gas_dropoff: bigint,
    gas: bigint,
    base_fee: bigint,
    billed_size: bigint,
  ): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "evm_transaction_quote",
      arguments: [
        this.tx.object(this.oracle.state),
        this.tx.pure.u16(chain_id),
        this.tx.pure.u256(gas_dropoff),
        this.tx.pure.u256(gas),
        this.tx.pure.u256(base_fee),
        this.tx.pure.u256(billed_size),
      ]
    });
  }

  solana_transaction_quote(
    gas_dropoff: bigint,
    number_of_spawned_accounts: bigint,
    total_size_of_accounts: bigint,
    base_fee: bigint,
  ): TransactionResult {
    return this.tx.moveCall({
      package: this.oracle.pkg,
      module: "quoting_oracle",
      function: "solana_transaction_quote",
      arguments: [
        this.tx.object(this.oracle.state),
        this.tx.pure.u256(gas_dropoff),
        this.tx.pure.u256(number_of_spawned_accounts),
        this.tx.pure.u256(total_size_of_accounts),
        this.tx.pure.u256(base_fee),
      ]
    });
  }

}

export class TBRV3 {

  constructor(
    readonly client: SuiClient,
    readonly pkg: SuiPackage,
    readonly state: SuiObjectId
  ) {}

  static async deploy(client: SuiClient, deployer: Ed25519Keypair): Promise<TBRV3> {
    const contractPath = "../../sui/contracts/tbrv3.json"
    const { modules, dependencies } = JSON.parse(await fs.readFile(contractPath, "utf-8"))
    const tx = new Transaction();
    tx.setSender(deployer.getPublicKey().toSuiAddress());
    tx.setGasBudget(50000000000);
    const upgradeCap = tx.publish({ modules, dependencies });
    tx.transferObjects([upgradeCap], deployer.getPublicKey().toSuiAddress());
    const result = await executeTransaction(client, tx, deployer);
    const contract = result.effects?.created?.find((c) => c.owner === "Immutable")
    if (contract === undefined) {
      throw new Error("Resulting contract object was undefined")
    }
    const state = result.effects?.created?.find((c) => c.owner !== 'Immutable' && "Shared" in c.owner)
    if (state === undefined) {
      throw new Error("Resulting state object was undefined")
    }
    return new TBRV3(client, contract.reference.objectId, state.reference.objectId)
  }

  public createTransactionBlock(sender: Ed25519Keypair, gasBudget = BigInt(50000000)): TBRV3TransactionBlock {
    return new TBRV3TransactionBlock(this, sender, gasBudget);
  }
}
