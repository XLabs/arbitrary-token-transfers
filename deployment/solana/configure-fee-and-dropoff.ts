import { chainIdToChain, chainToChainId } from '@wormhole-foundation/sdk-base';
import { ChainConfigAccountData, SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { runOnSolana, ledgerSignAndSend, getConnection, PriorityFeePolicy } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies, getEnvOrDefault } from '../helpers/env.js';
import { PublicKey } from '@solana/web3.js';
import { contracts } from '../helpers/index.js';
import { getChainConfig } from '../helpers/env.js';
import { EvmTbrV3Config } from '../config/config.types.js';

const configureFeeDropOffSolanaTbr: SolanaScriptCb = async function (
  operatingChain,
  signer,
  log,
) {
  const signerKey = new PublicKey(await signer.getAddress());
  const connection = getConnection(operatingChain);
  const priorityFeePolicy = getEnvOrDefault('PRIORITY_FEE_POLICY', 'normal') as PriorityFeePolicy;

  const tbr = await SolanaTokenBridgeRelayer.create(connection);

  for (const tbrDeployment of contracts['TbrV3Proxies']) {
    if (tbrDeployment.chainId === chainToChainId(operatingChain.name)) continue; // skip self;
    const peerChain = chainIdToChain(tbrDeployment.chainId);

    const desiredChainConfig = await getChainConfig<EvmTbrV3Config>(
      'tbr-v3',
      tbrDeployment.chainId,
    );
    const currentChainConfig = await tbr.tryRead.chainConfig(peerChain);
    if (currentChainConfig === ChainConfigAccountData.NotInitialized) {
      console.log(`Chain ${peerChain} has no peers. Skipping configuration for this chain.`);
      continue;
    }

    const desiredMaxGasDropoffInMicroTokens = Number(desiredChainConfig.maxGasDropoff) * 10**6;

    console.log(`chain ${tbrDeployment.chainId} current maxGasDropoff: ${currentChainConfig.maxGasDropoffMicroToken.toString()}, desired maxGasDropoff: ${desiredMaxGasDropoffInMicroTokens}`);

    if (
        currentChainConfig.maxGasDropoffMicroToken.toString() !== desiredMaxGasDropoffInMicroTokens.toString()
    ) {
      log(
        `Updating maxGasDropoff on chain ${tbrDeployment.chainId} to ${desiredChainConfig.maxGasDropoff}`,
      );

      // (!) WARN:  maxGasDropoff is in micro-tokens for the Solana TBR, so 
      //            we need to do the correct conversion here.
      const ix = await tbr.updateMaxGasDropoff(
        signerKey,
        peerChain,
        desiredMaxGasDropoffInMicroTokens,
      );
      const tx = await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
      log(`Update succeeded on tx: ${tx}`);
    }

    console.log(`chain ${tbrDeployment.chainId} current relayerFee: ${currentChainConfig.relayerFeeMicroUsd}, desired relayerFee: ${desiredChainConfig.relayFee}`);

    if (
      currentChainConfig.relayerFeeMicroUsd !== desiredChainConfig.relayFee
    ) {
      log(
        `Updating relayerFee on chain ${tbrDeployment.chainId} to ${desiredChainConfig.relayFee}`,
      );
      const ix = await tbr.updateBaseFee(
        signerKey,
        peerChain,
        desiredChainConfig.relayFee,
      );
      const tx = await ledgerSignAndSend(connection, [ix], [], { lockedWritableAccounts: [], priorityFeePolicy });
      log(`Update succeeded on tx: ${tx}`);
    }
  }
}

runOnSolana('configure-fee-and-dropoff-solana-tbr', configureFeeDropOffSolanaTbr).catch((error) => {
  console.error('Error executing script: ', error);
  console.log('extra logs', error.getLogs());
});
