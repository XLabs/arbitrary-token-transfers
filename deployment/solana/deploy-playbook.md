# Solana Deployment Playbook

Requirements:

* Anchor >= 0.30.1 + Rust <=1.8 
* Docker to generate Anchor verifiable build.

1. Build the required Solana SDK and common TS projects first:

   ```shell
   yarn ./sdk/common build
   yarn ./sdk/solana build
   ```

2. Generate vanity-addresses (att/atb prefixed) under `deployment` directory 
   ```shell
   export att_buffer_account=$(solana-keygen grind --ignore-case --starts-with atb:1 | grep 'Wrote keypair' | awk '{ sub(/\.json$/, "", $4); print $4 }')
   export att_program_address=$(solana-keygen grind --ignore-case --starts-with att:1 | grep 'Wrote keypair' | awk '{ sub(/\.json$/, "", $4); print $4 }')
   echo
   echo Created accounts: 
   echo att_buffer_account=$att_buffer_account
   echo att_program_address=$att_program_address

   export att_buffer_account_keyfile=$(pwd)/$att_buffer_account.json
   export att_program_keyfile=$(pwd)/$att_program_address.json
   ```

3. Set environment variables with proper values:
   ```shell
   export att_solana_rpc_url=https://api.devnet.solana.com &&
   export att_deployer_account=C4g4fRKT1xF6tFvo8QoPccVGsrzFgbHZnMRXfsSNQ8dm &&
   export att_buffer_creator_account=~/.config/solana/phantom &&
   export att_key_path=~/.config/solana/phantom
   ```

   Be careful to set environment:

   ```shell
   export ENV=devnet | mainnet
   ```

4. Replace program key (att prefixed) in `solana/programs/token-bridge-relayer/network.json` matching your deployment. You can do this with `jq` as follows:

   ```shell 
   jq --arg v "$att_program_address" '.devnet.programId = $v' solana/programs/token-bridge-relayer/network.json > temp.json && mv temp.json solana/programs/token-bridge-relayer/network.json
   ```

   Replace the program address in contract.json as follows:

   ```shell
   jq --arg v "$att_program_address" '.TbrV3[] |= if .chainId == 1 then .address = $v else . end' deployment/config/$ENV/contracts.json > temp.json && mv temp.json deployment/config/$ENV/contracts.json
   ```

5. Go with the IDL/Solana program build

   Replace `<FEATURE>` with `solana-devnet` or `mainnet`based on your deployment.  

   ```shell
   rm -rf target/idl target/types &&   
   anchor build --verifiable -- --features <FEATURE> &&
   rm ./sdk/solana/tbrv3/idl/token_bridge_relayer.json &&   
   cp ./target/idl/token_bridge_relayer.json ./sdk/solana/tbrv3/idl &&   
   yarn ./sdk/solana build
   ```
 
6. Deploy the programs from the `deployment` directory.

   ```shell
   cd  deployment
   ```

   ```shell
   solana program -k "$att_buffer_creator_account.json" \
    --url $att_solana_rpc_url \
    write-buffer \
    ../target/verifiable/token_bridge_relayer.so \
    --buffer "$att_buffer_account_keyfile" \
    --with-compute-unit-price 10000 
   ```

   ```shell
   solana program set-buffer-authority $att_buffer_account \
     -k $att_buffer_creator_account.json --new-buffer-authority $att_deployer_account \
     --url $att_solana_rpc_url
   ```

   ```shell
    solana program -k $att_key_path.json deploy  --url $att_solana_rpc_url  --buffer $att_buffer_account_keyfile --program-id $att_program_keyfile
   ```

   ```shell
    anchor idl init --provider.cluster=$att_solana_rpc_url --provider.wallet  "$att_buffer_creator_account.json" --filepath "./target/idl/token_bridge_relayer.json" $att_program_address
   ```

7. Execute initialization / setup scripts.

   Under `deployment/config/$ENV` verify:

   * `ecosystem.json` has operatingChains value set to 1.
   * `solana-tbr-init.json`  has the proper values for the owner, fee recipient and administrator address(es). Typically in  testnet deployments, owner can be the deployer wallet; admins can be left empty. Recipient can be set to the relayer wallet which can be looked up from the respective Dashboard.

   `WALLET_KEY` is required to be set in environment for non-Ledger deployments.  You can use your signer defined in your local keypath file with:

   ```shell 
   export WALLET_KEY=`cat $key_path.json` 
   ```

  ```shell
  yarn tsx ./solana/initialize.ts
  ```

  ```shell
  yarn tsx ./solana/configure.ts
  ```

  ```shell
  yarn tsx ./solana/register-peers.ts
  ```

  ```shell
  yarn tsx ./solana/unpause-contract.ts
  ```