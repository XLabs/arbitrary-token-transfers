/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { TbrConfig, TbrConfigInterface } from "../TbrConfig";

const _abi = [
  {
    type: "function",
    name: "cancelOwnershipTransfer",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "receiveOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "OwnerUpdated",
    inputs: [
      {
        name: "oldAddress",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "newAddress",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "InvalidAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
] as const;

export class TbrConfig__factory {
  static readonly abi = _abi;
  static createInterface(): TbrConfigInterface {
    return new Interface(_abi) as TbrConfigInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): TbrConfig {
    return new Contract(address, _abi, runner) as unknown as TbrConfig;
  }
}