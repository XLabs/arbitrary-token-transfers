/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { TbrBase, TbrBaseInterface } from "../TbrBase";

const _abi = [
  {
    type: "error",
    name: "InvalidAddress",
    inputs: [],
  },
] as const;

export class TbrBase__factory {
  static readonly abi = _abi;
  static createInterface(): TbrBaseInterface {
    return new Interface(_abi) as TbrBaseInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): TbrBase {
    return new Contract(address, _abi, runner) as unknown as TbrBase;
  }
}