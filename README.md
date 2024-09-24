# Arbitrary Token Transfers

## Getting started

This repo contains a root package and 5 workspaces:
 - evm: which contains the EVM contracts
 - solana: contains the Solana programs
 - sdk/evm: contains the sdk for evm
 - sdk/solana: contains the solana sdk to interact with the contract
 - deployment: has all the scripts for deploying, configuring and interacting in general with the contracts

## Clean installation

- Run `yarn` to install all the global dependencies.
- Checkout submodules: `git submodules update --init`
- Make sure no previous builds output is present `yarn clean:all`

Depending on the desired target environment you have 2 different build options:

- For `devnet` run:

  ```bash
  $ yarn build:all-devnet
  ```

- For `mainnet` run:

  ```bash
  $ yarn build:all
  ```

### Building EVM contracts

Run `yarn ./evm build`. It'll also generate the typechain.

### Building Solana

For solana you have 2 different build options:

- For `devnet` run:

  ```bash
  $ yarn ./solana build:devnet
  ```

- For `mainnet` run:

  ```bash
  $ yarn ./solana build
  ```

## SDKs

Util libraries to interact with the EVM contracts and the Solana programs

### Building the sdk commons

Run `yarn ./sdk/common build`

### Building the EVM SDK

Run `yarn ./sdk/evm build`

### Building the Solana SDK

Run `yarn ./sdk/solana build`

### Building the deployment workspace

Run `yarn ./deployment build:evm`. This will build the evm contracts typechain and bring them over the `deployment` dir.

### Test

```
export TEST_WORMHOLE_ADDRESS=0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B
export TEST_WETH_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
export TEST_USDT_ADDRESS=0xdAC17F958D2ee523a2206206994597C13D831ec7
export TEST_TOKEN_BRIDGE_ADDRESS=0x3ee18B2214AFF97000D974cf647E7C347E8fa585
forge test --fork-url <eth-mainnet-rpc>
```