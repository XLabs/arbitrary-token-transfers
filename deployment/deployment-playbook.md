# Build Solana and EVM contracts

1. Change directory to root of TBRv3 repository.
2. Run `git checkout 97834ccdddd492bd250c1ff1d0b7eb215434794e`
3. Run `yarn` to link dependencies
4. Bring submodules with ```git submodule update --init --recursive```
5. Clean with `yarn clean`
6. Ensure you have the following:
  - rustc v1.81.0
  - Solana v1.18.23
  - Anchor v0.30.1
  - Foundry tag nightly-fd565286372b42a19b22d6a756e59a1b60a4135c
7. Choose one:
  - Build for mainnet with `yarn build:all-mainnet`
  - Build for testnet with `yarn build:all-devnet`
8. Run contract tests:
  - `yarn ./evm test <Ethereum mainnet RPC node with archive capability, e.g. Alchemy>`
  - `yarn ./solana test`
9. Typecheck deployment scripts with `yarn ./deployment test:build`

After running, you should be ready to execute the deployment if no errors occurred. Otherwise, fix the errors and start again.


# Deploy EVM on testnet

1. Make sure you built both Solana and EVM contracts following above instructions first.
2. Change directory to root of TBRv3 repository.
3. Update or create `./deployment/config/testnet/key.env` with deployment key.
4. Adjust `./deployment/config/testnet/ecosystem.json` with desired operating chains.
5. Execute
```shell
cd deployment
source ./evm/testnet.env && yarn tsx ./evm/deploy.ts
```
6. Register peers with `source ./evm/testnet.env && yarn tsx ./evm/register-peers.ts`