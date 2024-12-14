import { SuiClient } from '@mysten/sui/client';
import { SuiAddress, SuiPackageId } from './types.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CreatedObjectsAndPackageId, deploySuiContract, getCreatedObjectsAndPackageIdFromResponse } from './deploy.js';
import { cp, mkdir, writeFile } from 'fs/promises'
import path from 'path'

const tomlTemplate = `[package]
name = $$name
version = $$version
$$edition
$$published_at
[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
$$dependencies
[addresses]
$$addresses
`

const PACKAGE_DIRECTORY = path.join(import.meta.dirname, "../move-build/")

export type Directory = string
export type TomlPackageParams = {
    name: string
    address_name: string
    version: string
    edition?: string
    published_at?: SuiPackageId
    dependencies?: { [key: string]: string }
    addresses?: { [key: string]: SuiAddress }
}

export type DeployedPackages = {
    wormholeCore: CreatedObjectsAndPackageId
    tokenBridge: CreatedObjectsAndPackageId
    xlabs: CreatedObjectsAndPackageId
    oracle: CreatedObjectsAndPackageId
    relayer: CreatedObjectsAndPackageId
}

export function formatToml(params: TomlPackageParams): string {
    return tomlTemplate.replace(
        "$$name", `"${params.name}"`
    ).replace(
        "$$version", `"${params.version}"`
    ).replace(
        "$$edition", params.edition ? `edition = "${params.edition}"` : ""
    ).replace(
        "$$published_at", params.published_at ? `published-at = "${params.published_at}"` : ""
    ).replace(
        "$$dependencies", Object.entries(params.dependencies ?? {}).map(([key, value]) => `${key} = { local = "${value}" }`).join("\n")
    ).replace(
        "$$addresses", Object.entries(params.addresses ?? {}).map(([key, value]) => `${key} = "${value}"`).join("\n")
    )
}

export async function deployLocally(client: SuiClient, deployer: Ed25519Keypair): Promise<DeployedPackages> {
    mkdir(PACKAGE_DIRECTORY, { recursive: true })
    const wormholeCore = await deployWormholeCore(client, deployer)
    const wormholeCoreId = wormholeCore.packageId
    console.log("WORMHOLE CORE DEPLOYED:", wormholeCoreId)
    const tokenBridge = await deployTokenBridge(client, deployer, wormholeCoreId)
    const tokenBridgeId = tokenBridge.packageId
    console.log("TOKEN BRIDGE DEPLOYED:", tokenBridgeId)
    const xlabs = await deployXLabs(client, deployer)
    const xlabsId = xlabs.packageId
    console.log("XLABS DEPLOYED:", xlabsId)
    const oracle = await deployOracle(client, deployer, xlabsId)
    const oracleId = oracle.packageId
    console.log("ORACLE DEPLOYED:", oracleId)
    const relayer = await deployRelayer(client, deployer, wormholeCoreId, tokenBridgeId, xlabsId, oracleId)
    const relayerId = relayer.packageId
    console.log("RELAYER DEPLOYED:", relayerId)
    return { wormholeCore, tokenBridge, xlabs, oracle, relayer }
}

export async function copyProject(projectPath: string, destination: string): Promise<string> {
    const folderName = path.basename(projectPath)
    const projectDest = path.join(destination, folderName)
    await cp(projectPath, projectDest, { recursive: true })
    return projectDest
}

export async function deployLocalProject(
    client: SuiClient,
    deployer: Ed25519Keypair,
    projectPath: string,
    params: TomlPackageParams
): Promise<CreatedObjectsAndPackageId> {
    const projectFolder = await copyProject(projectPath, PACKAGE_DIRECTORY)
    console.log("BUILDING ON FOLDER:", projectFolder)
    const preDeployParams: TomlPackageParams = {
        ...params,
        addresses: {
            ...params.addresses,
            [params.address_name]: "0x0"
        }
    }
    const preDeployToml = formatToml(preDeployParams)
    await writeFile(path.join(projectFolder, "Move.toml"), preDeployToml)
    const response = await deploySuiContract(client, deployer, projectFolder)
    const { objects, packageId } = await getCreatedObjectsAndPackageIdFromResponse(client, response)
    const postDeployParams: TomlPackageParams = {
        ...params,
        published_at: packageId,
        addresses: {
            ...params.addresses,
            [params.address_name]: packageId
        }
    }
    const postDeployToml = formatToml(postDeployParams)
    await writeFile(path.join(projectFolder, "Move.toml"), postDeployToml)
    return { objects, packageId }
}

export async function deployWormholeCore(client: SuiClient, deployer: Ed25519Keypair): Promise<CreatedObjectsAndPackageId> {
    const wormholePath = path.join(import.meta.dirname, "../../../lib/wormhole/sui/wormhole")
    return deployLocalProject(client, deployer, wormholePath, {
        name: "Wormhole",
        address_name: "wormhole",
        version: "0.2.0",
    })
}

export async function deployTokenBridge(client: SuiClient, deployer: Ed25519Keypair, wormholeCoreId: SuiPackageId): Promise<CreatedObjectsAndPackageId> {
    const tokenBridgePath = path.join(import.meta.dirname, "../../../lib/wormhole/sui/token_bridge")
    return deployLocalProject(client, deployer, tokenBridgePath, {
        name: "TokenBridge",
        address_name: "token_bridge",
        version: "0.2.0",
        dependencies: { "Wormhole": "../wormhole" },
        addresses: { "wormhole": wormholeCoreId }
    })
}

export async function deployXLabs(client: SuiClient, deployer: Ed25519Keypair): Promise<CreatedObjectsAndPackageId> {
    const xlabsPath = path.join(import.meta.dirname, "../../../lib/relayer-infra-contracts/src/sui/contracts/xlabs/")
    return deployLocalProject(client, deployer, xlabsPath, {
        name: "xlabs",
        address_name: "xlabs",
        version: "0.1.0",
        edition: "2024.beta"
    })
}

export async function deployOracle(client: SuiClient, deployer: Ed25519Keypair, xlabsId: SuiPackageId): Promise<CreatedObjectsAndPackageId> {
    const oraclePath = path.join(import.meta.dirname, "../../../lib/relayer-infra-contracts/src/sui/contracts/oracle/")
    return deployLocalProject(client, deployer, oraclePath, {
        name: "tbrv3_quoting_oracle",
        address_name: "tbrv3_quoting_oracle",
        version: "0.1.0",
        edition: "2024.beta",
        dependencies: { "xlabs": "../xlabs" },
        addresses: { "xlabs": xlabsId }
    })
}

export async function deployRelayer(
    client: SuiClient,
    deployer: Ed25519Keypair,
    wormholeCoreId: SuiPackageId,
    tokenBridgeId: SuiPackageId,
    xlabsId: SuiPackageId,
    oracleId: SuiPackageId
): Promise<CreatedObjectsAndPackageId> {
    const relayerPath = path.join(import.meta.dirname, "../../../sui/")
    return deployLocalProject(client, deployer, relayerPath, {
        name: "tbrv3",
        address_name: "tbrv3",
        version: "0.1.0",
        edition: "2024.beta",
        dependencies: {
            "Wormhole": "../wormhole",
            "TokenBridge": "../token_bridge",
            "xlabs": "../xlabs",
            "tbrv3_quoting_oracle": "../oracle",
        },
        addresses: {
            "wormhole": wormholeCoreId,
            "token_bridge": tokenBridgeId,
            "tbrv3_quoting_oracle": oracleId,
            "xlabs": xlabsId,
        }
    })
}