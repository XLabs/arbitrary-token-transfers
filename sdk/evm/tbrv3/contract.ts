import {
  RoArray,
  MapLevels,
  Chain,
  Network,
  serializeLayout,
  deserializeLayout,
  chainToPlatform,
  encoding,
  constMap,
  PlatformToChains,
} from "@wormhole-foundation/sdk-base";
import {
  keccak256,
  layoutItems,
  resolveWrappedToken,
  serialize,
  UniversalAddress,
  VAA,
} from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import {
  RelayingFeeParams,
  TransferTokenWithRelay,
  TransferGasTokenWithRelay,
  ConfigQuery,
  RootCommand,
  RootQuery,
  TBRv3MessageLayout,
  RelayingFeeReturn,
  BaseRelayingConfigReturn,
  AllowanceTokenBridgeReturn,
  baseFeeItem,
  gasDropoffItem,
  proxyConstructorLayout,
  queryParamsLayout,
  relayingFeeReturnLayout,
  baseRelayingConfigReturnLayout,
  allowanceTokenBridgeReturnLayout,
  execParamsLayout,
  peerAddressItem,
} from "./layouts.js";
import {
  AccessControlQuery,
  AdminsQueryReturn,
  adminsQueryReturnLayout,
} from "./solidity-sdk/access-control.js";
import { evmAddressItem } from "./solidity-sdk/common.js";
import { getCanonicalToken } from "@wormhole-foundation/sdk-base/tokens";

const WHOLE_EVM_GAS_TOKEN_UNITS = 10 ** 18;

export interface PartialTx {
  /**
   * Amount of native token that should be attached to the transaction.
   * Denominated in wei.
   */
  value: bigint;
  /**
   * Calldata of the transaction.
   */
  data: Uint8Array;
  /**
   * Address of the Token Brigde Relayer contract that must be called.
   */
  to: string;
}

export interface RelayingFeeInput {
  /**
   * Token addresses involved in the transfers.
   * Must be hex encoded and '0x' prefixed.
   */
  readonly tokens: RoArray<EvmAddress>;
  /**
   * Transfer parameters.
   * There should be one of these per transfer request.
   */
  readonly transferRequests: RoArray<RelayingFeeParams>;
};

export type TokenBridgeAllowances = Readonly<Record<string, bigint>>;

export type FeeEstimation = RootQuery & { query: "RelayFee" } & RelayingFeeReturn;

export interface RelayingFeeResult {
  allowances: TokenBridgeAllowances;
  feeEstimations: RoArray<FeeEstimation>;
}

export type TransferTokenWithRelayInput =
  TransferTokenWithRelay & {readonly method: "TransferTokenWithRelay";};
export type TransferGasTokenWithRelayInput =
  TransferGasTokenWithRelay & {readonly method: "TransferGasTokenWithRelay";};
export type NetworkMain = Exclude<Network, "Devnet">;

interface ConnectionPrimitives {
  /**
   * Performs an `eth_call` JSON-RPC request with the given tx parameters.
   * @return Raw undecoded array of bytes of the EVM return value.
   */
  readonly ethCall: (partialTx: Omit<PartialTx, "value">) => Promise<Uint8Array>;
}

export interface Transfer {
  /**
   * Fee estimation obtained by calling `relayingFee`.
   * The transaction will encode a max fee based on `feeEstimation.fee`.
   * If you want to overestimate the fee, you should increase it with a multiplier of some kind.
   * Increasing this estimation won't affect the actual cost.
   * Excedent gas tokens will be returned to the caller of the contract.
   */
  feeEstimation: RelayingFeeReturn;
  args: TransferTokenWithRelayInput | TransferGasTokenWithRelayInput;
};

