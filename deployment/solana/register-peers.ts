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

const registerPeersSolanaTbr: SolanaScriptCb = async function (
  operatingChain,
  signer,
  log,
) {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(operatingChain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(operatingChain.name));
  if (solanaDependencies === undefined) {
    throw new Error(`No dependencies found for chain ${chainToChainId(operatingChain.name)}`);
  }
  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  for (const tbrDeployment of contracts['TbrV3Proxies']) {
    const peerChainName = chainIdToChain(tbrDeployment.chainId);
    // skip self registration
    if (tbrDeployment.chainId === chainToChainId(operatingChain.name)) continue;

    const desiredChainConfig = await getChainConfig<EvmTbrV3Config>(
      'tbr-v3',
      tbrDeployment.chainId,
    );

    let currentChainConfig: ChainConfigEntry | undefined;
    try {
      const peerChainConfig = await tbr.account.chainConfig(peerChainName).fetch();
      currentChainConfig = {
        ...peerChainConfig,
        canonicalPeer: new UniversalAddress(Uint8Array.from(peerChainConfig.canonicalPeer))
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message?.includes('Account does not exist'))
        throw error;
    }

    const peerUniversalAddress = new UniversalAddress(tbrDeployment.address);

    if (!currentChainConfig) {
      log('Registering peer on chain', tbrDeployment.chainId);
      const ixs = await tbr.registerFirstPeer(
        signerKey,
        peerChainName,
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
      let peerAccount;
      try {
        peerAccount = await tbr.account.peer(peerChainName, peerUniversalAddress).fetch();
      } catch(error) {
        if (!(error instanceof Error) || !error.message?.includes('Account does not exist'))
          throw error;
      };
      if (peerAccount === undefined) {
        // TODO: register additional peer
      } else {
        log(`Peer is already registered for ${tbrDeployment.chainId}, skipping.`);
      }
    }
  }
}

runOnSolana('register-peers-solana-tbr', registerPeersSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log('extra logs', error.getLogs());
});
