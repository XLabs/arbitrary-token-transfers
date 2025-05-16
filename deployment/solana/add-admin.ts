// 
// Adds a key to the admin list.

import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';
import { getEnvOrDefault } from '../helpers/env.js';

const addAdmin: SolanaScriptCb = async function (
    chain,
    signer,
    log,
) {
    // get the admin to add from first argument
    const adminToAdd = new PublicKey(process.argv[2]);

    const connection = getConnection(chain);
    const tbr = await SolanaTokenBridgeRelayer.create(connection);

    log(`Adding admin ${adminToAdd.toBase58()} to TBR`);

    const addAdminIxs = await tbr.addAdmin(adminToAdd);
    const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

    await ledgerSignAndSend(connection, [addAdminIxs], [], { lockedWritableAccounts: [], priorityFeePolicy });
}

runOnSolana('add-admin', addAdmin).catch((e) => {
    console.error('Error executing script: ', e);
}); 