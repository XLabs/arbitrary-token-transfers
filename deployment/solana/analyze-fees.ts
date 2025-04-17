import { runOnSolana, ledgerSignAndSend, getConnection, getSortedPrioritizationFeeList, getPrioritizationFeeFromList, DEFAULT_COMPUTE_BUDGET_MICROLAMPORTS } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { PublicKey } from '@solana/web3.js';

const analyzePrioritizationFees: SolanaScriptCb = async function (
  chain
) {
  const connection = getConnection(chain);

  // parse each command line argument as a public key
  const lockedWritableAccounts = process.argv.slice(2).map((arg) => new PublicKey(arg));
  
  const sortedPrioritizationFeeList = await getSortedPrioritizationFeeList(connection, lockedWritableAccounts);
  if (sortedPrioritizationFeeList.length === 0) {
    console.log(`\nNo prioritization fees found in recent blocks. Use either \n   - ${DEFAULT_COMPUTE_BUDGET_MICROLAMPORTS} as minimum recommended value, or \n   - "analyze-fees <account1> <account2> ..." to analyze specific accounts`);
    return;
  }

  console.log(`Max prioritization fee:                      ${getPrioritizationFeeFromList(sortedPrioritizationFeeList, 'max')} microLamports`);
  console.log(`High   (95th-percentile) prioritization fee: ${getPrioritizationFeeFromList(sortedPrioritizationFeeList, 'high')} microLamports`);
  console.log(`Normal (87th-percentile) prioritization fee: ${getPrioritizationFeeFromList(sortedPrioritizationFeeList, 'normal')} microLamports`);
  console.log(`Low    (50th-percentile) prioritization fee: ${getPrioritizationFeeFromList(sortedPrioritizationFeeList, 'low')} microLamports`);
}

runOnSolana('analyze-prioritization-fees', analyzePrioritizationFees).catch((e) => {
  console.error('Error executing script: ', e);
});
