import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { getFaucetHost, requestSuiFromFaucetV1 } from '@mysten/sui/faucet';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { TBRV3 } from './TBRV3.js';

const SUI_NETWORK = 'localnet'

export async function main(): Promise<void> {
    const owner = Ed25519Keypair.generate();
    const deployerAddress = owner.getPublicKey().toSuiAddress();
    const suiClient = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });
    await requestSuiFromFaucetV1({
        host: getFaucetHost(SUI_NETWORK),
        recipient: deployerAddress,
    });
    const admin = Ed25519Keypair.generate();
    await requestSuiFromFaucetV1({
        host: getFaucetHost(SUI_NETWORK),
        recipient: admin.getPublicKey().toSuiAddress(),
    });
    console.log("Deploying contracts...")
    const oracle = await TBRV3.deploy(suiClient, owner);
    console.log("Adding random admin...")
    const addAdminTx = oracle.createTransactionBlock(owner)
    addAdminTx.add_admin(admin.getPublicKey().toSuiAddress())
    await addAdminTx.execute()
    console.log("Updating EVM prices...")
    const evmUpdateBlock = oracle.createTransactionBlock(admin)
    evmUpdateBlock.update_gas_price(1, BigInt(1))
    evmUpdateBlock.update_gas_token_price(1, BigInt(1))
    evmUpdateBlock.update_price_per_byte(1, BigInt(1))
    await evmUpdateBlock.execute()
}

main().then(() => {
    console.log('Done');
}).catch((e) => {
    console.error(e);
})
