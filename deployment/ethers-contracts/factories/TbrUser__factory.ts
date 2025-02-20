/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { TbrUser, TbrUserInterface } from "../TbrUser";

const _abi = [
  {
    inputs: [],
    name: "GasTokenNotSupported",
    type: "error",
  },
  {
    inputs: [],
    name: "GasTokenOnlyAcceptedViaWithdrawal",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidAddress",
    type: "error",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const;

export class TbrUser__factory {
  static readonly abi = _abi;
  static createInterface(): TbrUserInterface {
    return new Interface(_abi) as TbrUserInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): TbrUser {
    return new Contract(address, _abi, runner) as unknown as TbrUser;
  }
}
