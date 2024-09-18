### Solana Deployment Playbook:
```shell
cd deployment && \
  solana-keygen grind --ignore-case --starts-with att:1 && \
  solana-keygen grind --ignore-case --starts-with atb:1 && \
  cd -

#
# ❗❗❗ set the buffer account address on your env and on lib.rs, anchor.toml and contracts.json
#

#
# ❗❗❗ make sure to 
#

set -o allexport && source ./deployment/.env.testnet

rm -rf target/idl target/types && \
  anchor build -- --features "solana-devnet" && \
  rm ./sdk/solana/tbrv3/idl/token_bridge_relayer.json && \
  cp ./target/idl/token_bridge_relayer.json ./sdk/solana/tbrv3/idl && \
  yarn ./sdk/solana build

cd deployment

solana program -k "$buffer_creator_account.json" \
  --url $solana_rpc_url \
  write-buffer \
  ../target/deploy/token_bridge_relayer.so \
  --buffer "./$buffer_account.json" \
  --with-compute-unit-price 10000 

solana program set-buffer-authority $buffer_account \
  -k $buffer_creator_account.json --new-buffer-authority $deployer_account \
  --url $solana_rpc_url

# If extending the program memory is required:
# solana program show $program_address --url $solana_rpc_url
# solana program extend $program_address 100000 --url $solana_rpc_url -k usb://ledger?key=$ledger_cli_derivation_path

solana program -k usb://ledger?key=$ledger_cli_derivation_path deploy \
 --url $solana_rpc_url \
 --buffer $buffer_account.json \
 --program-id $program_address.json

anchor idl init --provider.cluster=$solana_rpc_url \
  --provider.wallet "./deployment/$buffer_creator_account.json" \
   --filepath ./target/idl/token_bridge_relayer.json $program_address

yarn tsx ./solana/initialize.ts && \
  yarn tsx ./solana/configure.ts && \
  yarn tsx ./solana/unpause-contract.ts

yarn tsx ./solana/register-peers.ts

```