# Build Solana and EVM contracts

1. Change directory to root of TBRv3 repository.
2. Run `git checkout 574f53b88950adbb9cdcb21ac4774b627f74ad34`
3. Run `yarn` to link dependencies
4. Bring submodules with ```git submodule update --init --recursive```
5. Clean with `yarn clean:all`
6. Ensure you have the following:
  - rustc v1.81.0
    - If you fail to use this version while installing Anchor CLI, downgrade to v1.79.0 temporarily and then switch to this toolchain again.
  - Solana v1.18.23
  - Anchor v0.30.1
  - Foundry tag nightly-fd565286372b42a19b22d6a756e59a1b60a4135c
  - Docker to generate Anchor verifiable build.
7. Choose one:
  - Build for mainnet with `yarn build:verifiable:all-mainnet`
  - Build for testnet with `yarn build:verifiable:all-testnet`
8. Run the following:
```
git status -s
```
The output of the git command should show a clean working directory. If not, deployment should be aborted and this should be remedied by the contract developers.

9. Run contract tests:
  - `yarn ./evm test <Ethereum mainnet RPC node with archive capability, e.g. Alchemy>`
  - `yarn ./solana test`
10. Typecheck deployment scripts with `yarn ./deployment test:build`

After running, you should be ready to execute the deployment if no errors occurred. Otherwise, fix the errors and start again.


# Deploy EVM on testnet

1. Make sure you built both Solana and EVM contracts following above instructions first.
2. Change directory to root of TBRv3 repository.
3. Update or create `./deployment/config/testnet/key.env` with deployment key.
4. Adjust `./deployment/config/testnet/ecosystem.json` with desired operating chains.
5. Export ENV=testnet
6. Execute
```shell
cd deployment
source ./config/testnet/key.env && yarn tsx ./evm/deploy.ts
```
6. Register peers with `source ./config/testnet/key.env && yarn tsx ./evm/register-peers.ts`

# Deploy Solana on testnet


1. Follow steps 1 through 6 of build instructions above.

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
   export ENV=testnet | mainnet
   ```

4. Replace program key (att prefixed) in `solana/programs/token-bridge-relayer/network.json` matching your deployment. You can do this with `jq` as follows:

   ```shell
   jq --arg v "$att_program_address" '.testnet.programId = $v' solana/programs/token-bridge-relayer/network.json > temp.json && mv temp.json solana/programs/token-bridge-relayer/network.json
   ```

   Replace the program address in contract.json as follows:

   ```shell
   jq --arg v "$att_program_address" '.TbrV3[] |= if .chainId == 1 then .address = $v else . end' deployment/config/$ENV/contracts.json > temp.json && mv temp.json deployment/config/$ENV/contracts.json
   ```

5. Resume on build instructions step 7 above to build both Solana and EVM contracts.

6. Deploy the programs from the `deployment` directory.

   ```shell
   cd  deployment
   solana_compute_unit_price=10000
   ```

   ```shell
   solana program -k "$att_buffer_creator_account.json" \
    --url $att_solana_rpc_url \
    write-buffer \
    ../target/verifiable/token_bridge_relayer.so \
    --buffer "$att_buffer_account_keyfile" \
    --with-compute-unit-price "$solana_compute_unit_price"
   ```

   ```shell
   solana program set-buffer-authority $att_buffer_account \
     -k $att_buffer_creator_account.json --new-buffer-authority $att_deployer_account \
     --url $att_solana_rpc_url
   ```

   ```shell
    solana program -k $att_key_path.json deploy  --url $att_solana_rpc_url  --buffer $att_buffer_account_keyfile --program-id $att_program_keyfile --with-compute-unit-price "$solana_compute_unit_price"
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
   export WALLET_KEY=`cat $att_key_path.json`
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