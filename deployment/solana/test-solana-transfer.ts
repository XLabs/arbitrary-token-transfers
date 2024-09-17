import { SolanaLedgerSigner } from '@xlabs-xyz/ledger-signer-solana';
import { TbrClient } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { dependencies, evm, getEnv, LoggerFn, solana, SolanaChainInfo } from '../helpers';
import { getConnection, ledgerSignAndSend, runOnSolana, SolanaSigner } from '../helpers/solana';
import { PublicKey } from '@solana/web3.js';
import { toUniversal } from '@wormhole-foundation/sdk-definitions';
import { Chain } from '@wormhole-foundation/sdk-base';
import * as anchor from '@coral-xyz/anchor';

const BN = anchor.BN;

const chains = evm.evmOperatingChains();

async function run() {
  runOnSolana('send-test-transaction', sendTestTransaction).catch((error) => {
    console.error('Error executing script: ', error);
  });
}

async function sendTestTransaction(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  await Promise.all(
    chains.map(async (targetChain) => {
      console.log('targeting:', targetChain);
      const signerKey = new PublicKey(await signer.getAddress());
      const connection = getConnection(chain);
      const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
      if (solanaDependencies === undefined) {
        throw new Error(`No dependencies found for chain ${chain.chainId}`);
      }

      const tokenBridgeProgramId = new PublicKey(solanaDependencies.tokenBridge);
      const wormholeProgramId = new PublicKey(solanaDependencies.wormhole);

      const tbr = new TbrClient({ connection }, {
        tokenBridgeProgramId,
        wormholeProgramId,
      });

      const evmAddress = getEnv('RECIPIENT_EVM_ADDRESS');

      const params = {
        recipientChain: targetChain.name as Chain,
        recipientAddress: toUniversal(targetChain.name as Chain, evmAddress).toUint8Array(),
        mint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), // Is this ok?
        tokenAccount: new PublicKey('Cu7gE34M8nckaC17zkbmWSrqGyCBYd5GjT6LdYLX8YfJ'), // TODO: find a token account
        transferredAmount: new BN(1000),
        gasDropoffAmount: new BN(0),
        maxFeeSol: new BN(5000), // TODO: where does this come from?
        unwrapIntent: false,
      };

      const transferIx = await tbr.transferNativeTokens(signerKey, params);

      const txSignature = await ledgerSignAndSend(connection, [transferIx], []);
      log(`Transaction sent: ${txSignature}`);
    }),
  );
}

run().then(() => console.log('Done!'));