// prettier-ignore
export const addresses = [[
  // TODO: update `Tbrv3.connect` parameter type when adding mainnet addresses.
  "Mainnet", [
  ]], [
  "Testnet", [
    ["Solana",          "ATtNvUvPZ3RU78P8Z5NuwHMTwQ8u8YsDWJ6YN6XvCErS"],
    ["Avalanche",       "0x2BCC362643B0aa3b2608de68b2C2ef2e6eFd2bb6"],
    ["Celo",            "0xAafD9ED1B11b1E1Bf08094Fa0E53e4eEa807B5D5"],
    ["Sepolia",         "0xDc74c34F88d17895e31792439eaCE7cB1ed17d3a"],
    ["ArbitrumSepolia", "0x7Ab71581b33948DdD07a4995a594d631BC4D2988"],
    ["BaseSepolia",     "0xFe8dE1cf8893f0D928F007E787fD072660EAc06B"],
    ["OptimismSepolia", "0x7057447A58b92e2C68A46548B6992203233e92eC"],
  ]],
] as const satisfies MapLevels<[Network, Chain, string]>;

export const tbrV3Contracts = constMap(addresses);
export const tbrV3Chains = tbrV3Contracts.subMap;

type ChainsForNetwork<N extends NetworkMain> = Parameters<ReturnType<typeof tbrV3Chains<N>>>[number];
type EvmChainsForNetwork<N extends NetworkMain> = ChainsForNetwork<N> & PlatformToChains<"Evm">;

export class Tbrv3 {
  /**
   * Creates the initialization configuration for the TBRv3 proxy contract.
   * 
   * @param owner contract owner address, it must be a valid hex evm address
   * @param admin admin address, it must be a valid hex evm address.
   * @param feeRecipient fee recipient address, it must be a valid hex evm address.
   * @returns The serialized layout of the initialization configuration.
   */
  static proxyConstructor(
    owner: EvmAddress,
    admins: EvmAddress[],
    feeRecipient: EvmAddress,
  ) {
    const initConfig = {
      owner,
      admins,
      feeRecipient,
    };

    return serializeLayout(proxyConstructorLayout, initConfig);
  }

  // TODO: update T constraint when adding mainnet addresses.
  static connect<const T extends "Testnet">(
    provider: ConnectionPrimitives,
    network: T,
    chain: EvmChainsForNetwork<T>,
    gasToken?: EvmAddress,
  ) {
    // TODO: remove the need for these casts with an adequate helper from the SDK when there is one.
    const address = tbrV3Contracts(network, chain as any) as string;
    const evmAddress = new EvmAddress(address);
    return this.connectUnknown(provider, network, chain, evmAddress, gasToken);
  }

  static connectUnknown(
    provider: ConnectionPrimitives,
    network: NetworkMain,
    chain: Chain,
    address: EvmAddress,
    gasToken?: EvmAddress,
  ) {
    let defaultGasToken;
    try {
      ([,{address: defaultGasToken}] = resolveWrappedToken(network, chain, "native"));
    } catch {}

    if (gasToken === undefined) {
      if (chain === "Celo") {
        defaultGasToken = getCanonicalToken(network, chain, "CELO")?.address;
      }

      if (defaultGasToken === undefined) {
        throw new Error(`Gas token address needs to be provided for network ${network} and chain ${chain}`);
      }
      gasToken = new EvmAddress(defaultGasToken);
    } else if (defaultGasToken !== undefined && !gasToken.equals(new EvmAddress(defaultGasToken))) {
      throw new Error(`Unexpected gas token address ${gasToken} for network ${network} and chain ${chain}`);
    }

    return new Tbrv3(provider, address, gasToken);
  }

  constructor(
    public readonly provider: ConnectionPrimitives,
    public readonly address: EvmAddress,
    private readonly gasToken: EvmAddress,
  ) {}

  execTx<const C extends RoArray<RootCommand>>(value: bigint, commands: C): PartialTx {
    return {
      to: this.address.toString(),
      value,
      data: encoding.bytes.concat(
        selectorOf("exec768()"),
        serializeLayout(execParamsLayout, { version: 0, commands })
      ),
    };
  }

