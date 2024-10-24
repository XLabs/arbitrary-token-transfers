/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { ProxyBase, ProxyBaseInterface } from "../ProxyBase";

const _abi = [
  {
    type: "function",
    name: "checkedUpgrade",
    inputs: [
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "error",
    name: "InvalidData",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidMsgValue",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSender",
    inputs: [],
  },
] as const;

export class ProxyBase__factory {
  static readonly abi = _abi;
  static createInterface(): ProxyBaseInterface {
    return new Interface(_abi) as ProxyBaseInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): ProxyBase {
    return new Contract(address, _abi, runner) as unknown as ProxyBase;
  }
}
