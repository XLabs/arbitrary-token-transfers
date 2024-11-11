# Solana Upgrade Playbook

## Build stage

* Follow the  "Deployment Playbook" instructions to build the project.

* Execute the following instructions in the `deployment` directory.

* Create the buffer account:

  ```shell
  solana-keygen new -o hot-wallet.json --no-bip39-passphrase
  solana-keygen new -o buffer.json --no-bip39-passphrase

  export BUFFER_PUBKEY=`solana-keygen pubkey buffer.json`
  export HOT_WALLET_PUBKEY=`solana-keygen pubkey hot-wallet.json`
  ```

* Backup the `buffer.json` and `hot_wallet.json` files containing the Buffer account private key to a secure location. Make sure to associate those files with this deployment work, e.g: renaming them to `buffer-tbrv3-upgrade-<network>-<date>.json` and `hot-wallet-tbrv3-upgrade-<network>-<date>.json`.
  The intention of this backup is to have a way to recover the account funds in case of a catastrophic failure during the upgrade process.

* Verify your ledger is working and has enough funds:
  
  ```shell
  export LEDGER_TBR_V3="usb://ledger?key=0/10"
  export LEDGER_TBR_V3_PUBKEY=$(solana address --keypair "$LEDGER_TBR_V3")
  solana balance -u "$SOLANA_RPC_URL" "$LEDGER_TBR_V3_PUBKEY"
  ```

* Estimate the rent using the `rent` command and adding ~3 SOL to the amount.  

  ```shell
  solana rent $(stat -c%s "./target/verifiable/token_bridge_relayer.so")
  ```

* Transfer the necessary funds to the Hot Wallet. This is an example, confirm withdrawing from the selected source account DOES NOT affect other operations. By default, LEDGER_REWARDS should be safe.

  ```shell
  export AMOUNT=0   # Set to the desired amount!
  export LEDGER_REWARDS="usb://ledger?key=0/0"
  solana transfer "$HOT_WALLET_PUBKEY" $AMOUNT \
   --from "$LEDGER_REWARDS" \
   --fee-payer "$LEDGER_REWARDS" \
   --keypair $"$LEDGER_REWARDS" \
   --allow-unfunded-recipient \
   --url "$SOLANA_RPC_URL"
  ```

## Deploy stage

* Prepare the upgrade buffer:

  ```shell
  solana program write-buffer \
    --fee-payer hot-wallet.json \
    --keypair buffer.json \
    --url "$SOLANA_RPC_URL" \
    --buffer buffer.json \
    --with-compute-unit-price 100000 \
    ../target/verifiable/token_bridge_relayer.so
  ```

  ```shell
  solana program set-buffer-authority "$BUFFER_PUBKEY" \
    --buffer-authority buffer.json \
    --keypair hot-wallet.json \
    --new-buffer-authority "$LEDGER_TBR_V3" \
    --url "$SOLANA_RPC_URL"
  ```

* Set the env var `TBR_V3_PROGRAM_ID` to the program id (look at `contracts.json` file.)

* Set the upgrade program authority to the Ledger account.
  
    ```shell
    solana program set-upgrade-authority "$TBR_V3_PROGRAM_ID" \
      --new-upgrade-authority "$LEDGER_TBR_V3" \
      --upgrade-authority hot-wallet.json \
      --keypair hot-wallet.json \
      --url "$SOLANA_RPC_URL"
    ```

* Inspect program info:

  ```shell
  solana program show "$TBR_V3_PROGRAM_ID" --url $solana_rpc_url
  ```

  ```shell
  solana program upgrade \
    --keypair "$LEDGER_TBR_V3" \
    --url "$SOLANA_RPC_URL" \
    buffer.json \
    "$TBR_V3_PROGRAM_ID"
  ```

* When the upgrade is successful, return any remaining funds from the Hot Wallet to the Ledger Rewards account. 

  Make sure the owner (`LEDGER_TBR_V3`) is left with at least 1 SOL to cover future operations.

  ```shell
  export REFUND_AMOUNT=0   # Set to the desired amount!

  solana transfer $(solana address --keypair "$LEDGER_REWARDS") ALL --from hot-wallet.json --fee-payer hot-wallet.json --keypair hot-wallet.json --url "$SOLANA_RPC_URL"

  solana transfer $(solana address --keypair "$LEDGER_REWARDS") $REFUND_AMOUNT --from "$LEDGER_TBR_V3" --fee-payer "$LEDGER_TBR_V3" --keypair "$LEDGER_TBR_V3" --url "$SOLANA_RPC_URL"
  ```

# Appendix

* (Optional) Execute the following step if the current object code exceeds current program data length (look at the output of `solana program show` and compare with .so length).

```shell
solana program extend \
  "$TBR_V3_PROGRAM_ID" \
  $EXTRA_BYTES \
  --url "$SOLANA_RPC_URL" \
  --keypair "$LEDGER_TBR_V3"
```