  async query<const Q extends RoArray<RootQuery>>(queries: Q): Promise<QueryResults<Q>> {
    if (queries.length === 0) return [] as QueryResults<Q>;

    const data = encoding.bytes.concat(
      selectorOf("get1959()"),
      serializeLayout(queryParamsLayout, { version: 0, queries })
    );
    const encodedResults = await this.provider.ethCall({to: this.address.toString(), data });

    if (encodedResults.length === 0)
      throw new Error(
        "Empty result returned by the provider. Please check your config params."
      );

    const decodedResults: any[] = []; 
    const solidityBytesEncodingLayout = [
      //ptr must always point to the next "slot", i.e. 0x20
      { name: "ptr", binary: "uint", size: 32, custom: 32n, omit: true },
      //if the response claims to be longer than 2^32 bytes, something is wrong
      { name: "mustBeZero", binary: "uint", size: 28, custom: 0n, omit: true },
      //the actual length of the response
      { name: "length", binary: "uint", size: 4 },
    ] as const;

    let [bytesHeader, offset] = deserializeLayout(
      solidityBytesEncodingLayout,
      encodedResults,
      { offset: 0, consumeAll: false }
    );

    const deserializeResult = (query: any, layout: any) => {
      const [result, newOffset] = deserializeLayout(layout, encodedResults, {
        offset,
        consumeAll: false,
      });
      decodedResults.push({ ...query, result});
      offset = newOffset;

      if (offset > encodedResults.length)
        throw new Error("Query response too short");
    };

    // If you're updating layouts here, you probably want to update the `QueryResult` type.
    for (const query of queries)
      if (query.query === "RelayFee")
        deserializeResult(query, relayingFeeReturnLayout);
      else if (query.query === "BaseRelayingConfig")
        deserializeResult(query, baseRelayingConfigReturnLayout);
      else if (query.query === "ConfigQueries")
        for (const configQuery of query.queries)
          if (["IsChainSupported", "IsChainPaused", "IsPeer"].includes(configQuery.query))
            deserializeResult(configQuery, layoutItems.boolItem);
          else if (configQuery.query === "BaseFee")
            deserializeResult(configQuery, baseFeeItem);
          else if (configQuery.query === "MaxGasDropoff")
            deserializeResult(configQuery, gasDropoffItem);
          else if (configQuery.query === "CanonicalPeer")
            deserializeResult(configQuery, peerAddressItem)
          else //must be "FeeRecipient"
            deserializeResult(configQuery, evmAddressItem);
      else if (query.query === "AllowanceTokenBridge")
        deserializeResult(query, allowanceTokenBridgeReturnLayout);
      else if (query.query === "AccessControlQueries")
        for (const acquery of query.queries)
          if (acquery.query === "IsAdmin")
            deserializeResult(acquery, layoutItems.boolItem);
          else if (acquery.query === "Admins")
            deserializeResult(acquery, adminsQueryReturnLayout);
          else //must be either "Owner" or "PendingOwner"
            deserializeResult(acquery, evmAddressItem);
      else //must be "Implementation"
        deserializeResult(query, evmAddressItem);

    if (offset < bytesHeader.length)
      throw new Error("Query response too long");

    return decodedResults as QueryResults<Q>;
  }

  //---- convenience functions:

  transferWithRelay(allowances: TokenBridgeAllowances, ...transfers: Transfer[]): PartialTx {
    if (transfers.length === 0)
      throw new Error("At least one transfer should be specified.");

    const requiredAllowances: Record<string, bigint> = {};
    for (const token of Object.keys(allowances))
      requiredAllowances[token] = 0n;

    // TODO: decide if we want to check that requested gas dropoff doesn't exceed max gas dropoff per transfer
    // Here we need to batch `this.baseRelayingParams` per target chain together with the relaying fee per transfer

    let value: bigint = 0n;
    const transferCalls: RootCommand[] = [];
    for (const [i, transfer] of transfers.entries()) {
      if (transfer.feeEstimation.isPaused)
        throw new Error(`Relays to chain ${transfer.args.recipient.chain} are paused. Found in transfer ${i + 1}.`);
      // We are asking for a transfer on an EVM chain, so the gas token used to pay has 18 decimals.
      // Here we need to calculate the amount in wei.
      value += BigInt(transfer.feeEstimation.fee * WHOLE_EVM_GAS_TOKEN_UNITS);

      if (transfer.args.method === "TransferGasTokenWithRelay")
        value += transfer.args.inputAmountInAtomic;

      requiredAllowances[
        (transfer.args.method === "TransferGasTokenWithRelay")
        ? this.gasToken.toString()
        : transfer.args.inputToken.toString()
      ] += transfer.args.inputAmountInAtomic;

      transferCalls.push(
        {...transfer.args, command: transfer.args.method} as RootCommand
      );
    }

    const approveCalls: RootCommand[] = [];
    for (const [token, requiredAllowance] of Object.entries(requiredAllowances)) {
      if (!(token in allowances)) {
        throw new Error(`Token ${token} missing from the allowance queries.`);
      }
      if (requiredAllowance > allowances[token]) {
        approveCalls.push({
          command: "ApproveToken",
          inputToken: new EvmAddress(token),
        });
      }
    }

    return this.execTx(value, [...approveCalls, ...transferCalls]);
  }

