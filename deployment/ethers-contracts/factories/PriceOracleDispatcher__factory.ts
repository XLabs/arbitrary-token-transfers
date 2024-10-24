/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type {
  PriceOracleDispatcher,
  PriceOracleDispatcherInterface,
} from "../PriceOracleDispatcher";

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
    type: "function",
    name: "exec768",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "get1959",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
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
    type: "function",
    name: "upgrade",
    inputs: [
      {
        name: "implementation",
        type: "address",
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "AdminsUpdated",
    inputs: [
      {
        name: "addr",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "isAdmin",
        type: "bool",
        indexed: false,
        internalType: "bool",
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
    type: "event",
    name: "AssistantUpdated",
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
    type: "event",
    name: "FeeParamsUpdated",
    inputs: [
      {
        name: "chainId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "feeParams",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
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
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ChainNotSupportedByCommand",
    inputs: [
      {
        name: "chainId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "command",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "IdempotentUpgrade",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAccessControlCommand",
    inputs: [
      {
        name: "command",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidAccessControlQuery",
    inputs: [
      {
        name: "query",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidChainId",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidCommand",
    inputs: [
      {
        name: "command",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidData",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidEvmLayout",
    inputs: [
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidMsgValue",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPriceQuery",
    inputs: [
      {
        name: "query",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidQuery",
    inputs: [
      {
        name: "query",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidSender",
    inputs: [],
  },
  {
    type: "error",
    name: "LengthMismatch",
    inputs: [
      {
        name: "encodedLength",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "expectedLength",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "UnsupportedVersion",
    inputs: [
      {
        name: "version",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "UpgradeFailed",
    inputs: [
      {
        name: "revertData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
] as const;

export class PriceOracleDispatcher__factory {
  static readonly abi = _abi;
  static createInterface(): PriceOracleDispatcherInterface {
    return new Interface(_abi) as PriceOracleDispatcherInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): PriceOracleDispatcher {
    return new Contract(
      address,
      _abi,
      runner
    ) as unknown as PriceOracleDispatcher;
  }
}
