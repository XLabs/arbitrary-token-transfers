import { chainIdToChain, chainToChainId } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import {
  ChainConfigAccountData,
  SolanaTokenBridgeRelayer,
  PeerAccountData
} from '@xlabs-xyz/solana-arbitrary-token-transfers';
import {
  getConnection,
  ledgerSignAndSend,
  runOnSolana,
  PriorityFeePolicy
} from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getEnvOrDefault } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { contracts } from '../helpers/index.js';
import { getChainConfig } from '../helpers/env.js';
import { EvmTbrV3Config } from '../config/config.types.js';

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

    const peerUniversalAddress = new UniversalAddress(tbrDeployment.address);
    const peerAccount = await tbr.tryRead.peer(peerChainName, peerUniversalAddress);
    if (peerAccount === PeerAccountData.NotInitialized) {
      log(`Peer is already registered from chain ${peerChainName}, skipping.`);
      continue;
    }

    const currentChainConfig = await tbr.tryRead.chainConfig(peerChainName);
    const ixs = [];

    if (currentChainConfig === ChainConfigAccountData.NotInitialized) {
      ixs.push(...await tbr.registerFirstPeer(
        signerKey,
        peerChainName,
        peerUniversalAddress,
        {
          maxGasDropoffMicroToken: Number(desiredChainConfig.maxGasDropoff) * 10 ** 6,
          relayerFeeMicroUsd: desiredChainConfig.relayFee,
          // TODO: have this be configurable?
          pausedOutboundTransfers: false,
        }
      ));
    } else {
      ixs.push(await tbr.registerAdditionalPeer(signerKey, peerChainName, peerUniversalAddress, currentChainConfig))
    }

    log(`Registering peer from chain ${peerChainName}`);
    const tx = await ledgerSignAndSend(connection, ixs, [], { lockedWritableAccounts: [], priorityFeePolicy });
    log(`Register peer from chain ${peerChainName} succeeded on tx: ${tx}`);
  }
}

runOnSolana('register-peers-solana-tbr', registerPeersSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log('extra logs', error.getLogs());
});