  completeTransfer(vaas: VAA<"TokenBridge:TransferWithPayload">[]): PartialTx {
    if (vaas.length === 0) {
      throw new Error("At least one TB VAA should be specified.");
    }

    if (vaas.some(({payload}) => {
      const destinationAddress = payload.to.address.toNative(payload.to.chain);
      // TODO: actually check that this is part of the supported EVM chains
      return chainToPlatform(payload.to.chain) !== "Evm" || !destinationAddress.equals(this.address);
    })) {
      // TODO: point out which one; do a search instead.
      throw new Error("At least one of the VAAs points to an unexpected contract.");
    }

    let value: bigint = 0n;
    for (const vaa of vaas) {
      const tbrv3Message = deserializeLayout(TBRv3MessageLayout, vaa.payload.payload);
      // We are redeeming on an EVM chain so the gas token has 18 decimals.
      // Here we need to calculate the amount in wei.
      value += BigInt(tbrv3Message.gasDropoff * WHOLE_EVM_GAS_TOKEN_UNITS);
    }

    return this.execTx(
      value, 
      vaas.map((vaa) => ({ command: "CompleteTransfer", vaa: serialize(vaa)}))
    );
  }

  /**
   * Queries TBR contract to prepare instructions for a transfer request.
   * In particular, it queries:
   *   the relaying fees needed
   *   the allowance towards the token bridge for each token
   * With these two, a transaction to transfer tokens can be built.
   * Many relays can be quoted at once.
   * The result is a list of quotes for the relays in the same order as they were passed in.
   */
  async relayingFee({tokens, transferRequests}: RelayingFeeInput): Promise<RelayingFeeResult> {
    if (transferRequests.length === 0)
      throw new Error("At least one relay fee query should be specified.");
  
    if (tokens.length === 0)
      throw new Error("At least one token should be specified.");

    const relayFeeQueries = transferRequests.map(arg => ({
      query: "RelayFee",
      targetChain: arg.targetChain,
      gasDropoff: arg.gasDropoff,
    }) as const satisfies RootQuery);

    const allowanceQueries = [...new Set(tokens).values()].map(token => ({
      query: "AllowanceTokenBridge",
      inputToken: token,
    }) as const satisfies RootQuery);

    const queryResults = await this.query([...relayFeeQueries, ...allowanceQueries]);

    const ret = {allowances: {} as Record<string, bigint>, feeEstimations: [] as FeeEstimation[]} satisfies RelayingFeeResult;
    for (const qRes of queryResults)
      if (qRes.query === "RelayFee") {
        const {result, ...args} = qRes;
        ret.feeEstimations.push({...result, ...args});
      }
      else
        ret.allowances[qRes.inputToken.toString()] = qRes.result;

    return ret;
  }
}

const selectorOf = (funcSig: string) => keccak256(funcSig).subarray(0, 4);

type Tuple<T = unknown> = readonly [T, ...T[]] | readonly [];

//always return the passed arguments along with the result
//this makes it easier to match queries to results without having to muck around with types
//  in the client code too.
//Originally, arguments were placed in their own, separate args field, so that there couldn't
//  be a clash if a query argument was named "result", however because Typescript fails to
//  automatically narrow the type of a union like:
//    `{ args: { chain: "foo"}; result: number } | { args: { chain: "bar"}; result: string }`
//  when testing the nested `chain` field i.e.:
//    if (query.args.chain === "foo")
//      type ThisSucks = typeof query.result; //type is number | string - wasn't narrowed
//  we now simply merge the arguments and result into a single object and consider result a
//  reserved field name.
type ArgsResult<A, R> =
  { [K in keyof A | "result"]: K extends "result" ? R : A[Exclude<K, "result">] };

