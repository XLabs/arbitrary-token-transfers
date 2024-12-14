import { Transaction } from '@mysten/sui/transactions'
import { executeTransaction } from './execute.js'
import { buildSuiContract } from './build.js';
import { SuiClient, SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiObject, SuiPackageId } from './types.js';

export type CreatedObjectsAndPackageId = {
    objects: SuiObject[]
    packageId: SuiPackageId
}

export async function deploySuiContract(client: SuiClient, deployer: Ed25519Keypair, directory: string): Promise<SuiTransactionBlockResponse> {
    const { modules, dependencies, stderr } = await buildSuiContract(directory)
    console.log(stderr)
    const tx = new Transaction();
    tx.setSender(deployer.getPublicKey().toSuiAddress());
    tx.setGasBudget(50000000000);
    const upgradeCap = tx.publish({ modules, dependencies });
    tx.transferObjects([upgradeCap], deployer.getPublicKey().toSuiAddress());
    return executeTransaction(client, tx, deployer);
}

export async function getCreatedObjectsFromResponse(client: SuiClient, response: SuiTransactionBlockResponse): Promise<SuiObject[]> {
    const createdObjects = response.effects?.created?.map((c) => c.reference.objectId)
    if (createdObjects === undefined) {
        return []
    }
    return Promise.all(createdObjects.map(async (id) => {
        const response = await client.getObject({id, options: { showType: true }})
        return response.data as SuiObject
    }))
}

export async function getCreatedObjectsAndPackageIdFromResponse(
    client: SuiClient,
    response: SuiTransactionBlockResponse
): Promise<CreatedObjectsAndPackageId> {
    const objects = await getCreatedObjectsFromResponse(client, response)
    const packageId = objects.find((o) => o.type === "package")?.objectId
    if (packageId === undefined) {
        throw new Error("No package was created during deployment")
    }
    return { objects, packageId }
}