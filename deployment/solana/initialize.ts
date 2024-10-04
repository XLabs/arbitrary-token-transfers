import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';
import { loadSolanaTbrInitParams } from '../helpers/env.js';

const SOLANA_DEFAULT_ADDRESS = '11111111111111111111111111111111';

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

  if (!tbrInitParams.owner || tbrInitParams.owner === SOLANA_DEFAULT_ADDRESS) {
    throw new Error ("initialization parameters: owner address absent or not configured.")
  }

  if (!tbrInitParams.feeRecipient || tbrInitParams.feeRecipient === SOLANA_DEFAULT_ADDRESS) {
    throw new Error ("initialization parameters: feeRecipient address absent or not configured.")
  }

  if (!tbrInitParams.admins || tbrInitParams.admins.length === 0 || tbrInitParams.admins.includes(SOLANA_DEFAULT_ADDRESS)) {
    throw new Error ("initialization parameters: admins addresses absent or not configured.")
  }

  const initializeIx = await tbr.initialize({
    owner: new PublicKey(tbrInitParams.owner),
    feeRecipient: new PublicKey(tbrInitParams.feeRecipient),
    admins: tbrInitParams.admins.map((adminKey) => new PublicKey(adminKey)),
  });

  await ledgerSignAndSend(connection, [initializeIx], []);
}
