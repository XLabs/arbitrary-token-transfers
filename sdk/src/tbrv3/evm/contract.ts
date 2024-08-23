import { FixedLengthArray, layout, LayoutToType, Network } from "@wormhole-foundation/sdk-base";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { ethers } from "ethers";
import { baseRelayingConfigReturnLayout, BaseRelayingParamsReturn, dispatcherLayout, relayingFeesInputLayout, RelayingFeesReturn, relayingFeesReturnLayout, SupportedChains, supportedChains, transferTokensWithRelayLayout, versionEnvelopeLayout, wrapAndTransferEthWithRelayLayout } from "./layouts";

/**
 * Gives you a type that keeps the properties of `T1` while making both properties common to `T1` and `T2` and properties exclusive to `T2` optional.
 * This is the intersection of these three:
 * T1 ∖ T2
 * Partial(T1 ∖ (T1 ∖ T2))
 * Partial(T2 ∖ T1)
 */
type MakeOptional<T1, T2> = Omit<T1, keyof T2> & Partial<Omit<T1, keyof Omit<T1, keyof T2>>> & Partial<Omit<T2, keyof T1>>;

type Method = LayoutToType<typeof dispatcherLayout>["method"];
type MethodArgs<M extends Method> = Extract<LayoutToType<typeof dispatcherLayout>, { method: M }>;


// /**
//  * @custom:selector 00000eb6
//  */
// function exec768() external payable returns (bytes memory) {
//   return _exec(msg.data[4:]);
// }

// /**
//  * @custom:selector 0008a112
//  */
// function get1959() external view returns (bytes memory) {
//   return _get(msg.data[4:]);
// }
interface Tbrv3Abi {
  exec768: ethers.BaseContractMethod<[], [ ethers.BytesLike ], ethers.ContractTransactionResponse>;
  get1959: ethers.BaseContractMethod<[], [ ethers.BytesLike ], [ ethers.BytesLike ]>;
}
const tbrv3Abi = [
  "function exec768() returns (bytes memory result)",
  "function get1959() view returns (bytes memory responses)",
  // "event Minted(address target)"
];

type EthersContractClass<T> = ReturnType<typeof ethers.BaseContract.buildClass<T>>;
let Tbrv3Contract: EthersContractClass<Tbrv3Abi>;
function getTbrv3Class() {
  if (Tbrv3Contract === undefined) {
    Tbrv3Contract = ethers.BaseContract.buildClass<Tbrv3Abi>(tbrv3Abi);
  }
  return Tbrv3Contract;
}

interface TbrPartialTx {
  /**
   * Amount of native token that should be attached to the transaction.
   * Denominated in wei.
   * It is recommended that an extra margin is attached to the transaction
   * so that it doesn't fail due to a fee change during tx confirmation.
   * Any excedent will be returned to the calling address.
   */
  value: bigint;
  /**
   * Calldata of the transaction.
   */
  calldata: Uint8Array;
  /**
   * Address of the Token Brigde Relayer contract that must be called.
   */
  to: string;
}

type RelayingFeesInput = LayoutToType<typeof relayingFeesInputLayout>;
type NetworkMain = Exclude<Network, "Devnet">;

interface ConnectionPrimitives<T> {
  /**
   * Performs an `eth_call` JSON-RPC request with the given tx parameters.
   * @return Raw undecoded array of bytes of the EVM return value.
   */
  readonly ethCall: (partialTx: TbrPartialTx) => Promise<Uint8Array>;
  /**
   * Signs and sends a tx to the network based on the given tx parameters.
   * @todo do we really need this?
   */
  // readonly sendTx: (partialTx: TbrPartialTx) => Promise<T>;
}

const executeFunction = "exec768";
const queryFunction = "get1959";
type DispatcherFunction = typeof executeFunction | typeof queryFunction;

class Tbrv3 {

  readonly address: string;

  constructor(public readonly provider: ethers.Provider, public readonly network: NetworkMain){
    this.address = Tbrv3.addresses[network];
  }

  static createEnvelopeWithSingleMethodKind<const M extends Method>(method: M, args: MakeOptional<MethodArgs<M>, { method: M }>[]): Uint8Array {
    return layout.serializeLayout(versionEnvelopeLayout, {
      version: "Version0",
      methods: args.map((arg) => ({ ...arg, method } as MethodArgs<M>)),
    });
  }

