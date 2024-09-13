# EVM

You will use `evm/deploy.ts`, please follow these steps:

1. Make sure you have the necessary dependencies installed. Run `yarn` at the root of the project to install all dependencies.

2. Run `yarn build` on the root to build the TS code and `yarn build:evm` on the deployment workspace to build the ethers-contracts typings. 

3. If you are using just a private key, please set it on the WALLET_KET environment variable.

4. Modify the files in the config folder to match your deployment requirements for the needed environment (localnet, testnet or mainnet).

5. To execute the deployment, use one of the scripts in the package.json file. For example, to deploy to the localnet, run `yarn workspace deployment run deploy:evm:localnet`.