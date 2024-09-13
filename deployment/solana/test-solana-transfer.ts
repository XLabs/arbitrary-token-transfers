import { SolanaLedgerSigner } from "@xlabs-xyz/ledger-signer-solana";
import { TbrClient } from "@xlabs-xyz/solana-arbitrary-token-transfers";
import { dependencies, evm, getEnv, LoggerFn, solana, SolanaChainInfo } from "../helpers";
import { getConnection, ledgerSignAndSend, runOnSolana } from "../helpers/solana";
import { PublicKey } from "@solana/web3.js";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { Chain } from "@wormhole-foundation/sdk-base";

const chains = evm.evmOperatingChains();

async function run() {
  runOnSolana("send-test-transaction", sendTestTransaction).catch((error) => {
    console.error("Error executing script: ", error);
  })
}

async function sendTestTransaction(
  chain: SolanaChainInfo,
  signer: SolanaLedgerSigner,
  log: LoggerFn
): Promise<void> {
  const targetChain = chains.find((chain) => chain.name === "Sepolia");
  console.log(`Sending transaction to ${targetChain?.name}...`);

  chains.forEach(async (targetChain) => {
    const signerKey = new PublicKey(await signer.getAddress());
    const connection = getConnection(chain);
    const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
    if (solanaDependencies === undefined ) {
      throw new Error(`No dependencies found for chain ${chain.chainId}`);
    }
    const tbrv3 = new TbrClient(connection, {
      tokenBridgeProgramId: new PublicKey(solanaDependencies.tokenBridge),
      wormholeProgramId: new PublicKey(solanaDependencies.wormhole),
    });

    const evmAddress = getEnv("RECIPIENT_EVM_ADDRESS");

    const params = {
      recipientChain: targetChain.name,
      recipientAddress: toUniversal(targetChain.name as Chain, evmAddress),
      mint: signerKey, // Is this ok?
      tokenAccount: "", // TODO: find a token account
      transferredAmount: 1000n,
      gasDropoffAmount: 0n,
      maxFeeSol: 5000n, // TODO: where does this come from?
    }

    const transferIx = await tbrv3.transferNativeTokens(
      signer,
      params
    );

    const txSignature = await ledgerSignAndSend(connection, [transferIx], []);
    log(`Transaction sent: ${txSignature}`);
  });
}

run().then(() => console.log('Done!'));