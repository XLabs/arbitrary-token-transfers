import { Commitment } from "@solana/web3.js";
import { Chain, ChainId } from "@wormhole-foundation/sdk-base";
import { ethers } from "ethers";
import { SolanaSigner } from "./solana";

export type EvmScriptCb = (chain: EvmChainInfo, signer: ethers.Signer, logFn: LoggerFn) => Promise<void>;
export type SolanaScriptCb = (chain: SolanaChainInfo, signer: SolanaSigner, logFn: LoggerFn) => Promise<void>;

export type LoggerFn = (...args: any[]) => void;

export type EvmChainInfo = ChainInfo & {
  /**
   * Native (e.g. EIP-155) ChainId
   */
  externalId?: string;
}

export type SolanaChainInfo = ChainInfo & {
  commitmentLevel: Commitment;
};

export type ChainInfo = {
  name: string;
  chainId: ChainId; // wormhole chain id
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

export type SolanaTbrInitParams = {
  owner: string;
  feeRecipient: string;
  admins: string[];
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
export type BigNumberDiff = ValueDiff<BigInt>;
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