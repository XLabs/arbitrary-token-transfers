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

- For `testnet` run:

  ```bash
  $ yarn build:all-testnet
  ```

- For `mainnet` run:

  ```bash
  $ yarn build:all
  ```

### Building EVM contracts

Run `yarn ./evm build`. It'll also generate the typechain.

### Building Solana

For solana you have 2 different build options:

- For `testnet` run:

  ```bash
  $ yarn ./solana build:testnet
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

## Tests

### Running tests for EVM Contracts

- Make a copy of the `.env.evm-test.sample` file contents into its own file

  ```bash
  $ cp .env.evm-test.sample .env.evm-test
  ```

- Run the test

  ```bash
  $ yarn test:evm <eth-mainnet-rpc>
  ```
