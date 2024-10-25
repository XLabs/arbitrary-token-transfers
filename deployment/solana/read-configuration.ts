import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, getConnection, ChainConfigEntry } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { inspect } from 'util';

const readChainConfig: SolanaScriptCb = async function (
  operatingChain,
  signer,
  log,
) {
  log('reading solana chain configs');
  const connection = getConnection(operatingChain);
  const solanaDependencies = dependencies.find((d) => d.chainId === operatingChain.chainId);
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${operatingChain.chainId}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create({ connection });

  let allChainConfigs: ChainConfigEntry[];
  try {
    allChainConfigs = await tbr.read.allChainConfigs();
  } catch (e) {
    log(`error reading chain config for ${operatingChain.name}`, (e as any)?.stack ?? e);
    return;
  }

  allChainConfigs.forEach(async (config) => {
      log(`config for ${config.chainId}`, inspect(config));
      log(`peer for ${config.chainId} is`, config.canonicalPeer.toString());
  });
};

runOnSolana('read-chain-configs', readChainConfig).catch((e) => {
  console.error('Error executing script: ', e);
});
