import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getEnvOrDefault } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { getChainConfig } from '../helpers/env.js';
import { SolanaTbrV3Config } from '../config/config.types.js';

const configureSolanaTbr: SolanaScriptCb = async function (
  chain,
  signer,
  log,
) {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chainToChainId(chain.name)}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  const config = await getChainConfig<SolanaTbrV3Config>('tbr-v3', chainToChainId(chain.name));

  const contractConfig = await tbr.read.config();

  if (
    config.feeRecipient &&
    !contractConfig.feeRecipient.equals(new PublicKey(config.feeRecipient))
  ) {
    log(
      `Updating fee recipient from ${contractConfig.feeRecipient.toString()} to ${config.feeRecipient}`,
    );
    const ix = await tbr.updateFeeRecipient(signerKey, new PublicKey(config.feeRecipient));
    await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
  }

  const evmTxSize = Number(config.evmTransactionSize);
  const evmTxGas = Number(config.evmTransactionGas);

  if (
    evmTxSize !== contractConfig.evmTransactionSize ||
    evmTxGas !== contractConfig.evmTransactionGas
  ) {
    log(`Updating EVM Transaction config.`);
    const ix = await tbr.updateEvmTransactionConfig(
      signerKey,
      evmTxGas,
      evmTxSize
    );

    await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
  }
}

runOnSolana('configure-tbr', configureSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
});
