import { SolanaTokenBridgeRelayer } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { runOnSolana, getConnection } from '../helpers/solana.js';
import { SolanaScriptCb } from '../helpers/interfaces.js';
import { dependencies } from '../helpers/env.js';

const readConfigSolanaTbr: SolanaScriptCb = async function (
    chain,
) {
    const connection = getConnection(chain);
    const solanaDependencies = dependencies.find((d) => d.chainId === chainToChainId(chain.name));
    if (solanaDependencies === undefined) {
        throw new Error(`No dependencies found for chain ${chainToChainId(chain.name)}`);
    }
    const tbr = await SolanaTokenBridgeRelayer.create(connection)
    const allChainConfig = await tbr.read.allChainConfigs()

    const translatedConfigs = allChainConfig.map((config) => {
        if (config) {
            return {
                ...config,
                canonicalPeer: config.canonicalPeer.toString(),

                // we convert back to decimal as it's defined in the configuration file.
                maxGasDropoffMicroToken: config.maxGasDropoffMicroToken / 1e6,
            };
        }
        return config;
    });

    console.log(translatedConfigs);
}

runOnSolana('read-config', readConfigSolanaTbr).catch((error) => {
    console.error('Error executing script: ', error);
});
