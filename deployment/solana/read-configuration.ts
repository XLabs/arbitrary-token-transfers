import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { inspect } from 'util';

runOnSolana('initialize-tbr', initializeSolanaTbr).catch((e) => {
  console.error('Error executing script: ', e);
});

async function initializeSolanaTbr(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  console.log('hello?');
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chain.chainId}`);
  }
  const tbr = new SolanaTokenBridgeRelayer({ connection });

  const config = await tbr.read.chainConfig('Sepolia');

  const peer = Buffer.from(config.canonicalPeer).toString('hex');
  console.log('config', inspect(config));
  console.log('peer', peer);
}
