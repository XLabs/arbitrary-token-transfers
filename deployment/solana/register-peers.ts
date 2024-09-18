import { BN } from '@coral-xyz/anchor';
import { chainIdToChain } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { TbrClient } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, SolanaSigner } from '../helpers/solana.js';
import { SolanaChainInfo, LoggerFn } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { contracts } from '../helpers';
import { getChainConfig } from '../helpers/env';
import { EvmTbrV3Config } from '../config/config.types.js';

runOnSolana('configure-tbr', configureSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log("extra logs", error.getLogs());
});

async function configureSolanaTbr(
  chain: SolanaChainInfo,
  signer: SolanaSigner,
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

  for (const tbrDeployment of contracts["TbrV3Proxies"]) {
    if (tbrDeployment.chainId === chain.chainId) continue; // skip self;

    const desiredChainConfig = await getChainConfig<EvmTbrV3Config>('tbr-v3', tbrDeployment.chainId);
    
    let currentChainConfig;
    try {
      currentChainConfig = await tbr.read.chainConfig(chainIdToChain(tbrDeployment.chainId));
    } catch (error) {
      if (!(error instanceof Error) || !error.message?.includes("Account does not exist")) throw error;
    }

    const peerUniversalAddress = new UniversalAddress(tbrDeployment.address);

    if (!currentChainConfig) {
      log('Registering peer on chain', tbrDeployment.chainId);
      const ix = await tbr.registerPeer(
        signerKey,
        chainIdToChain(tbrDeployment.chainId),
        peerUniversalAddress.address,
      );
      const tx = await ledgerSignAndSend(connection, [ix], []);
      log(`Register succeeded on tx: ${tx}`);
    } else {
      const currentPeer = new UniversalAddress(new Uint8Array(currentChainConfig.canonicalPeer));

      if (!currentPeer.equals(peerUniversalAddress)) {
        log(`Updating peer for chain ${tbrDeployment.chainId} from ${currentPeer} to ${peerUniversalAddress}`);
        const ix = await tbr.updateCanonicalPeer(
          signerKey,
          chainIdToChain(tbrDeployment.chainId),
          peerUniversalAddress.address,
        );
        const tx = await ledgerSignAndSend(connection, [ix], []);
        log(`Update succeeded on tx: ${tx}`);
      }
    }

    if (!currentChainConfig || currentChainConfig.maxGasDropoffMicroToken.toString() !== desiredChainConfig.maxGasDropoff) {
      await log(`Updating maxGasDropoff on chain ${tbrDeployment.chainId} to ${desiredChainConfig.maxGasDropoff}`);
      const ix = await tbr.updateMaxGasDropoff(signerKey, chainIdToChain(tbrDeployment.chainId), parseInt(desiredChainConfig.maxGasDropoff));
      const tx = await ledgerSignAndSend(connection, [ix], []);
      log(`Update succeeded on tx: ${tx}`);
    }

    if (!currentChainConfig || currentChainConfig.relayerFeeMicroUsd !== desiredChainConfig.relayFee) {
      await log(`Updating relayerFee on chain ${tbrDeployment.chainId} to ${desiredChainConfig.relayFee}`);
      const ix = await tbr.updateRelayerFee(signerKey, chainIdToChain(tbrDeployment.chainId), desiredChainConfig.relayFee);
      const tx = await ledgerSignAndSend(connection, [ix], []);
      log(`Update succeeded on tx: ${tx}`);
    };
  }
}
