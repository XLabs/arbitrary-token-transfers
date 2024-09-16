import { SolanaLedgerSigner } from '@xlabs-xyz/ledger-signer-solana';
import { BN } from '@coral-xyz/anchor';
import { TbrClient } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { getChainConfig, getChainInfo } from '../helpers/env';
import { SolanaTbrV3Config } from '../config/config.types.js';

runOnSolana('configure-tbr', configureSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
});

async function configureSolanaTbr(
  chain: SolanaChainInfo,
  signer: SolanaLedgerSigner,
  log: LoggerFn,
): Promise<void> {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chain.chainId}`);
  }
  const tbr = new TbrClient({ connection }, {
    tokenBridgeProgramId: new PublicKey(solanaDependencies.tokenBridge),
    wormholeProgramId: new PublicKey(solanaDependencies.wormhole),
  });

  const config = await getChainConfig<SolanaTbrV3Config>('tbr-v3', chain.chainId);

  const contractConfig = await tbr.read.config();

  if (
    config.feeRecipient &&
    !contractConfig.feeRecipient.equals(new PublicKey(config.feeRecipient))
  ) {
    log(
      `Updating fee recipient from ${contractConfig.feeRecipient.toString()} to ${config.feeRecipient}`,
    );
    const ix = await tbr.updateFeeRecipient(signerKey, new PublicKey(config.feeRecipient));
    await ledgerSignAndSend(connection, [ix], []);
  }

  const evmTxSize = BigInt(config.evmTransactionSize);
  const evmTxGas = BigInt(config.evmTransactionGas);

  if (
    evmTxSize !== BigInt(contractConfig.evmTransactionSize.toString()) ||
    evmTxGas !== BigInt(contractConfig.evmTransactionGas.toString())
  ) {
    log(
      `Updating EVM Transaction config.`
    )
    const ix = await tbr.updateEvmTransactionConfig(
      signerKey,
      new BN(evmTxGas.toString()),
      new BN(evmTxSize.toString()),
    );

    await ledgerSignAndSend(connection, [ix], []);
  }
}
