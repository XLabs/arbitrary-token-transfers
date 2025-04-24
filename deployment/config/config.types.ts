import { ChainConfig } from "../helpers/index.js";

export type BaseTbrV3Config = ChainConfig & {
  owner?: string;
  admin?: string;
  feeRecipient?: string;
  /**
   * base fee that peers will set for this chain
   * specified in usd
   */
  relayFee: number;
  /**
   * max gas dropoff that peers will set for this chain
   * specified in gas token (i.e. eth, avax, ...)
   */
  maxGasDropoff: string;  
}

// TODO: in reality this should limit ChainConfig to only containing evm chain ids..
export type EvmTbrV3Config = BaseTbrV3Config & {
  initGasErc20TokenizationIsExplicit: boolean;
};

// TODO: in reality this should limit ChainConfig to only containing solana chain ids..
export type SolanaTbrV3Config = BaseTbrV3Config & {
  evmTransactionGas: string;
  evmTransactionSize: string;
};