### Solana Upgrade Playbook:
```shell
solana-keygen grind --ignore-case --starts-with atb:1

#!! set the buffer account address on your env

rm -rf target/idl target/types

anchor build -- --features solana-devnet

rm ./sdk/solana/tbrv3/idl/token_bridge_relayer.json

cp ./target/idl/token_bridge_relayer.json ./sdk/solana/tbrv3/idl

solana program -k "$buffer_creator_account.json" \
  --url $solana_rpc_url \
  write-buffer \
  ../target/deploy/token_bridge_relayer.so \
  --buffer "./$upgrade_buffer_account.json" \
  --with-compute-unit-price 100000 

solana program set-buffer-authority $upgrade_buffer_account \
  -k $buffer_creator_account.json --new-buffer-authority $deployer_account \
  --url $solana_rpc_url

solana program show $program_address --url $solana_rpc_url

solana program extend $program_address 100000 --url $solana_rpc_url -k usb://ledger?key=$ledger_cli_derivation_path

solana program -k usb://ledger?key=$ledger_cli_derivation_path upgrade \
 --url $solana_rpc_url \
 $upgrade_buffer_account.json \
 $program_address

anchor idl upgrade \
  --provider.cluster=$solana_rpc_url \
  --provider.wallet "./deployment/$buffer_creator_account.json" \
   --filepath "./target/idl/token_bridge_relayer.json" $program_address

```