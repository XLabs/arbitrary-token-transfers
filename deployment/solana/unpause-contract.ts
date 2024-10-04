import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';

runOnSolana('unpause-contract', unpauseContract).catch((e) => {
  console.error('Error executing script: ', e);
});

async function unpauseContract(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chain.chainId}`);
  }
  const tbr = new SolanaTokenBridgeRelayer({ connection });

  const initializeIx = await tbr.setPauseForOutboundTransfers(signerKey, 'Sepolia', false);

  await ledgerSignAndSend(connection, [initializeIx], []);
}
