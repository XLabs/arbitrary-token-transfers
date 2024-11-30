import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { runOnSolana, ledgerSignAndSend, getConnection } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';

const unpauseContract: SolanaScriptCb = async function (
  operatingChain,
  signer,
  // log,
) {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(operatingChain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(operatingChain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${operatingChain.name}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  const initializeIx = await tbr.setPauseForOutboundTransfers(signerKey, 'Sepolia', false);

  await ledgerSignAndSend(connection, [initializeIx], []);
}

runOnSolana('unpause-contract', unpauseContract).catch((e) => {
  console.error('Error executing script: ', e);
});
