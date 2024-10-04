import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';
import { loadSolanaTbrInitParams } from '../helpers/env.js';

runOnSolana('initialize-tbr', initializeSolanaTbr).catch((e) => {
  console.error('Error executing script: ', e);
});

async function initializeSolanaTbr(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const tbr = new SolanaTokenBridgeRelayer({ connection });

  const tbrInitParams = loadSolanaTbrInitParams();

  const initializeIx = await tbr.initialize({
    owner: new PublicKey(tbrInitParams.owner),
    feeRecipient: new PublicKey(tbrInitParams.feeRecipient),
    admins: tbrInitParams.admins.map((adminKey) => new PublicKey(adminKey)),
  });

  await ledgerSignAndSend(connection, [initializeIx], []);
}
