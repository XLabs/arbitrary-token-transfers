1. update as needed the configuration in the following files of the respective env:
  - ecosystem.json
  - verification-api-keys.json
  - dependencies.json
  - tbr-v3.json
2. update .env.testnet as needed
3. clean up:
```
rm -rf deployment/ethers-contracts
rm -rf evm/build-forge
```
4. build:
```
yarn
yarn ./deployment build:evm
```
5. deploy:
```
cd deployment
. .env.testnet && yarn tsx ./evm/deploy.ts
```
6. peers:
```
cd deployment
. .env.testnet && yarn tsx ./evm/register-peers.ts
```