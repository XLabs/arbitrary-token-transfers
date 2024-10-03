import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';

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

  const tmpError = () => { throw new Error('TODO: add this field'); };
  const initializeIx = await tbr.initialize({
    deployer: signerKey,
    owner: tmpError(),
    feeRecipient: tmpError(),
    admins: tmpError(),
  });

  await ledgerSignAndSend(connection, [initializeIx], []);
}