  static readonly addresses: Record<NetworkMain, string> = {
    Mainnet: "TBD",
    Testnet: "TBD",
  }

  async transferTokensWithRelay(...args: LayoutToType<typeof transferTokensWithRelayLayout>[]): Promise<TbrPartialTx> {
    if (args.length === 0) {
      throw new Error("At least one transfer should be specified.");
    }

    let value = 0n;
    const feeQuery = args.map((transfer) => ({
      targetChain: transfer.recipient.chain,
      gasDropoff: transfer.gasDropoff,
    }));

    const fees = await this.relayingFee(...feeQuery);
    for (const [i, fee] of fees.entries()) {
      if (fee.isPaused) {
        throw new Error(`Relays to chain ${feeQuery[i].targetChain} are paused. Found in transfer ${i + 1}.`);
      }
      value += fee.fee;
    }
    const methods = Tbrv3.createEnvelopeWithSingleMethodKind("TransferTokensWithRelay", args);
    const calldata = Tbrv3.encodeExecute(methods);

    return {
      to: this.address,
      calldata,
      value,
    }
  }
  wrapAndTransferEthWithRelay(...args: LayoutToType<typeof wrapAndTransferEthWithRelayLayout>[]): void { throw new Error("not implemented"); }
  completeTransfer(vaa: Uint8Array): void { throw new Error("not implemented"); }

  /**
   * Queries TBR contract on the relaying fees needed.
   * Many relays can be quoted at once.
   * Each relay needs to be passed in as a separate argument.
   * The result is a list of quotes for the relays in the same order as they were passed in.
   */
  async relayingFee(...args: RelayingFeesInput[]): Promise<RelayingFeesReturn> {
    const queries = Tbrv3.createEnvelopeWithSingleMethodKind("RelayFee", args);
    const calldata = Tbrv3.encodeQuery(queries);
    const result = await this.provider.call({
      data: ethers.hexlify(calldata),
      to: this.address,
    });

    const relayingFeesReturnListLayout = {
      binary: "array",
      length: args.length,
      layout: relayingFeesReturnLayout,
    } as const satisfies FixedLengthArray;
    return layout.deserializeLayout(relayingFeesReturnListLayout, ethers.getBytes(result));
  }

  async baseRelayingParams(...chains: SupportedChains[]): Promise<BaseRelayingParamsReturn> {
    const queries = Tbrv3.createEnvelopeWithSingleMethodKind("BaseRelayingConfig", chains.map((targetChain) => ({targetChain})));
    const calldata = Tbrv3.encodeQuery(queries);
    const result = await this.provider.call({
      data: ethers.hexlify(calldata),
      to: this.address,
    });

    const baseRelayingReturnListLayout = {
      binary: "array",
      length: chains.length,
      layout: baseRelayingConfigReturnLayout,
    } as const satisfies FixedLengthArray;
    return layout.deserializeLayout(baseRelayingReturnListLayout, ethers.getBytes(result));
  }

  static encodeExecute(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher(executeFunction, methods);
  }
  static encodeQuery(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher(queryFunction, methods);
  }

  static encodeForDispatcher(fn: DispatcherFunction, methods: Uint8Array): Uint8Array {
    const Tbrv3Contract = getTbrv3Class();
    const contract = new Tbrv3Contract("0x0000000000000000000000000000000000000000");
    const fnFragment = contract.interface.getFunction(fn);
    if (fnFragment === null) throw new Error(`${fn} function not found in TBRv3 ABI.`);
    const selector = ethers.getBytes(fnFragment.selector);

    const result = new Uint8Array(selector.length + methods.length);
    result.set(selector, 0);
    result.set(methods, selector.length);
    return result;
  }

}

let x: MakeOptional<MethodArgs<"RelayFee">, { method: "RelayFee"}>;
let y: MethodArgs<"Complete">;

(new Tbrv3(undefined as any, "Mainnet")).transferTokensWithRelay({
  acquireMode: {mode: "Preapproved"},
  inputAmount: 1000n,
  gasDropoff: 10n,
  maxFee: 2000n,
  recipient: { chain: "Ethereum", address: toUniversal("Ethereum" ,"0xabababababa")},
  inputToken: "0xabababababa",
});
