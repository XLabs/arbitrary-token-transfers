import type { Commitment } from "@solana/web3.js";
import type { Chain, ChainId } from "@wormhole-foundation/sdk-base";
import type { ethers } from "ethers";
import type { SolanaSigner } from "./solana";
import type { EvmChain } from "@wormhole-foundation/sdk-evm";

export type EvmScriptCb = (chain: EvmChainInfo, signer: ethers.Signer, logFn: LoggerFn) => Promise<void>;
export type SolanaScriptCb = (chain: SolanaChainInfo, signer: SolanaSigner, logFn: LoggerFn) => Promise<void>;

export type LoggerFn = (...args: any[]) => void;

export interface EvmChainInfo extends CommonChainInfo {
  name: EvmChain["chain"];
  /**
   * Native (e.g. EIP-155) ChainId
   */
  externalId?: string;
}

export interface SolanaChainInfo extends CommonChainInfo {
  name: "Solana";
  commitmentLevel: Commitment;
};

export type ChainInfo = EvmChainInfo | SolanaChainInfo;

export interface CommonChainInfo {
  rpc: string;
  network: "Mainnet" | "Testnet";
};

export type Deployment = {
  /**
   * Wormhole ChainId
   */
  chainId: ChainId;
  address: string;
  constructorArgs: UncheckedConstructorArgs;
};

export type Ecosystem = {
  operatingChains?: number[];
  evm: {
    networks: EvmChainInfo[];
  },
  solana: {
    networks: SolanaChainInfo[];
  }
};

// FIXME: why is this just for Solana?
export type SolanaTbrInitParams = {
  owner: string;
  feeRecipient: string;
  admins: string[];
  evmRelayGas: string;
  evmRelayTxSize: string;
}

export type ContractsJson = Record<string, Deployment[]>;

export interface ChainConfig {
  /**
   * Wormhole ChainId
   */
  chainId: ChainId;
}

export interface Dependencies {
    wormhole: string;
    tokenBridge: string;
    permit2: string;
    oracle: string;
    initGasToken: string;
};

export interface DependenciesConfig extends ChainConfig, Dependencies {};

export interface ValueDiff<T = any> {
  onChain: T;
  offChain: T;
}

export type BooleanDiff = ValueDiff<boolean>;
export type BigNumberDiff = ValueDiff<bigint>;
export type StringDiff = ValueDiff<string>;

export type UncheckedConstructorArgs = readonly any[];

// TODO: this is evm.
export interface VerificationApiKeys extends ChainConfig {
  etherscan: string;
  blockscout?: {
    mainnet: string;
    testnet: string;
  };
  sourcify?: string;
} 

export type TestTransfer = {
  name: string;
  /**
   * Amount to transfer in atomic units
   */
  transferredAmount: string;
  gasDropoffAmount: string;
  unwrapIntent: boolean;
  /**
   * Optional token address for the transfer, 
   * if not present the script will call transfer gas token
   */
  tokenAddress?: string;
  sourceTokenAddress?: string;
  tokenChain: Chain;
  fromChain: Chain;
  toChain: Chain;
  skip: boolean;
};