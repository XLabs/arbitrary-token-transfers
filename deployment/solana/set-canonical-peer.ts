import { chainIdToChain, chainToChainId } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { ChainConfigAccountData, SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getEnvOrDefault } from '../helpers/env.js';
import { contracts } from '../helpers/index.js';

const setCanonicalPeerSolanaTbr: SolanaScriptCb = async function (
  operatingChain,
  signer,
  log,
) {
  const connection = getConnection(operatingChain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(operatingChain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chainToChainId(operatingChain.name)}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  for (const tbrDeployment of contracts['TbrV3Proxies']) {
    log(`Processing chain ${tbrDeployment.chainId}...`);
    // skip setting canonical peer for the operating chain
    if (tbrDeployment.chainId === chainToChainId(operatingChain.name)) continue;

    const currentChainConfig = await tbr.tryRead.chainConfig(chainIdToChain(tbrDeployment.chainId));
    const peerUniversalAddress = new UniversalAddress(tbrDeployment.address);

    if (currentChainConfig === ChainConfigAccountData.NotInitialized) {
      log (`There is no peer registered for chain ${tbrDeployment.chainId}, skipping.`);
      continue;
    }

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

runOnSolana('set-canonical-peer-solana-tbr', setCanonicalPeerSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error?.stack || error);
});
