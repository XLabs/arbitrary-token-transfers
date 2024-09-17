import { ChainConfig } from "../helpers";

export type BaseTbrV3Config = ChainConfig & {
  owner?: string;
  admin?: string;
  feeRecipient?: string;
  relayFee: number;
  maxGasDropoff: string;  
}

// TODO: in reality this should limit ChainConfig to only containing evm chain ids..
export type EvmTbrV3Config = BaseTbrV3Config & {
  initGasErc20TokenizationIsExplicit: boolean;
  txSizeSensitive: boolean;
};

// TODO: in reality this should limit ChainConfig to only containing solana chain ids..
export type SolanaTbrV3Config = BaseTbrV3Config & {
  evmTransactionGas: string;
  evmTransactionSize: string;
};