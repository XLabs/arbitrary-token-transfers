import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';
import { loadSolanaTbrInitParams } from '../helpers/env.js';

const initializeSolanaTbr: SolanaScriptCb = async function (
  chain,
  signer,
  // log,
) {
  const connection = getConnection(chain);
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  const tbrInitParams = loadSolanaTbrInitParams();

  if (!tbrInitParams.owner) {
    throw new Error ("initialization parameters: owner address is required.");
  }

  if (!tbrInitParams.feeRecipient) {
    throw new Error ("initialization parameters: feeRecipient address is required.");
  }

  const deployerPubkey = new PublicKey(await signer.getAddress());

  const initializeIxs = await tbr.initialize(
    deployerPubkey,
    {
      owner: new PublicKey(tbrInitParams.owner),
      feeRecipient: new PublicKey(tbrInitParams.feeRecipient),
      admins: tbrInitParams.admins.map((adminKey) => new PublicKey(adminKey)),
    },
    BigInt(tbrInitParams.evmRelayGas),
    BigInt(tbrInitParams.evmRelayTxSize)
  );

  await ledgerSignAndSend(connection, initializeIxs, []);
}

runOnSolana('initialize-tbr', initializeSolanaTbr).catch((e) => {
  console.error('Error executing script: ', e);
});
