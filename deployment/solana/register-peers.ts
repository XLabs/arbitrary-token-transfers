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

const configureSolanaTbr: SolanaScriptCb = async function (
  chain,
  signer,
  log,
) {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(chain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chainToChainId(chain.name)}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  for (const tbrDeployment of contracts['TbrV3Proxies']) {
    if (tbrDeployment.chainId === chainToChainId(chain.name)) continue; // skip self;

    const desiredChainConfig = await getChainConfig<EvmTbrV3Config>(
      'tbr-v3',
      tbrDeployment.chainId,
    );

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
      log('Registering peer on chain', tbrDeployment.chainId);
      const ixs = await tbr.registerFirstPeer(
        signerKey,
        chainIdToChain(tbrDeployment.chainId),
        peerUniversalAddress,
        {
          maxGasDropoffMicroToken: Number(desiredChainConfig.maxGasDropoff) * 10 ** 6,
          relayerFeeMicroUsd: desiredChainConfig.relayFee,
          // TODO: have this be configurable?
          pausedOutboundTransfers: false,
        }
      );
      const tx = await ledgerSignAndSend(connection, ixs, [], { lockedWritableAccounts: [], priorityFeePolicy });
      log(`Register succeeded on tx: ${tx}`);
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
    }

    if (
      !currentChainConfig ||
      currentChainConfig.maxGasDropoffMicroToken.toString() !== desiredChainConfig.maxGasDropoff
    ) {
      log(
        `Updating maxGasDropoff on chain ${tbrDeployment.chainId} to ${desiredChainConfig.maxGasDropoff}`,
      );

      // (!) WARN:  maxGasDropoff is in micro-tokens for the Solana TBR, so 
      //            we need to do the correct conversion here.
      const ix = await tbr.updateMaxGasDropoff(
        signerKey,
        chainIdToChain(tbrDeployment.chainId),
        Number(desiredChainConfig.maxGasDropoff) * 10**6,
      );
      const tx = await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
      log(`Update succeeded on tx: ${tx}`);
    }

    if (
      !currentChainConfig ||
      currentChainConfig.relayerFeeMicroUsd !== desiredChainConfig.relayFee
    ) {
      log(
        `Updating relayerFee on chain ${tbrDeployment.chainId} to ${desiredChainConfig.relayFee}`,
      );
      const ix = await tbr.updateBaseFee(
        signerKey,
        chainIdToChain(tbrDeployment.chainId),
        desiredChainConfig.relayFee,
      );
      const tx = await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
      log(`Update succeeded on tx: ${tx}`);
    }
  }
}

runOnSolana('configure-tbr', configureSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log('extra logs', error.getLogs());
});
