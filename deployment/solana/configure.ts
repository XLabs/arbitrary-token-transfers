import { SolanaLedgerSigner } from "@xlabs-xyz/ledger-signer-solana";

import { TbrClient } from "@xlabs-xyz/solana-arbitrary-token-transfers";
import { runOnSolana, ledgerSignAndSend, getConnection } from "../helpers/solana.js";
import { SolanaChainInfo, LoggerFn } from "../helpers/interfaces.js";
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { getChainConfig, getChainInfo } from '../helpers/env';

runOnSolana("initialize-tbr", initializeSolanaTbr).catch((error) => {
  console.error("Error executing script: ", error);
})

async function initializeSolanaTbr(
  chain: SolanaChainInfo,
  signer: SolanaLedgerSigner,
  log: LoggerFn,
): Promise<void> {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
  if (solanaDependencies === undefined ) {
    throw new Error(`No dependencies found for chain ${chain.chainId}`);
  }
  const tbr = new TbrClient(connection, {
    tokenBridgeProgramId: new PublicKey(solanaDependencies.tokenBridge),
    wormholeProgramId: new PublicKey(solanaDependencies.wormhole),
  });

  const config = await getChainConfig("tbr-v3", chain.chainId);

  // updateFeeRecipient(signer, newFeeRecipient: PublicKey): TransactionInstruction
  // updateEvmTransactionConfig(signer, evmTransactionGas, evmTransactionSize)
  // updateRelayerFee(signer, chain, relayerFee: Bn): TransactionInstruction
  // updateMaxGasDropoff(signer, chain, maxGasDropoff: Bn): TransactionInstruction
  // registerPeer(signer, chain, peerAddress: UniversalAddress): TransactionInstruction

  // await ledgerSignAndSend(connection, [initializeIx], []);
}