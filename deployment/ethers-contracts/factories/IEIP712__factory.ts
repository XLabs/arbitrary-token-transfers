/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { IEIP712, IEIP712Interface } from "../IEIP712";

const _abi = [
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
] as const;

export class IEIP712__factory {
  static readonly abi = _abi;
  static createInterface(): IEIP712Interface {
    return new Interface(_abi) as IEIP712Interface;
  }
  static connect(address: string, runner?: ContractRunner | null): IEIP712 {
    return new Contract(address, _abi, runner) as unknown as IEIP712;
  }
}
