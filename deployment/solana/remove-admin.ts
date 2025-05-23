// 
// Removes a key from the admin list.

import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';
import { getEnvOrDefault } from '../helpers/env.js';

const removeAdmin: SolanaScriptCb = async function (
    chain,
    signer,
    log,
) {
    // get the admin to remove, with arguments:
    // remove-admin <owner_or_admin> <admin_to_remove>
    // e.g. remove-admin 8a5BXhBXGBzGRiKCCCeWH5GGGgNjDe7JyNhW65wBWoor 11111111111111111111111111111111
    
    const owner_or_admin = new PublicKey(process.argv[2]);
    const adminToRemove = new PublicKey(process.argv[3]);

    if (process.argv.length !== 4) {
        throw new Error('Invalid number of arguments. Usage: remove-admin <owner_or_admin> <admin-to-remove>');
    }

    const connection = getConnection(chain);
    const tbr = await SolanaTokenBridgeRelayer.create(connection);

    log(`Removing admin ${adminToRemove.toBase58()} from TBR`);

    const removeAdminIxs = await tbr.removeAdmin(owner_or_admin, adminToRemove);
    const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

    await ledgerSignAndSend(connection, [removeAdminIxs], [], { lockedWritableAccounts: [], priorityFeePolicy });
}

runOnSolana('remove-admin', removeAdmin).catch((e) => {
    console.error('Error executing script: ', e);
}); 