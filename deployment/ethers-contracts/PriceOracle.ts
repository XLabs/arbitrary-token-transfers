/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  FunctionFragment,
  Result,
  Interface,
  EventFragment,
  AddressLike,
  ContractRunner,
  ContractMethod,
  Listener,
} from "ethers";
import type {
  TypedContractEvent,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedLogDescription,
  TypedListener,
  TypedContractMethod,
} from "./common";

export interface PriceOracleInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "cancelOwnershipTransfer"
      | "checkedUpgrade"
      | "exec768"
      | "get1959"
      | "receiveOwnership"
      | "transferOwnership"
      | "upgrade"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "AdminsUpdated"
      | "AssistantUpdated"
      | "FeeParamsUpdated"
      | "OwnerUpdated"
      | "Upgraded"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "cancelOwnershipTransfer",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "checkedUpgrade",
    values: [BytesLike]
  ): string;
  encodeFunctionData(functionFragment: "exec768", values?: undefined): string;
  encodeFunctionData(functionFragment: "get1959", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "receiveOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "transferOwnership",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "upgrade",
    values: [AddressLike, BytesLike]
  ): string;

  decodeFunctionResult(
    functionFragment: "cancelOwnershipTransfer",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "checkedUpgrade",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "exec768", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "get1959", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "receiveOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "upgrade", data: BytesLike): Result;
}

export namespace AdminsUpdatedEvent {
  export type InputTuple = [
    addr: AddressLike,
    isAdmin: boolean,
    timestamp: BigNumberish
  ];
  export type OutputTuple = [addr: string, isAdmin: boolean, timestamp: bigint];
  export interface OutputObject {
    addr: string;
    isAdmin: boolean;
    timestamp: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace AssistantUpdatedEvent {
  export type InputTuple = [
    oldAddress: AddressLike,
    newAddress: AddressLike,
    timestamp: BigNumberish
  ];
  export type OutputTuple = [
    oldAddress: string,
    newAddress: string,
    timestamp: bigint
  ];
  export interface OutputObject {
    oldAddress: string;
    newAddress: string;
    timestamp: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace FeeParamsUpdatedEvent {
  export type InputTuple = [chainId: BigNumberish, feeParams: BytesLike];
  export type OutputTuple = [chainId: bigint, feeParams: string];
  export interface OutputObject {
    chainId: bigint;
    feeParams: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace OwnerUpdatedEvent {
  export type InputTuple = [
    oldAddress: AddressLike,
    newAddress: AddressLike,
    timestamp: BigNumberish
  ];
  export type OutputTuple = [
    oldAddress: string,
    newAddress: string,
    timestamp: bigint
  ];
  export interface OutputObject {
    oldAddress: string;
    newAddress: string;
    timestamp: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace UpgradedEvent {
  export type InputTuple = [implementation: AddressLike];
  export type OutputTuple = [implementation: string];
  export interface OutputObject {
    implementation: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface PriceOracle extends BaseContract {
  connect(runner?: ContractRunner | null): PriceOracle;
  waitForDeployment(): Promise<this>;

  interface: PriceOracleInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent
  ): Promise<this>;

  cancelOwnershipTransfer: TypedContractMethod<[], [void], "nonpayable">;

  checkedUpgrade: TypedContractMethod<[data: BytesLike], [void], "payable">;

  exec768: TypedContractMethod<[], [string], "payable">;

  get1959: TypedContractMethod<[], [string], "view">;

  receiveOwnership: TypedContractMethod<[], [void], "nonpayable">;

  transferOwnership: TypedContractMethod<
    [newOwner: AddressLike],
    [void],
    "nonpayable"
  >;

  upgrade: TypedContractMethod<
    [implementation: AddressLike, data: BytesLike],
    [void],
    "nonpayable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "cancelOwnershipTransfer"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "checkedUpgrade"
  ): TypedContractMethod<[data: BytesLike], [void], "payable">;
  getFunction(
    nameOrSignature: "exec768"
  ): TypedContractMethod<[], [string], "payable">;
  getFunction(
    nameOrSignature: "get1959"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "receiveOwnership"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "transferOwnership"
  ): TypedContractMethod<[newOwner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "upgrade"
  ): TypedContractMethod<
    [implementation: AddressLike, data: BytesLike],
    [void],
    "nonpayable"
  >;

  getEvent(
    key: "AdminsUpdated"
  ): TypedContractEvent<
    AdminsUpdatedEvent.InputTuple,
    AdminsUpdatedEvent.OutputTuple,
    AdminsUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "AssistantUpdated"
  ): TypedContractEvent<
    AssistantUpdatedEvent.InputTuple,
    AssistantUpdatedEvent.OutputTuple,
    AssistantUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "FeeParamsUpdated"
  ): TypedContractEvent<
    FeeParamsUpdatedEvent.InputTuple,
    FeeParamsUpdatedEvent.OutputTuple,
    FeeParamsUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "OwnerUpdated"
  ): TypedContractEvent<
    OwnerUpdatedEvent.InputTuple,
    OwnerUpdatedEvent.OutputTuple,
    OwnerUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "Upgraded"
  ): TypedContractEvent<
    UpgradedEvent.InputTuple,
    UpgradedEvent.OutputTuple,
    UpgradedEvent.OutputObject
  >;

  filters: {
    "AdminsUpdated(address,bool,uint256)": TypedContractEvent<
      AdminsUpdatedEvent.InputTuple,
      AdminsUpdatedEvent.OutputTuple,
      AdminsUpdatedEvent.OutputObject
    >;
    AdminsUpdated: TypedContractEvent<
      AdminsUpdatedEvent.InputTuple,
      AdminsUpdatedEvent.OutputTuple,
      AdminsUpdatedEvent.OutputObject
    >;

    "AssistantUpdated(address,address,uint256)": TypedContractEvent<
      AssistantUpdatedEvent.InputTuple,
      AssistantUpdatedEvent.OutputTuple,
      AssistantUpdatedEvent.OutputObject
    >;
    AssistantUpdated: TypedContractEvent<
      AssistantUpdatedEvent.InputTuple,
      AssistantUpdatedEvent.OutputTuple,
      AssistantUpdatedEvent.OutputObject
    >;

    "FeeParamsUpdated(uint16,bytes32)": TypedContractEvent<
      FeeParamsUpdatedEvent.InputTuple,
      FeeParamsUpdatedEvent.OutputTuple,
      FeeParamsUpdatedEvent.OutputObject
    >;
    FeeParamsUpdated: TypedContractEvent<
      FeeParamsUpdatedEvent.InputTuple,
      FeeParamsUpdatedEvent.OutputTuple,
      FeeParamsUpdatedEvent.OutputObject
    >;

    "OwnerUpdated(address,address,uint256)": TypedContractEvent<
      OwnerUpdatedEvent.InputTuple,
      OwnerUpdatedEvent.OutputTuple,
      OwnerUpdatedEvent.OutputObject
    >;
    OwnerUpdated: TypedContractEvent<
      OwnerUpdatedEvent.InputTuple,
      OwnerUpdatedEvent.OutputTuple,
      OwnerUpdatedEvent.OutputObject
    >;

    "Upgraded(address)": TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;
    Upgraded: TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;
  };
}