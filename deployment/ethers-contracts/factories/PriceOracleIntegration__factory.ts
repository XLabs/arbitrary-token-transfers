/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type {
  PriceOracleIntegration,
  PriceOracleIntegrationInterface,
} from "../PriceOracleIntegration";

const _abi = [
  {
    type: "error",
    name: "InvalidAddress",
    inputs: [],
  },
] as const;

export class PriceOracleIntegration__factory {
  static readonly abi = _abi;
  static createInterface(): PriceOracleIntegrationInterface {
    return new Interface(_abi) as PriceOracleIntegrationInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): PriceOracleIntegration {
    return new Contract(
      address,
      _abi,
      runner
    ) as unknown as PriceOracleIntegration;
  }
}