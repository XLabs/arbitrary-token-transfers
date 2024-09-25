import { Chain } from "@wormhole-foundation/sdk-base";
import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { dependencies, ecosystemChains } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { inspect } from 'util';

runOnSolana('read-chain-configs', readChainConfig).catch((e) => {
  console.error('Error executing script: ', e);
});

async function readChainConfig(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
  log: LoggerFn,
): Promise<void> {
  log('reading solana chain configs');
  const connection = getConnection(chain);
  const solanaDependencies = dependencies.find((d) => d.chainId === chain.chainId);
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chain.chainId}`);
  }
  const tbr = new SolanaTokenBridgeRelayer(
    { connection },
    {
      tokenBridgeProgramId: new PublicKey(solanaDependencies.tokenBridge),
      wormholeProgramId: new PublicKey(solanaDependencies.wormhole),
    },
  );

  ecosystemChains.evm.networks.forEach(async (chain) => {
    try {
      log('reading chain config', chain.name);
      const config = await tbr.read.chainConfig(chain.name as Chain);

      const peer = Buffer.from(config.canonicalPeer).toString('hex');
      log(`config for ${chain.name}`, inspect(config));
      log(`peer for ${chain.name} is`, peer);
    } catch (e) {
      log(`error reading chain config for ${chain.name}`, e);
    }

  });
}
