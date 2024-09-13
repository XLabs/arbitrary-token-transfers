import { ChainConfig } from "../helpers";

export type Tbrv3Config = ChainConfig & {
  owner?: string;
  admin?: string;
  feeRecipient?: string;
  oracleVersion: 0;
  initGasErc20TokenizationIsExplicit: boolean;
  relayFee: number;
  maxGasDropoff: bigint;
  txSizeSensitive: boolean;
};