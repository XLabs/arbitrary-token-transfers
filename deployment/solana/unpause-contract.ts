import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { chain, chains, chainToChainId, isChain } from '@wormhole-foundation/sdk-base';
import { runOnSolana, ledgerSignAndSend, getConnection } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';

const unpauseContract: SolanaScriptCb = async function (
  operatingChain,
  signer,
  // log,
) {

  if (process.argv.length != 3) {
    console.log('\nUsage: \n\nunpause-contract <chain-name>\n');
    console.log('where chain-name is the case-sensitive name of the chain for which outbound transfers will be unpaused');
    console.log('\nValid chain names are:', chains.join(', '));
    process.exit(0);
  }

  const chainName = process.argv[2];
  
  if (!isChain(chainName)) {
    throw new Error(`Invalid chain name: ${chainName}`);
  }
  
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(operatingChain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(operatingChain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${operatingChain.name}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  const initializeIx = await tbr.setPauseForOutboundTransfers(signerKey, chainName, false);

  await ledgerSignAndSend(connection, [initializeIx], []);
}

runOnSolana('unpause-contract', unpauseContract).catch((e) => {
  console.error('Error executing script: ', e);
});