type AccessControlQueryToResult<Q extends AccessControlQuery> =
  Q extends { query: "Owner" | "PendingOwner" }
  ? ArgsResult<Q, EvmAddress>
  : Q extends { query: "IsAdmin" }
  ? ArgsResult<Q, boolean>
  : Q extends { query: "Admins" }
  ? ArgsResult<Q, AdminsQueryReturn>
  : never;

type AccessControlQueryTupleResults<QA extends RoArray<AccessControlQuery>> =
  QA extends readonly [
    infer Head extends AccessControlQuery,
    ...infer Tail extends RoArray<AccessControlQuery>
  ]
  ? [AccessControlQueryToResult<Head>, ...AccessControlQueryTupleResults<Tail>]
  : [];

type AccessControlQueryResults<QA extends RoArray<AccessControlQuery>> =
  QA extends Tuple
  ? AccessControlQueryTupleResults<QA>
  : QA extends RoArray<infer Q extends AccessControlQuery>
  ? AccessControlQueryToResult<Q>[]
  : never;

type ConfigQueryToResult<Q extends ConfigQuery> =
  Q extends { query: "IsChainSupported" | "IsChainPaused" | "IsPeer" }
  ? ArgsResult<Q, boolean>
  : Q extends { query: "BaseFee" | "MaxGasDropoff" }
  ? ArgsResult<Q, number>
  : Q extends { query: "CanonicalPeer" }
  ? ArgsResult<Q, UniversalAddress>
  : Q extends { query: "FeeRecipient" }
  ? ArgsResult<Q, EvmAddress>
  : never;

type ConfigQueryTupleResults<QA extends RoArray<ConfigQuery>> =
  QA extends readonly [
    infer Head extends ConfigQuery,
    ...infer Tail extends RoArray<ConfigQuery>
  ]
  ? [ConfigQueryToResult<Head>, ...ConfigQueryTupleResults<Tail>]
  : [];

type ConfigQueryResults<QA extends RoArray<ConfigQuery>> =
  QA extends Tuple
  ? ConfigQueryTupleResults<QA>
  : QA extends RoArray<infer Q extends ConfigQuery>
  ? ConfigQueryToResult<Q>[]
  : never;

type RootQueryToResults<C extends RootQuery> =
  C extends { query: "RelayFee" }
  ? ArgsResult<C, RelayingFeeReturn>
  : C extends { query: "BaseRelayingConfig" }
  ? ArgsResult<C, BaseRelayingConfigReturn>
  : C extends { query: "ConfigQueries" }
  ? ConfigQueryResults<C["queries"]>
  : C extends { query: "AllowanceTokenBridge" }
  ? ArgsResult<C, AllowanceTokenBridgeReturn>
  : C extends { query: "AccessControlQueries" }
  ? AccessControlQueryResults<C["queries"]>
  : C extends { query: "Implementation" }
  ? ArgsResult<C, EvmAddress>
  : never;

type EnsureTuple<T> = T extends Tuple ? T : [T];
type StripArray<T> = T extends RoArray<infer E> ? E : T;

type RootQueryTupleResults<CA extends RoArray<RootQuery>> =
  CA extends readonly [
    infer Head extends RootQuery,
    ...infer Tail extends RoArray<RootQuery>
  ]
  ? [...EnsureTuple<RootQueryToResults<Head>>, ...RootQueryTupleResults<Tail>]
  : [];

type QueryResults<CA extends RoArray<RootQuery>> =
  CA extends Tuple
  ? RootQueryTupleResults<CA> extends infer R extends RoArray<unknown>
    //if any of the internal queries are not tuples, then we can't return a tuple ourselves
    ? any[] extends R[number]
      ? StripArray<R[number]>[]
      : R
    : never
  : CA extends RoArray<infer C extends RootQuery>
  ? RootQueryToResults<C>[]
  : never;
