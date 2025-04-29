import { chainIdToChain, chainToChainId } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getEnvOrDefault } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { contracts } from '../helpers/index.js';
import { getChainConfig } from '../helpers/env.js';
import { EvmTbrV3Config } from '../config/config.types.js';

type ChainConfigEntry = {
  chainId: number;
  maxGasDropoffMicroToken: number;
  relayerFeeMicroUsd: number;
  pausedOutboundTransfers: boolean;
  canonicalPeer: UniversalAddress;
};

const setCanonicalPeerSolanaTbr: SolanaScriptCb = async function (
  chain,
  signer,
  log,
) {
  const connection = getConnection(chain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chainToChainId(chain.name)}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  for (const tbrDeployment of contracts['TbrV3Proxies']) {
    log(`Processing chain ${tbrDeployment.chainId}...`);
    if (tbrDeployment.chainId === chainToChainId(chain.name)) continue; // skip self;

    let currentChainConfig: ChainConfigEntry | undefined;
    try {
      const allChainConfigs: ChainConfigEntry[]  = await tbr.read.allChainConfigs();
      currentChainConfig = allChainConfigs.find((config) => config.chainId === tbrDeployment.chainId);
    } catch (error) {
      if (!(error instanceof Error) || !error.message?.includes('Account does not exist'))
        throw error;
    }

    const peerUniversalAddress = new UniversalAddress(tbrDeployment.address);

    if (!currentChainConfig) {
      log (`There is no peer registered for ${tbrDeployment.chainId}, skipping.`);
    } else {
      const currentPeer = currentChainConfig.canonicalPeer.toUniversalAddress();

      if (!currentPeer.equals(peerUniversalAddress)) {
        log(
          `Updating peer for chain ${tbrDeployment.chainId} from ${currentPeer} to ${peerUniversalAddress}`,
        );
        const ix = await tbr.updateCanonicalPeer(
          chainIdToChain(tbrDeployment.chainId),
          peerUniversalAddress,
        );
        const tx = await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
        log(`Update succeeded on tx: ${tx}`);
      }
      else {
        log(`Peer for chain ${tbrDeployment.chainId} is already set to ${peerUniversalAddress}, skipping.`);
      }
    }
  }
}

runOnSolana('set-canonical-peer-solana-tbr', setCanonicalPeerSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log('extra logs', error.getLogs());
});
